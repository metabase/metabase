(ns metabase-enterprise.transforms-python.microvm
  "Running one transform in one AWS Lambda MicroVM.

  A MicroVM is a Firecracker VM with its own HTTPS endpoint, launched from a snapshot of our
  image and living up to 8 hours. We launch one per run and terminate it afterwards, so the VM
  is the run's isolation boundary: nothing survives into another run, and cancellation is
  termination rather than something user code has to cooperate with.

  The AWS control-plane calls are isolated behind [[control-plane]] so the wire protocol with
  the VM can be exercised without an AWS account — see the `:local` implementation, which points
  at a stand-in container (`docker compose up microvm` in the runner repo)."
  (:require
   [clj-http.client :as http]
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (java.net URI)
   (java.util.function Consumer)
   (software.amazon.awssdk.http ContentStreamProvider SdkHttpMethod SdkHttpRequest SdkHttpRequest$Builder)
   (software.amazon.awssdk.http.auth.aws.signer AwsV4HttpSigner)
   (software.amazon.awssdk.http.auth.spi.signer SignRequest$Builder SignedRequest)
   (software.amazon.awssdk.identity.spi AwsCredentialsIdentity)))

(set! *warn-on-reflection* true)

(def ^:private status-poll-interval-ms 2000)

;;; ------------------------------------------------- The VM's HTTP protocol -------------------------------------------------

;; This half is independent of how the VM was created, so it is exercised in full against the
;; local stand-in.

(defn- vm-request
  "Call the VM's HTTP surface. `:auth-headers` is the map `CreateMicrovmAuthToken` returns — a
  map rather than a single value because some token schemes need several headers — and AWS
  checks it before traffic ever reaches our server."
  [endpoint method path {:keys [auth-headers] :as opts}]
  (http/request (merge {:method           method
                        :url              (str endpoint "/v1" path)
                        :content-type     :json
                        :accept           :json
                        :as               :json
                        :throw-exceptions false}
                       (dissoc opts :auth-headers)
                       (when (seq auth-headers)
                         {:headers auth-headers}))))

(defn fetch-logs
  "Events logged so far by the job running in the VM at `endpoint`."
  ([endpoint] (fetch-logs endpoint nil))
  ([endpoint auth-headers]
   (vm-request endpoint :get "/logs" {:auth-headers auth-headers})))

(defn run-job!
  "Submit `payload` to the VM at `endpoint` and block until the job finishes.

  `/execute` returns 202 immediately and we poll `/status`: the MicroVM endpoint proxy has no
  documented request timeout, and holding one connection open for the length of a multi-hour
  ingestion run would be betting on an undocumented limit.

  Returns the runner-shaped `{:status <int> :body {:exit_code ..., :timeout ...}}`."
  ([endpoint payload timeout-secs] (run-job! endpoint payload timeout-secs nil))
  ([endpoint payload timeout-secs auth-headers]
   (let [{:keys [status body]} (vm-request endpoint :post "/execute"
                                           {:body (json/encode payload) :auth-headers auth-headers})]
     (if-not (= 202 status)
       {:status (if (= 200 status) 500 status)
        :body   (if (map? body) body {:error (str body)})}
       ;; grace beyond the job's own timeout: the VM still has to upload its events log
       (let [deadline-ms (* 1000 (+ timeout-secs 60))
             result      (u/poll {:thunk       (fn []
                                                 (let [{:keys [body]} (vm-request endpoint :get "/status"
                                                                                  {:auth-headers auth-headers})]
                                                   (when (= "finished" (:state body))
                                                     (:result body))))
                                  :done?       some?
                                  :interval-ms status-poll-interval-ms
                                  :timeout-ms  deadline-ms})]
         (cond
           (nil? result)
           {:status 504
            :body   {:timeout true
                     :error   (str "Timed out waiting for the MicroVM to finish after "
                                   timeout-secs "s (+60s grace)")}}

           (zero? (:exit_code result))
           {:status 200 :body result}

           :else
           {:status 500 :body result}))))))

;;; ------------------------------------------------- Control plane -------------------------------------------------

(defmulti ^:private launch!
  "Start a MicroVM for this run. Returns `{:endpoint <base-url> :auth-headers <map-or-nil>
  :id <opaque>}`."
  {:arglists '([opts])}
  (fn [_opts] (transforms-python.settings/python-microvm-control-plane)))

(defmulti ^:private terminate!
  "Destroy the MicroVM. Must be safe to call twice (cancellation races normal completion)."
  {:arglists '([vm])}
  (fn [_vm] (transforms-python.settings/python-microvm-control-plane)))

;;; --- local: a stand-in container, for development without AWS

(defmethod launch! :local
  [_opts]
  (let [endpoint (transforms-python.settings/python-microvm-endpoint)]
    (when-not endpoint
      (throw (ex-info "python-microvm-endpoint must be set to use the local MicroVM control plane"
                      {:error-type :configuration-error})))
    (log/infof "Using local MicroVM stand-in at %s" endpoint)
    {:endpoint endpoint, :id :local}))

(defmethod terminate! :local
  [_vm]
  ;; Nothing to destroy: the stand-in is a plain container whose lifecycle is the developer's.
  ;; It still admits only one job, so it must be restarted between runs.
  nil)

;;; --- aws: the real thing
;;;
;;; The paths, field names and signing name below were checked against botocore's
;;; `lambda-microvms/2025-09-09` service model, but nothing here has been *executed* against a
;;; real account: no emulator covers this service (LocalStack does not list it, and neither moto
;;; nor SAM CLI implement it), so the first real run is the first test. The endpoint host is a
;;; setting so it can be pointed elsewhere without a code change.

(defn- sigv4-headers
  [{:keys [method url body region]}]
  (let [access-key (transforms-python.settings/python-storage-s-3-access-key)
        secret-key (transforms-python.settings/python-storage-s-3-secret-key)]
    (when-not (and access-key secret-key)
      (throw (ex-info "MicroVM control plane requires AWS credentials for request signing"
                      {:error-type :configuration-error})))
    (let [^SdkHttpRequest$Builder builder (-> (SdkHttpRequest/builder)
                                              (.method (SdkHttpMethod/fromValue (u/upper-case-en (name method))))
                                              (.uri (URI/create url)))
          _       (.putHeader builder "Content-Type" "application/json")
          request (.build builder)
          payload (some-> ^String body ContentStreamProvider/fromUtf8String)
          ^SignedRequest signed
          (.sign (AwsV4HttpSigner/create)
                 (reify Consumer
                   (accept [_ b]
                     (let [^SignRequest$Builder b b]
                       (.identity b (AwsCredentialsIdentity/create access-key secret-key))
                       (.request b request)
                       (when payload (.payload b payload))
                       (.putProperty b AwsV4HttpSigner/SERVICE_SIGNING_NAME "lambda")
                       (.putProperty b AwsV4HttpSigner/REGION_NAME region)))))]
      (into {} (map (fn [[k vs]] [k (first vs)])) (.headers (.request signed))))))

(defn- control-plane-call!
  [method path body]
  (let [region   (or (transforms-python.settings/python-storage-s-3-region) "us-east-1")
        base-url (or (transforms-python.settings/python-microvm-control-plane-endpoint)
                     (str "https://lambda." region ".amazonaws.com"))
        url      (str base-url path)
        body-str (some-> body json/encode)
        headers  (sigv4-headers {:method method :url url :body body-str :region region})
        {:keys [status body]} (http/request (cond-> {:method           method
                                                     :url              url
                                                     :headers          headers
                                                     :as               :json
                                                     :throw-exceptions false}
                                              body-str (assoc :body body-str)))]
    (if (<= 200 status 299)
      body
      (throw (ex-info "MicroVM control plane call failed"
                      {:status status, :path path, :body (str body)})))))

(defmethod launch! :aws
  [{:keys [run-id]}]
  (let [image (transforms-python.settings/python-microvm-image)
        _     (when-not image
                (throw (ex-info "python-microvm-image must be set to use the lambda MicroVM backend"
                                {:error-type :configuration-error})))
        ;; No execution role: everything the VM touches is presigned, so it needs no AWS access
        ;; — and credentials it does not have cannot be read out of it by user code.
        vm    (control-plane-call! :post "/2025-09-09/microvms"
                                   (cond-> {:imageIdentifier          image
                                            :maximumDurationInSeconds (transforms-python.settings/python-runner-timeout-seconds)}
                                     (transforms-python.settings/python-microvm-egress-connector)
                                     (assoc :egressNetworkConnectors
                                            [(transforms-python.settings/python-microvm-egress-connector)])))
        vm-id (:microvmId vm)
        ;; `authToken` is a map of header name -> value: some token schemes need more than one
        token (:authToken (control-plane-call! :post (str "/2025-09-09/microvms/" vm-id "/auth-token")
                                               {:expirationInMinutes 60
                                                :allowedPorts        [{:port 8080}]}))]
    (log/infof "Launched MicroVM %s for run %s" vm-id run-id)
    {:endpoint (:endpoint vm), :auth-headers token, :id vm-id}))

(defmethod terminate! :aws
  [{:keys [id]}]
  (when (and id (not= :local id))
    (try
      (control-plane-call! :delete (str "/2025-09-09/microvms/" id) nil)
      (log/infof "Terminated MicroVM %s" id)
      (catch Exception e
        ;; a VM we cannot destroy keeps billing until its maximum duration, so this is loud
        (log/errorf e "Failed to terminate MicroVM %s" id)))))

(defn with-microvm
  "Launch a MicroVM, call `f` with it, and terminate it no matter how `f` ends.

  `f` receives `{:endpoint :auth-headers :terminate!}`, where `terminate!` is idempotent and
  zero-arg so the caller can also destroy the VM early — that is how cancellation works."
  [opts f]
  (let [vm          (launch! opts)
        terminated? (atom false)
        terminate!* (fn [] (when (compare-and-set! terminated? false true)
                             (terminate! vm)))]
    (try
      (f (assoc vm :terminate! terminate!*))
      (finally
        (terminate!*)))))

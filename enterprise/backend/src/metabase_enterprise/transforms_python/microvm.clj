(ns metabase-enterprise.transforms-python.microvm
  "Running one transform in one AWS Lambda MicroVM: launched for the job, terminated after it."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (java.net URI)
   (java.util.function Consumer)
   (software.amazon.awssdk.auth.credentials AwsSessionCredentials DefaultCredentialsProvider)
   (software.amazon.awssdk.http ContentStreamProvider SdkHttpMethod SdkHttpRequest SdkHttpRequest$Builder)
   (software.amazon.awssdk.http.auth.aws.signer AwsV4HttpSigner)
   (software.amazon.awssdk.http.auth.spi.signer SignRequest$Builder SignedRequest)
   (software.amazon.awssdk.identity.spi AwsCredentialsIdentity AwsSessionCredentialsIdentity)))

(set! *warn-on-reflection* true)

(def ^:private status-poll-interval-ms 2000)

;;; ------------------------------------------------- The VM's HTTP protocol -------------------------------------------------

(defn- vm-url
  "RunMicrovm returns a bare hostname; the local stand-in is configured as a full URL."
  [endpoint path]
  (str (if (str/includes? endpoint "://") endpoint (str "https://" endpoint)) "/v1" path))

(defn- vm-request
  "Call the VM's HTTP surface. `:auth-headers` is the map from `CreateMicrovmAuthToken`, checked
  by AWS before traffic reaches the VM."
  [endpoint method path {:keys [auth-headers] :as opts}]
  (http/request (merge {:method           method
                        :url              (vm-url endpoint path)
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
  "Submit `payload` to the VM at `endpoint` and block until the job finishes, returning the
  runner-shaped `{:status <int> :body {:exit_code ..., :timeout ...}}`.

  `/execute` returns 202 and the result is polled from `/status`; the endpoint proxy has no
  documented request timeout to hold a connection open against."
  ([endpoint payload timeout-secs] (run-job! endpoint payload timeout-secs nil))
  ([endpoint payload timeout-secs auth-headers]
   (let [{:keys [status body]} (vm-request endpoint :post "/execute"
                                           {:body (json/encode payload) :auth-headers auth-headers})]
     (if-not (= 202 status)
       {:status (if (= 200 status) 500 status)
        :body   (if (map? body) body {:error (str body)})}
       ;; grace beyond the job timeout: the VM still has to upload its events log
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
  nil)

;;; --- aws

(defn- signing-identity
  "Credentials for signing control-plane calls: the configured static keys, else the AWS default
  chain. Temporary credentials must keep their session token or the signature is rejected."
  ^AwsCredentialsIdentity []
  (let [access-key (transforms-python.settings/python-microvm-access-key)
        secret-key (transforms-python.settings/python-microvm-secret-key)]
    (if (and access-key secret-key)
      (AwsCredentialsIdentity/create access-key secret-key)
      (let [creds (.resolveCredentials (DefaultCredentialsProvider/create))]
        (if (instance? AwsSessionCredentials creds)
          (AwsSessionCredentialsIdentity/create (.accessKeyId creds)
                                                (.secretAccessKey creds)
                                                (.sessionToken ^AwsSessionCredentials creds))
          (AwsCredentialsIdentity/create (.accessKeyId creds) (.secretAccessKey creds)))))))

(defn- sigv4-headers
  [{:keys [method url body region]}]
  (let [identity (signing-identity)
        ^SdkHttpRequest$Builder builder (-> (SdkHttpRequest/builder)
                                            (.method (SdkHttpMethod/fromValue (u/upper-case-en (name method))))
                                            (.uri (URI/create url)))
        _        (.putHeader builder "Content-Type" "application/json")
        request  (.build builder)
        payload  (some-> ^String body ContentStreamProvider/fromUtf8String)
        ^SignedRequest signed
        (.sign (AwsV4HttpSigner/create)
               (reify Consumer
                 (accept [_ b]
                   (let [^SignRequest$Builder b b]
                     (.identity b identity)
                     (.request b request)
                     (when payload (.payload b payload))
                     (.putProperty b AwsV4HttpSigner/SERVICE_SIGNING_NAME "lambda")
                     (.putProperty b AwsV4HttpSigner/REGION_NAME region)))))]
    ;; keep every value of a multi-valued header: the signature was computed over all of them
    (into {} (map (fn [[k vs]] [k (if (= 1 (count vs)) (first vs) (vec vs))])) (.headers (.request signed)))))

(defn- control-plane-call!
  [method path body]
  (let [region   (or (transforms-python.settings/python-microvm-region)
                     (throw (ex-info "python-microvm-region must be set to use the MicroVM backend"
                                     {:error-type :configuration-error})))
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

(defn- managed-connector
  "ARN of an AWS-managed network connector, e.g. ALL_INGRESS or INTERNET_EGRESS."
  [region name]
  (str "arn:aws:lambda:" region ":aws:network-connector:aws-network-connector:" name))

(defmethod launch! :aws
  [{:keys [run-id]}]
  (let [image (transforms-python.settings/python-microvm-image)
        _     (when-not image
                (throw (ex-info "python-microvm-image must be set to use the lambda MicroVM backend"
                                {:error-type :configuration-error})))
        region (transforms-python.settings/python-microvm-region)
        ;; No execution role: the VM reaches everything by presigned URL, and user code inside it
        ;; can read whatever role it is given.
        max-secs (transforms-python.settings/python-runner-timeout-seconds)
        vm    (control-plane-call! :post "/2025-09-09/microvms"
                                   {:imageIdentifier          image
                                    :maximumDurationInSeconds max-secs
                                    :ingressNetworkConnectors [(or (transforms-python.settings/python-microvm-ingress-connector)
                                                                   (managed-connector region "ALL_INGRESS"))]
                                    :egressNetworkConnectors  [(or (transforms-python.settings/python-microvm-egress-connector)
                                                                   (managed-connector region "INTERNET_EGRESS"))]})
        vm-id (:microvmId vm)
        ;; a map of header name -> value
        ;; the token has to outlive the VM: it authenticates the status and log polling too
        token (:authToken (control-plane-call! :post (str "/2025-09-09/microvms/" vm-id "/auth-token")
                                               {:expirationInMinutes (+ 5 (quot max-secs 60))
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
        ;; an undestroyed VM bills until its maximum duration
        (log/errorf e "Failed to terminate MicroVM %s" id)))))

(defn with-microvm
  "Launch a MicroVM, call `f` with `{:endpoint :auth-headers :terminate!}`, and terminate it no
  matter how `f` ends. `terminate!` is idempotent, so the caller may also end the VM early."
  [opts f]
  (let [vm          (launch! opts)
        terminated? (atom false)
        terminate!* (fn [] (when (compare-and-set! terminated? false true)
                             (terminate! vm)))]
    (try
      (f (assoc vm :terminate! terminate!*))
      (finally
        (terminate!*)))))

(ns metabase-enterprise.transforms-python.api
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [metabase-enterprise.transforms-python.models.python-library :as python-library]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.server.streaming-response :as sr]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io BufferedWriter OutputStream OutputStreamWriter)
   (java.nio.charset StandardCharsets)
   (java.util.concurrent Executors Semaphore)
   (org.apache.commons.lang3.concurrent BasicThreadFactory$Builder)))

(set! *warn-on-reflection* true)

(defn get-python-library-by-path
  "Get Python library details by path for use by other APIs."
  [path]
  (-> (python-library/get-python-library-by-path path)
      api/read-check
      (select-keys [:source :path :created_at :updated_at])))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/library/:path"
  "Get the Python library for user modules."
  [{:keys [path]} :- [:map [:path ms/NonBlankString]]
   _query-params]
  (get-python-library-by-path path))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/library/:path"
  "Update the Python library source code for user modules."
  [{:keys [path]} :- [:map [:path ms/NonBlankString]]
   _query-params
   body :- [:map {:closed true}
            [:source :string]]]
  ;; Check permission directly since this is an upsert endpoint - the library may not exist yet.
  (api/check-403 (perms/has-any-transforms-permission? api/*current-user-id*))
  (python-library/update-python-library-source! path (:source body)))

(def ^:private test-run-response
  [:map
   [:logs :string]
   [:error {:optional true} [:map [:message i18n/LocalizedString]]]
   [:output {:optional true} [:map
                              [:cols [:sequential [:map [:name :string]]]]
                              [:rows [:sequential :any]]]]])

(defn- write-json-body!
  "Write `body` onto `os` as the JSON response body."
  [^OutputStream os body]
  (with-open [writer (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))]
    (json/encode-to body writer {})))

(def ^:private max-concurrent-test-runs 4)

(defonce ^:private test-run-executor
  ;; Own pool rather than the shared streaming one, so a burst of test runs cannot starve query execution.
  (delay
    (Executors/newFixedThreadPool
     max-concurrent-test-runs
     (.build (doto (BasicThreadFactory$Builder.)
               (.namingPattern "transforms-python-test-run-%d")
               (.daemon true))))))

(def ^:private ^Semaphore test-run-semaphore
  ;; Admission has to happen on the request thread: once the streaming response starts, the status code is no longer
  ;; ours to set, so a full pool could not be reported as anything but a committed 200.
  (Semaphore. max-concurrent-test-runs))

(defn- cancel-run-when-client-disconnects! [canceled-chan request-id]
  (a/take! canceled-chan
           (fn [canceled]
             (when canceled
               (u/ignore-exceptions
                 (python-runner/cancel-python-code-http-call!
                  (transforms-python.settings/python-runner-url) request-id))))))

(api.macros/defendpoint :post "/test-run"
  :- (sr/streaming-response-schema test-run-response)
  "Evaluate an ad-hoc python transform on a sample of input data.
  Intended for short runs for early feedback. Input/output/timeout limits apply."
  [_
   _
   {:keys [code
           source_tables
           output_row_limit
           per_input_row_limit]
    :or   {output_row_limit    100
           per_input_row_limit 100}}
   :- [:map
       [:code                                 :string]
       [:source_tables                        [:sequential {:min 1} ::transforms-base.u/source-table-entry]]
       [:output_row_limit    {:optional true} [:and :int [:> 1] [:<= 100]]]
       [:per_input_row_limit {:optional true} [:and :int [:> 1] [:<= 100]]]]]
  (let [table-ids (map :table_id source_tables)
        db-ids    (t2/select-fn-set :db_id [:model/Table :db_id] :id [:in table-ids])]
    (api/check-400 (= (count db-ids) 1) (i18n/deferred-tru "All source tables must belong to the same database."))
    (api/check-403 (perms/has-db-transforms-permission? api/*current-user-id* (first db-ids)))
    (doseq [table-id table-ids]
      (api/check-403 (mi/can-query? :model/Table table-id))))
  ;; NOTE: we do not test database support, as there is no write target.
  (api/check (.tryAcquire test-run-semaphore)
             429 (i18n/tru "Too many Python test runs in progress. Try again in a moment."))
  ;; The runner call blocks for the length of the run, so it streams from our own pool rather than holding a Jetty
  ;; request thread.
  (sr/streaming-response {:content-type "application/json; charset=utf-8"
                          :status       200
                          :executor     @test-run-executor}
                         [os canceled-chan]
    (try
      (let [request-id (u/generate-nano-id)
            _          (cancel-run-when-client-disconnects! canceled-chan request-id)
            result     (python-runner/execute-and-read-output!
                        {:code            code
                         :source-tables   source_tables
                         :per-input-limit per_input_row_limit
                         :row-limit       output_row_limit
                         :timeout-secs    (transforms-python.settings/python-runner-test-run-timeout-seconds)
                         :request-id      request-id})
            logs       (str/join "\n" (map :message (:logs result)))]
        (write-json-body! os
                          (if (= :succeeded (:status result))
                            {:logs   logs
                             :output {:cols (mapv #(select-keys % [:name]) (:cols result))
                                      :rows (:rows result)}}
                            {:logs  logs
                             :error {:message (:message result)}})))
      (finally
        (.release test-run-semaphore)))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transforms-python` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))

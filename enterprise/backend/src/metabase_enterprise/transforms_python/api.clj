(ns metabase-enterprise.transforms-python.api
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.transforms-python.models.python-library :as python-library]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase-enterprise.transforms-python.s3 :as s3]
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

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
  (api/write-check (python-library/get-python-library-by-path path))
  (python-library/update-python-library-source! path (:source body)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/test-run"
  :- [:map
      [:logs :string]
      [:error {:optional true} [:map [:message i18n/LocalizedString]]]
      [:output {:optional true} [:map
                                 [:cols [:sequential [:map [:name :string]]]]
                                 [:rows [:sequential :any]]]]]
  "Evaluate an ad-hoc python transform on a sample of input data.
  Intended for short runs for early feedback. Input/output/timeout limits apply."
  [_
   _
   {:keys [code
           source_tables
           output_row_limit
           per_input_row_limit]
    :or   {output_row_limit 100
           per_input_row_limit 100}}
   :- [:map
       [:code                                 :string]
       [:source_tables                        [:map-of {:min 1} :string :int]]
       [:output_row_limit    {:optional true} [:and :int [:> 1] [:<= 100]]]
       [:per_input_row_limit {:optional true} [:and :int [:> 1] [:<= 100]]]]]
  (let [db-ids (t2/select-fn-set :db_id [:model/Table :db_id] :id [:in (vals source_tables)])]
    (api/check-400 (= (count db-ids) 1) (i18n/deferred-tru "All source tables must belong to the same database."))
    (api/check-403 (perms/has-db-transforms-permission? api/*current-user-id* (first db-ids))))
  ;; NOTE: we do not test database support, as there is no write target.
  (with-open [shared-storage-ref (s3/open-shared-storage! source_tables)]
    (let [server-url  (transforms-python.settings/python-runner-url)
          _           (python-runner/copy-tables-to-s3! {:shared-storage @shared-storage-ref
                                                         :source         {:source-tables source_tables}
                                                         :limit          per_input_row_limit})
          {runner-status :status
           runner-body   :body}
          (python-runner/execute-python-code-http-call!
           {:server-url     server-url
            :code           code
            :request-id     (u/generate-nano-id)
            :table-name->id source_tables
            :timeout-secs   (transforms-python.settings/python-runner-test-run-timeout-seconds)
            :shared-storage @shared-storage-ref})
          events      (python-runner/read-events @shared-storage-ref)
          run-logs    (str/join "\n" (map :message events))]
      (cond
        (:timeout runner-body)
        {:logs  run-logs
         :error {:message (i18n/deferred-tru "Python execution timed out")}}

        (not= 200 runner-status)
        {:logs  run-logs
         :error {:message (i18n/deferred-tru "Python execution failure (exit code {0})" (:exit_code runner-body "?"))}}

        :else
        (let [output-manifest (python-runner/read-output-manifest @shared-storage-ref)]
          {:logs   run-logs
           :output (with-open [in  (python-runner/open-output @shared-storage-ref)
                               rdr (io/reader in)]
                     (let [sample-rows (take output_row_limit (line-seq rdr))
                           {:keys [fields]} output-manifest]
                       {:cols (mapv #(select-keys % [:name]) fields)
                        :rows (mapv json/decode (remove str/blank? sample-rows))}))})))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transforms-python` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))

(ns metabase-enterprise.transforms-javascript.api
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms-javascript.models.javascript-library :as javascript-library]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.permissions.core :as perms]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn get-javascript-library-by-path
  "Get JavaScript library details by path for use by other APIs."
  [path]
  (-> (javascript-library/get-javascript-library-by-path path)
      api/read-check
      (select-keys [:source :path :created_at :updated_at])))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/library/:path"
  "Get the JavaScript library for user modules."
  [{:keys [path]} :- [:map [:path ms/NonBlankString]]
   _query-params]
  (get-javascript-library-by-path path))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/library/:path"
  "Update the JavaScript library source code for user modules."
  [{:keys [path]} :- [:map [:path ms/NonBlankString]]
   _query-params
   body :- [:map {:closed true}
            [:source :string]]]
  ;; Check permission directly since this is an upsert endpoint - the library may not exist yet.
  (api/check-403 (perms/has-any-transforms-permission? api/*current-user-id*))
  (javascript-library/update-javascript-library-source! path (:source body)))

(api.macros/defendpoint :post "/test-run"
  :- [:map
      [:logs :string]
      [:error {:optional true} [:map [:message i18n/LocalizedString]]]
      [:output {:optional true} [:map
                                 [:cols [:sequential [:map [:name :string]]]]
                                 [:rows [:sequential :any]]]]]
  "Evaluate an ad-hoc JavaScript transform on a sample of input data.
  Intended for short runs for early feedback. Input/output/timeout limits apply."
  [_
   _
   {:keys [code
           source_tables
           output_row_limit
           per_input_row_limit]
    :or {output_row_limit 100
         per_input_row_limit 100}}
   :- [:map
       [:code :string]
       [:source_tables [:map-of {:min 1} :string :int]]
       [:output_row_limit {:optional true} [:and :int [:> 1] [:<= 100]]]
       [:per_input_row_limit {:optional true} [:and :int [:> 1] [:<= 100]]]]]
  (let [db-ids (t2/select-fn-set :db_id [:model/Table :db_id] :id [:in (vals source_tables)])]
    (api/check-400 (= (count db-ids) 1) (i18n/deferred-tru "All source tables must belong to the same database."))
    (api/check-403 (perms/has-db-transforms-permission? api/*current-user-id* (first db-ids))))
  ;; NOTE: we do not test database support, as there is no write target.
  (let [result (python-runner/execute-and-read-output!
                {:code code
                 :source-tables source_tables
                 :per-input-limit per_input_row_limit
                 :row-limit output_row_limit
                 :timeout-secs (transforms-python.settings/python-runner-test-run-timeout-seconds)
                 :language "javascript"})
        logs (str/join "\n" (map :message (:logs result)))]
    (if (= :succeeded (:status result))
      {:logs logs
       :output {:cols (mapv #(select-keys % [:name]) (:cols result))
                :rows (:rows result)}}
      {:logs logs
       :error {:message (:message result)}})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transforms-javascript` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))

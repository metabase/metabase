(ns metabase-enterprise.transforms-python.api
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase-enterprise.transforms-runner.models.transform-library :as transform-library]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.permissions.core :as perms]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn get-library-by-path
  "Get library details by path. Type is \"python\" (default), \"javascript\", or \"clojure\"."
  [path type]
  (-> (transform-library/get-library-by-path (or type "python") path)
      api/read-check
      (select-keys [:source :path :created_at :updated_at])))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/library/:path"
  "Get the library for user modules. Pass `?type=javascript` for JavaScript, defaults to Python."
  [{:keys [path]} :- [:map [:path ms/NonBlankString]]
   {:keys [type]} :- [:map [:type {:optional true} [:maybe :string]]]]
  (get-library-by-path path type))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/library/:path"
  "Update the library source code for user modules. Pass `type` in the body for JavaScript."
  [{:keys [path]} :- [:map [:path ms/NonBlankString]]
   _query-params
   body :- [:map
            [:source :string]
            [:type {:optional true} [:maybe :string]]]]
  ;; Check permission directly since this is an upsert endpoint - the library may not exist yet.
  (api/check-403 (perms/has-any-transforms-permission? api/*current-user-id*))
  (let [{:keys [source type]} body]
    (transform-library/update-library-source! (or type "python") path source)))

(api.macros/defendpoint :post "/test-run"
  :- [:map
      [:logs :string]
      [:error {:optional true} [:map [:message i18n/LocalizedString]]]
      [:output {:optional true} [:map
                                 [:cols [:sequential [:map [:name :string]]]]
                                 [:rows [:sequential :any]]]]]
  "Evaluate an ad-hoc transform on a sample of input data.
  Pass `type` as \"javascript\" to run JavaScript; defaults to \"python\".
  Intended for short runs for early feedback. Input/output/timeout limits apply."
  [_
   _
   {:keys [code
           type
           source_tables
           output_row_limit
           per_input_row_limit]
    :or   {output_row_limit    100
           per_input_row_limit 100}}
   :- [:map
       [:code                                 :string]
       [:type {:optional true} [:maybe :string]]
       [:source_tables                        [:map-of {:min 1} :string :int]]
       [:output_row_limit    {:optional true} [:and :int [:> 1] [:<= 100]]]
       [:per_input_row_limit {:optional true} [:and :int [:> 1] [:<= 100]]]]]
  (let [db-ids (t2/select-fn-set :db_id [:model/Table :db_id] :id [:in (vals source_tables)])]
    (doseq [db-id db-ids]
      (api/check-403 (perms/has-db-transforms-permission? api/*current-user-id* db-id))))
  ;; NOTE: we do not test database support, as there is no write target.
  (let [result (python-runner/execute-and-read-output!
                {:code            code
                 :source-tables   source_tables
                 :per-input-limit per_input_row_limit
                 :row-limit       output_row_limit
                 :timeout-secs    (transforms-python.settings/python-runner-test-run-timeout-seconds)
                 :runtime (or type "python")})
        logs   (str/join "\n" (map :message (:logs result)))]
    (if (= :succeeded (:status result))
      {:logs   logs
       :output {:cols (mapv #(select-keys % [:name]) (:cols result))
                :rows (:rows result)}}
      {:logs  logs
       :error {:message (:message result)}})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transforms-python` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))

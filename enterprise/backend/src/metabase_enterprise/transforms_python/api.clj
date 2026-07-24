(ns metabase-enterprise.transforms-python.api
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms-python.connectors :as connectors]
   [metabase-enterprise.transforms-python.models.python-library :as python-library]
   [metabase-enterprise.transforms-python.python-runner :as python-runner]
   [metabase-enterprise.transforms-python.settings :as transforms-python.settings]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.permissions.core :as perms]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util.i18n :as i18n]
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
  ;; Check permission directly since this is an upsert endpoint - the library may not exist yet.
  (api/check-403 (perms/has-any-transforms-permission? api/*current-user-id*))
  (python-library/update-python-library-source! path (:source body)))

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
    :or   {output_row_limit    100
           per_input_row_limit 100}}
   :- [:map
       [:code                                 :string]
       [:source_tables                        [:sequential {:min 1} ::transforms-base.u/source-table-entry]]
       [:output_row_limit    {:optional true} [:and :int [:> 1] [:<= 100]]]
       [:per_input_row_limit {:optional true} [:and :int [:> 1] [:<= 100]]]]]
  (let [db-ids (t2/select-fn-set :db_id [:model/Table :db_id] :id [:in (map :table_id source_tables)])]
    (api/check-400 (= (count db-ids) 1) (i18n/deferred-tru "All source tables must belong to the same database."))
    (api/check-403 (perms/has-db-transforms-permission? api/*current-user-id* (first db-ids))))
  ;; NOTE: we do not test database support, as there is no write target.
  (let [result (python-runner/execute-and-read-output!
                {:code            code
                 :source-tables   source_tables
                 :per-input-limit per_input_row_limit
                 :row-limit       output_row_limit
                 :timeout-secs    (transforms-python.settings/python-runner-test-run-timeout-seconds)})
        logs   (str/join "\n" (map :message (:logs result)))]
    (if (= :succeeded (:status result))
      {:logs   logs
       :output {:cols (mapv #(select-keys % [:name]) (:cols result))
                :rows (:rows result)}}
      {:logs  logs
       :error {:message (:message result)}})))

;;; ------------------------------------------------- Ingestion connectors -------------------------------------------------

(api.macros/defendpoint :get "/connector"
  :- [:sequential [:map
                   [:id :string]
                   [:name :string]
                   [:description :string]
                   [:secret-key :string]
                   [:config-fields [:sequential [:map
                                                 [:key :string]
                                                 [:label :string]
                                                 [:required :boolean]]]]
                   [:default-table :string]
                   [:merge-key [:sequential :string]]
                   [:oauth-configured :boolean]]]
  "List the available ingestion connectors."
  []
  (api/check-403 (perms/has-any-transforms-permission? api/*current-user-id*))
  (vec (connectors/presented-connectors)))

(api.macros/defendpoint :get "/connector/:connector-id/oauth/url"
  :- [:map [:url :string] [:state :string]]
  "Start an OAuth handshake for a connector: returns the provider authorize URL and a state nonce."
  [{:keys [connector-id]} :- [:map [:connector-id ms/NonBlankString]]]
  (api/check-403 (perms/has-any-transforms-permission? api/*current-user-id*))
  (connectors/oauth-url connector-id))

(api.macros/defendpoint :get "/connector/oauth/callback/:connector-id" :- :any
  "OAuth redirect target for connector authorization; exchanges the code and notifies the opener."
  [{:keys [connector-id]} :- [:map [:connector-id ms/NonBlankString]]
   {:keys [code state]}   :- [:map
                              [:code ms/NonBlankString]
                              [:state ms/NonBlankString]]]
  (connectors/handle-oauth-callback! connector-id state code)
  {:status  200
   :headers {"Content-Type" "text/html"}
   :body    (str "<html><body><p>Authorization complete. You can close this window.</p>"
                 "<script>window.opener && window.opener.postMessage("
                 "{type: 'MB_CONNECTOR_OAUTH', state: '" state "'}, window.location.origin);"
                 "window.close();</script></body></html>")})

(api.macros/defendpoint :get "/connector/oauth/status"
  :- [:map [:ready :boolean]]
  "Whether the OAuth handshake for `state` has completed."
  [_route-params
   {:keys [state]} :- [:map [:state ms/NonBlankString]]]
  {:ready (connectors/oauth-state-ready? state)})

(api.macros/defendpoint :post "/connector/:connector-id/connection" :- :map
  "Create an ingestion connection: instantiates the connector template as a python transform."
  [{:keys [connector-id]} :- [:map [:connector-id ms/NonBlankString]]
   _query-params
   body :- [:map
            [:config {:optional true} [:map-of :string :string]]
            [:auth [:map
                    [:token {:optional true} ms/NonBlankString]
                    [:oauth-state {:optional true} ms/NonBlankString]]]
            [:target [:map
                      [:database ms/PositiveInt]
                      [:schema {:optional true} [:maybe :string]]
                      [:table-name {:optional true} ms/NonBlankString]]]
            [:name {:optional true} ms/NonBlankString]]]
  (api/check-403 (perms/has-db-transforms-permission? api/*current-user-id* (get-in body [:target :database])))
  (connectors/create-connection! connector-id body))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transforms-python` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))

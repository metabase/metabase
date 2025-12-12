(ns metabase-enterprise.sandbox.api.user
  "Endpoint(s)for setting user attributes."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.tenants.core :as tenants]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private UserAttributes
  (mu/with-api-error-message
   [:map-of
    :keyword
    :any]
   (deferred-tru "value must be a valid user attributes map (name -> value)")))

;; TODO - not sure we need this endpoint now that we're just letting you edit from the regular `PUT /api/user/:id
;; endpoint
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id/attributes"
  "Update the `login_attributes` for a User."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   {:keys [login_attributes]} :- [:map
                                  [:login_attributes {:optional true} [:maybe UserAttributes]]]]
  (api/check-404 (t2/select-one :model/User :id id))
  (pos? (t2/update! :model/User id {:login_attributes login_attributes})))

(def ^:private max-login-attributes 5000)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/attributes"
  "Fetch a list of possible keys for User `login_attributes`. This includes keys from tenant model
  attributes and keys that have already been set for existing Users."
  []
  (into (tenants/login-attribute-keys)
        (comp
         (mapcat keys)
         (distinct)
         (take max-login-attributes))
        (t2/select-fn-reducible (comp (partial apply merge)
                                      (juxt :jwt_attributes :login_attributes))
                                [:model/User :login_attributes :jwt_attributes]
                                {:where [:or
                                         [:and
                                          [:not= :jwt_attributes nil]
                                          [:not= :jwt_attributes "{}"]]
                                         [:and
                                          [:not= :login_attributes nil]
                                          [:not= :login_attributes "{}"]]]})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/mt/user` routes."
  (api.macros/ns-handler *ns* api/+check-superuser))

(ns metabase-enterprise.scim.v2.api
  "/api/ee/scim/v2/ endpoints. These are the endpoints which implement the SCIM protocol, as opposed to SCIM
  configuration endpoints which are in `metabase-enterprise.scim.api`."
  (:require
   [compojure.core :refer [GET]]
   [metabase.api.common :as api :refer [defendpoint]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

#_(def ^:private group-schema-uri "urn:ietf:params:scim:schemas:core:2.0:Group")
(def ^:private user-schema-uri "urn:ietf:params:scim:schemas:core:2.0:User")

(def SCIMUser
  "Malli schema for a SCIM user"
  [:map
   [:schemas [:sequential ms/NonBlankString]]
   [:id ms/NonBlankString]
   [:userName ms/NonBlankString]
   [:name [:map
           [:givenName string?]
           [:familyName string?]]]
   [:emails [:sequential
             [:map
              [:value ms/NonBlankString]
              [:type {:optional true} [:enum "work" "home" "other"]]
              [:primary {:optional true} boolean?]]]]
   [:active boolean?]])

(mu/defn mb-user->scim :- SCIMUser
  "Given a Metabase user, returns a SCIM user"
  [user]
  {:schemas  [user-schema-uri]
   :id       (:entity_id user)
   :userName (:email user)
   :name     {:givenName  (:first_name user)
              :familyName (:last_name user)}
   :emails   [{:value (:email user)}]
   :active   (:is_active user)
   :groups   {}})

(defendpoint GET "/Users"
  "Fetches a list of users."
  []
  (t2/select :model/User))

(defendpoint GET "/Users/:id"
  "Fetches a single user"
  [id]
  {id ms/PositiveInt}
  (-> (t2/select-one [:model/User :id :first_name :last_name :email :is_active :entity_id]
                     :id id)
      (t2/hydrate :user_group_memberships)
      mb-user->scim))

(api/define-routes)

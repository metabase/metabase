(ns metabase-enterprise.scim.v2.api
  "/api/ee/scim/v2/ endpoints. These are the endpoints which implement the SCIM protocol, as opposed to SCIM
  configuration endpoints which are in `metabase-enterprise.scim.api`."
  (:require
   [compojure.core :refer [GET]]
   [metabase.api.common :as api :refer [defendpoint]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

#_(def ^:private group-schema-uri "urn:ietf:params:scim:schemas:core:2.0:Group")
(def ^:private user-schema-uri "urn:ietf:params:scim:schemas:core:2.0:User")
(def ^:private list-schema-uri "urn:ietf:params:scim:api:messages:2.0:ListResponse")

(def ^:private default-pagination-limit 100)
(def ^:private default-pagination-offset 0)

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

(def SCIMUserList
  "Malli schema for a list of SCIM users"
  [:map
   [:schemas [:sequential ms/NonBlankString]]
   [:totalResults ms/IntGreaterThanOrEqualToZero]
   [:startIndex ms/IntGreaterThanOrEqualToZero]
   [:itemsPerPage ms/IntGreaterThanOrEqualToZero]
   [:Resources [:sequential SCIMUser]]])

(mu/defn mb-user->scim :- SCIMUser
  "Given a Metabase user, returns a SCIM user"
  [user]
  {:schemas  [user-schema-uri]
   :id       (:entity_id user)
   :userName (:email user)
   :name     {:givenName  (:first_name user)
              :familyName (:last_name user)}
   :emails   [{:value (:email user)}]
   :active   (:is_active user)})
   ; :groups   {}})

(def ^:private user-cols
  [:id :first_name :last_name :email :is_active :entity_id])

;; Workaround for the /Users endpoint requiring a `count` query param which shadows the Clojure function
(def ^:private scim-count count)

(defn- filter-clause
  [filter-parameter]
  (let [[_ match] (re-matches #"^userName eq \"(.*)\"$" filter-parameter)]
    (if match
      [:= :email match]
      (throw (ex-info "Unsupported filter parameter" {:filter      filter-parameter
                                                      :status-code 400})))))

(defendpoint GET "/Users"
  "Fetches a list of users."
  [startIndex count filter]
  {startIndex [:maybe ms/IntGreaterThanOrEqualToZero]
   count      [:maybe ms/IntGreaterThanOrEqualToZero]
   filter     [:maybe ms/NonBlankString]}
  (let [limit          (or count default-pagination-limit)
        offset         (or startIndex default-pagination-offset)
        filter-param   (when filter (codec/url-decode filter))
        users          (t2/select (cons :model/User user-cols)
                                  {:where    [:and [:= :type "personal"]
                                                   (when filter-param (filter-clause filter-param))]
                                   :limit    limit
                                   :offset   offset
                                   :order-by [[:id :asc]]})
        results-count  (scim-count users)
        items-per-page (if (< results-count limit) results-count limit)]
    {:schemas      [list-schema-uri]
     :totalResults (t2/count :model/User {:where [:= :type "personal"]})
     :startIndex   offset
     :itemsPerPage items-per-page
     :Resources    (map mb-user->scim users)}))

(defendpoint GET "/Users/:id"
  "Fetches a single user"
  [id]
  {id ms/PositiveInt}
  (-> (t2/select-one (cons :model/User user-cols)
                     :id id
                     {:where [:= :type "personal"]})
      (t2/hydrate :user_group_memberships)
      mb-user->scim))

(api/define-routes)

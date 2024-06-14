(ns metabase-enterprise.scim.v2.api
  "/api/ee/scim/v2/ endpoints. These are the endpoints which implement the SCIM protocol, as opposed to SCIM
  configuration endpoints which are in `metabase-enterprise.scim.api`."
  (:require
   [compojure.core :refer [GET]]
   [metabase.api.common :as api :refer [defendpoint]]
   [metabase.models.user :as user]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(def ^:private user-schema-uri "urn:ietf:params:scim:schemas:core:2.0:User")
(def ^:private list-schema-uri "urn:ietf:params:scim:api:messages:2.0:ListResponse")
(def ^:private error-schema-uri "urn:ietf:params:scim:api:messages:2.0:Error")

(def ^:private default-pagination-limit 100)
(def ^:private default-pagination-offset 0)

(def SCIMUser
  "Malli schema for a SCIM user"
  [:map
   [:schemas [:sequential ms/NonBlankString]]
   [:id {:optional true} ms/NonBlankString]
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

(def ^:private user-cols
  [:id :first_name :last_name :email :is_active :entity_id])

(defn- filter-clause
  [filter-parameter]
  (let [[_ match] (re-matches #"^userName eq \"(.*)\"$" filter-parameter)]
    (if match
      [:= :email match]
      (throw (ex-info "Unsupported filter parameter" {:filter      filter-parameter
                                                      :status-code 400})))))

(defendpoint GET "/Users"
  "Fetches a list of users."
  [:as {{start-index :startIndex c :count filter-param :filter} :params}]
  {start-index  [:maybe ms/IntGreaterThanOrEqualToZero]
   c            [:maybe ms/IntGreaterThanOrEqualToZero]
   filter-param [:maybe ms/NonBlankString]}
  (let [limit          (or c default-pagination-limit)
        offset         (or start-index default-pagination-offset)
        filter-param   (when filter-param (codec/url-decode filter-param))
        where-clause   [:and [:= :type "personal"]
                             (when filter-param (filter-clause filter-param))]
        users          (t2/select (cons :model/User user-cols)
                                  {:where    where-clause
                                   :limit    limit
                                   :offset   offset
                                   :order-by [[:id :asc]]})
        results-count  (count users)
        items-per-page (if (< results-count limit) results-count limit)]
    {:schemas      [list-schema-uri]
     :totalResults (t2/count :model/User {:where where-clause})
     :startIndex   offset
     :itemsPerPage items-per-page
     :Resources    (map mb-user->scim users)}))

(defendpoint GET "/Users/:id"
  "Fetches a single user"
  [id]
  {id ms/NonBlankString}
  (if-let [user (t2/select-one (cons :model/User user-cols)
                               :entity_id id
                               {:where [:= :type "personal"]})]
    (-> user
        #_(t2/hydrate :user_group_memberships)
        mb-user->scim)
    (throw (ex-info "User not found"
                    {:schemas     [error-schema-uri]
                     :detail      "User not found"
                     :status-code 404}))))

(defendpoint POST "/Users"
  "Create a single user"
  [:as {scim-user :body}]
  {scim-user SCIMUser}
  (let [{email :userName name-obj :name is-active? :active} scim-user
        {:keys [givenName familyName]} name-obj
        user {:first_name givenName
              :last_name  familyName
              :email      email
              :is_active  is-active?
              :type       :personal}]
    (when (t2/exists? :model/User :%lower.email (u/lower-case-en email))
      (throw (ex-info "Email address is already in use"
                      {:schemas     [error-schema-uri]
                       :detail      "Email address is already in use"
                       :status-code 409})))
    (let [new-user (t2/with-transaction [_]
                     (user/insert-new-user! user)
                     (-> (t2/select-one (cons :model/User user-cols)
                                        :email (u/lower-case-en email))
                         mb-user->scim))]
      {:status 201
       :body new-user})))

(api/define-routes)

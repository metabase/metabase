(ns metabase-enterprise.scim.v2.api
  "/api/ee/scim/v2/ endpoints. These are the endpoints which implement the SCIM protocol, as opposed to SCIM
  configuration endpoints which are in `metabase-enterprise.scim.api`.

  `v2` in the API path represents the fact that we implement SCIM 2.0."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.scim.db :as scim.db]
   [metabase-enterprise.scim.settings :as scim.settings]
   [metabase.analytics-interface.core :as analytics]
   [metabase.api.macros :as api.macros]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.users.schema :as users.schema]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private user-schema-uri "urn:ietf:params:scim:schemas:core:2.0:User")
(def ^:private group-schema-uri "urn:ietf:params:scim:schemas:core:2.0:Group")
(def ^:private list-schema-uri "urn:ietf:params:scim:api:messages:2.0:ListResponse")
(def ^:private error-schema-uri "urn:ietf:params:scim:api:messages:2.0:Error")

(def ^:private default-pagination-limit 100)
(def ^:private default-pagination-offset 0)

(def SCIMUser
  "Malli schema for a SCIM user. This represents both users returned by the service provider (Metabase)
  as well as users sent by the client (i.e. Okta), with fields marked as optional if they may not be present
  in the latter."
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
              [:type {:optional true} ms/NonBlankString]
              [:primary {:optional true} boolean?]]]]
   [:groups
    {:optional true}
    [:sequential [:map
                  [:value ms/NonBlankString]
                  [:$ref {:optional true} ms/NonBlankString]
                  [:display ms/NonBlankString]]]]
   [:locale {:optional true} [:maybe ms/NonBlankString]]
   [:active {:optional true} boolean?]])

(def SCIMUserList
  "Malli schema for a list of SCIM users"
  [:map
   [:schemas [:sequential ms/NonBlankString]]
   [:totalResults ms/IntGreaterThanOrEqualToZero]
   [:startIndex ms/IntGreaterThanOrEqualToZero]
   [:itemsPerPage ms/IntGreaterThanOrEqualToZero]
   [:Resources [:sequential SCIMUser]]])

(mr/def ::patch-value
  "A single attribute value in a PATCH operation. The strings clients send for booleans are parsed by the handler."
  [:or ms/NonBlankString :boolean])

(def ^:private patch-value?
  (mr/validator ::patch-value))

(def UserPatch
  "Malli schema for a user patch operation"
  [:map
   [:schemas [:sequential ms/NonBlankString]]
   [:Operations
    [:sequential [:map
                  [:op ms/NonBlankString]
                  ;; which attribute the operation targets; `nil` means the value is a map of attribute -> value
                  [:path {:optional true} [:maybe ms/NonBlankString]]
                  ;; dispatched on shape rather than written as `[:or [:map-of ...] ...]`: request decoding would
                  ;; run the `:map-of` decoder over a scalar value and throw
                  [:value [:multi {:dispatch #(if (map? %) :map :scalar)}
                           [:map [:and
                                  [:map-of [:or :keyword :string] :any]
                                  [:fn {:error/message "attribute value must be a non-blank string or a boolean"}
                                   #(every? patch-value? (vals %))]]]
                           [:scalar ::patch-value]]]]]]])

(def SCIMGroup
  "Malli schema for a SCIM group."
  [:map
   [:schemas [:sequential ms/NonBlankString]]
   [:id {:optional true} ms/NonBlankString]
   [:displayName ms/NonBlankString]
   [:members
    {:optional true}
    [:sequential [:map
                  [:value ms/NonBlankString]
                  [:$ref {:optional true} ms/NonBlankString]]]]])

(def SCIMGroupList
  "Malli schema for a list of SCIM groups"
  [:map
   [:schemas [:sequential ms/NonBlankString]]
   [:totalResults ms/IntGreaterThanOrEqualToZero]
   [:startIndex ms/IntGreaterThanOrEqualToZero]
   [:itemsPerPage ms/IntGreaterThanOrEqualToZero]
   [:Resources [:sequential SCIMGroup]]])

(defn- throw-scim-error
  [status message]
  (throw (ex-info message
                  {:schemas     [error-schema-uri]
                   :detail      message
                   :status      status
                   :status-code status})))

(defn- scim-response
  "Wraps an object in a response with the correct SCIM content-type. Status defaults to 200 unless otherwise specified."
  [object & [status]]
  {:status  (or status 200)
   :body    object
   :headers {"Content-Type" "application/scim+json"}})

(defn- do-with-prometheus-counters
  [thunk]
  (try
    (let [response (thunk)]
      (analytics/inc! :metabase-scim/response-ok)
      response)
    (catch Throwable e
      (analytics/inc! :metabase-scim/response-error)
      (throw e))))

(defmacro with-prometheus-counters
  "Macro to wrap SCIM endpoints and automatically increment Prometheus counters to track success and error API
  responses."
  [& body]
  `(do-with-prometheus-counters (fn [] ~@body)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               User operations                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(mi/define-batched-hydration-method add-scim-user-group-memberships
  :scim_user_group_memberships
  "Add to each `user` a list of :user_group_memberships where each item is a map with 2 keys [:name :entity_id]."
  [users]
  (when (seq users)
    (let [user-id->memberships (group-by :user_id (scim.db/user-group-memberships (map u/the-id users)
                                                                                  [(:id (perms/all-users-group))
                                                                                   (:id (perms/admin-group))]))
          membership->group    (fn [membership] (select-keys membership [:name :entity_id]))]
      (for [user users]
        (assoc user :user_group_memberships (->> (user-id->memberships (u/the-id user))
                                                 (map membership->group)
                                                 (sort-by :entity_id)))))))

(mu/defn ^:private mb-user->scim :- SCIMUser
  "Given a Metabase user, returns a SCIM user."
  [user]
  {:schemas  [user-schema-uri]
   :id       (:entity_id user)
   :userName (:email user)
   :name     {:givenName  (:first_name user)
              :familyName (:last_name user)}
   :emails   [{:value (:email user)
               :type    "work"
               :primary true}]
   :groups   (map
              (fn [membership]
                {:value   (:entity_id membership)
                 :$ref    (str (scim.settings/scim-base-url) "/Groups/" (:entity_id membership))
                 :display (:name membership)})
              (:user_group_memberships user))
   :locale   (:locale user)
   :active   (:is_active user)
   :meta     {:resourceType "User"}})

(mu/defn ^:private scim-user->mb :- users.schema/NewUser
  "Given a SCIM user, returns a Metabase user."
  [user]
  (let [{email :userName name-obj :name locale :locale is-active? :active} user
        {:keys [givenName familyName]} name-obj]
    (merge
     {:first_name givenName
      :last_name  familyName
      :email      email
      :is_active  is-active?
      :type       :personal
      :sso_source "scim"}
     (when (and locale (i18n/available-locale? locale))
       {:locale locale}))))

(mu/defn ^:private get-user-by-entity-id
  "Fetches a user by entity ID, or throws a 404"
  [entity-id]
  (or (scim.db/scim-user-by-entity-id entity-id)
      (throw-scim-error 404 "User not found")))

(defn- ^:private user-filter-email
  "The lower-cased email a `userName eq` `filter-parameter` selects."
  [filter-parameter]
  (let [[_ match] (re-matches #"^userName eq \"(.*)\"$" filter-parameter)]
    (if match
      (u/lower-case-en match)
      (throw-scim-error 400 (format "Unsupported filter parameter: %s" filter-parameter)))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/Users"
  "Fetch a list of users."
  [_route-params
   {start-index :startIndex, c :count, filter-param :filter} :- [:map
                                                                 [:startIndex {:optional true} [:maybe ms/PositiveInt]]
                                                                 [:count      {:optional true} [:maybe ms/PositiveInt]]
                                                                 [:filter     {:optional true} [:maybe ms/NonBlankString]]]]
  (with-prometheus-counters
    (let [limit          (or c default-pagination-limit)
          ;; SCIM start-index is 1-indexed, so we need to decrement it here
          offset         (if start-index (dec start-index) default-pagination-offset)
          filter-param   (when filter-param (codec/url-decode filter-param))
          lower-email    (when filter-param (user-filter-email filter-param))
          users          (scim.db/scim-users lower-email limit offset)
          hydrated-users (t2/hydrate users :scim_user_group_memberships)
          results-count  (count hydrated-users)
          items-per-page (if (< results-count limit) results-count limit)
          result         {:schemas      [list-schema-uri]
                          :totalResults (scim.db/scim-user-count lower-email)
                          :startIndex   (inc offset)
                          :itemsPerPage items-per-page
                          :Resources    (map mb-user->scim hydrated-users)}]
      (scim-response result))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get ["/Users/:id" :id #"[^/]+"]
  "Fetch a single user."
  [{:keys [id]} :- [:map
                    [:id ms/NonBlankString]]]
  (with-prometheus-counters
    (-> (get-user-by-entity-id id)
        (t2/hydrate :scim_user_group_memberships)
        mb-user->scim)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/Users"
  "Create a single user."
  [_route-params
   _query-params
   scim-user :- SCIMUser]
  (with-prometheus-counters
    (let [mb-user (scim-user->mb scim-user)
          email   (:email mb-user)]
      (when (scim.db/user-email-exists? email)
        (throw-scim-error 409 "Email address is already in use"))
      (let [new-user (t2/with-transaction [_]
                       (scim.db/insert-user! mb-user)
                       (-> (scim.db/scim-user-by-email email)
                           mb-user->scim))]
        (scim-response new-user 201)))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put ["/Users/:id" :id #"[^/]+"]
  "Update a user."
  [{:keys [id]} :- [:map
                    [:id ms/NonBlankString]]
   _query-params
   scim-user :- SCIMUser]
  (with-prometheus-counters
    (let [updates      (scim-user->mb scim-user)
          email        (-> scim-user :emails first :value)
          current-user (get-user-by-entity-id id)]
      (if (not= email (:email current-user))
        (throw-scim-error 400 "You may not update the email of an existing user.")
        (try
          (t2/with-transaction [_conn]
            (scim.db/update-user! (u/the-id current-user) updates)
            (let [user (-> (scim.db/scim-user-by-entity-id id)
                           mb-user->scim)]
              (scim-response user)))
          (catch Exception e
            (let [message (format "Error updating user: %s" (ex-message e))]
              (throw (ex-info message
                              {:schemas     [error-schema-uri]
                               :detail      message
                               :status      400
                               :status-code 400})))))))))

(defn- patch->boolean
  "SCIM sends `active` as a JSON boolean, but clients in the wild send the strings \"true\"/\"false\" too. Anything
  else is an error rather than a value."
  [path value]
  (cond
    (boolean? value)
    value

    (and (string? value) (contains? #{"true" "false"} (u/lower-case-en value)))
    (Boolean/parseBoolean (u/lower-case-en value))

    :else
    (throw-scim-error 400 (format "Invalid value for %s: %s" path (pr-str value)))))

(defn- patch->user-updates
  [acc path value]
  (if (and (nil? path) (map? value))
    (reduce-kv patch->user-updates acc value)
    (let [path-str (some-> path name)]
      (case path-str
        "active"          (assoc acc :is_active (patch->boolean path-str value))
        "userName"        (assoc acc :email value)
        "name.givenName"  (assoc acc :first_name value)
        "name.familyName" (assoc acc :last_name value)
        (throw-scim-error 400 (format "Unsupported path: %s" path-str))))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :patch ["/Users/:id" :id #"[^/]+"]
  "Activate or deactivate a user. Supports specific replace operations, but not arbitrary patches."
  [{:keys [id]} :- [:map
                    [:id ms/NonBlankString]]
   _query-params
   patch-ops :- UserPatch]
  (with-prometheus-counters
    (t2/with-transaction [_conn]
      (let [user    (get-user-by-entity-id id)
            updates (reduce
                     (fn [acc operation]
                       (let [{:keys [op path value]} operation]
                         (cond-> acc
                           (= (u/lower-case-en op) "replace") (patch->user-updates path value))))
                     {}
                     (:Operations patch-ops))]
        (scim.db/update-user! (u/the-id user) updates)
        (-> (get-user-by-entity-id id)
            mb-user->scim
            scim-response)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                              Group operations                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(mi/define-batched-hydration-method add-scim-group-members
  :scim_group_members
  "Add to each `group` a list of :members where each item is a map with 2 keys [:email :entity_id]."
  [groups]
  (when (seq groups)
    (let [group-id->members (group-by :group_id (scim.db/group-members (map u/the-id groups)))
          group->member     (fn [member] (select-keys member [:email :entity_id]))]
      (for [group groups]
        (assoc group :members (->> (group-id->members (u/the-id group))
                                   (map group->member)
                                   (sort-by :entity_id)))))))

(mu/defn ^:private get-group-by-entity-id
  "Fetches a group by entity ID, or throws a 404. Cannot fetch the Administrators or All Users groups, as these are
  static and cannot be managed via SCIM."
  [entity-id]
  (or (scim.db/scim-group-by-entity-id entity-id [(:id (perms/all-users-group)) (:id (perms/admin-group))])
      (throw-scim-error 404 "Group not found")))

(mu/defn ^:private mb-group->scim :- SCIMGroup
  "Given a Metabase permissions group, returns a SCIM group."
  [group]
  {:schemas     [group-schema-uri]
   :id          (:entity_id group)
   :members     (map
                 (fn [member]
                   {:value   (:entity_id member)
                    :$ref    (str (scim.settings/scim-base-url) "/Users/" (:entity_id member))
                    :display (:email member)})
                 (:members group))
   :displayName (:name group)
   :meta        {:resourceType "Group"}})

(defn- group-filter-name
  "The group name a `displayName eq` `filter-parameter` selects."
  [filter-parameter]
  (let [[_ match] (re-matches #"^displayName eq \"(.*)\"$" filter-parameter)]
    (if match
      match
      (throw (ex-info "Unsupported filter parameter" {:filter      filter-parameter
                                                      :status-code 400})))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/Groups"
  "Fetch a list of groups."
  [_route-params
   {start-index :startIndex, c :count, filter-param :filter}
   :- [:map
       [:startIndex {:optional true} [:maybe ms/PositiveInt]]
       [:count      {:optional true} [:maybe ms/PositiveInt]]
       [:filter     {:optional true} [:maybe ms/NonBlankString]]]]
  (with-prometheus-counters
    (let [limit          (or c default-pagination-limit)
          ;; SCIM start-index is 1-indexed, so we need to decrement it here
          offset         (if start-index (dec start-index) default-pagination-offset)
          filter-param   (when filter-param (codec/url-decode filter-param))
          excluded-ids   [(:id perms/all-users-group) (:id perms/admin-group)]
          group-name     (when filter-param (group-filter-name filter-param))
          groups         (scim.db/scim-groups excluded-ids group-name limit offset)
          results-count  (count groups)
          items-per-page (if (< results-count limit) results-count limit)
          result         {:schemas      [list-schema-uri]
                          :totalResults (scim.db/scim-group-count excluded-ids group-name)
                          :startIndex   (inc offset)
                          :itemsPerPage items-per-page
                          :Resources    (map mb-group->scim groups)}]
      (scim-response result))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get ["/Groups/:id" :id #"[^/]+"]
  "Fetch a single group."
  [{:keys [id]} :- [:map
                    [:id ms/NonBlankString]]]
  (with-prometheus-counters
    (-> (get-group-by-entity-id id)
        (t2/hydrate :scim_group_members)
        mb-group->scim)))

(defn- update-group-membership
  "Updates the membership of `group-id` to be the set of users in the collection `user-entity-ids`."
  [group-id user-entity-ids]
  (let [desired-ids (set (scim.db/user-ids-by-entity-ids user-entity-ids))
        current-ids (set (scim.db/group-member-user-ids group-id))]
    (doseq [user-id (set/difference current-ids desired-ids)]
      (perms/remove-user-from-group! user-id group-id))
    (perms/add-users-to-groups! (for [user-id (set/difference desired-ids current-ids)]
                                  {:group group-id :user user-id}))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/Groups"
  "Create a single group, and populates it if necessary."
  [_route-params
   _query-params
   scim-group :- SCIMGroup]
  (with-prometheus-counters
    (let [group-name (:displayName scim-group)
          entity-ids (map :value (:members scim-group))]
      (when (scim.db/group-name-exists? group-name)
        (throw-scim-error 409 "A group with that name already exists"))
      (t2/with-transaction [_conn]
        (let [new-group (scim.db/insert-group! {:name group-name})]
          (when (seq entity-ids)
            (update-group-membership (:id new-group) entity-ids))
          (-> new-group
              (t2/hydrate :scim_group_members)
              mb-group->scim
              (scim-response 201)))))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put ["/Groups/:id" :id #"[^/]+"]
  "Update a group."
  [{:keys [id]} :- [:map
                    [:id ms/NonBlankString]]
   _query-params
   scim-group :- SCIMGroup]
  (with-prometheus-counters
    (let [group-name (:displayName scim-group)
          entity-ids (map :value (:members scim-group))]
      (t2/with-transaction [_conn]
        (let [group (get-group-by-entity-id id)]
          (scim.db/update-group! (u/the-id group) {:name group-name})
          (when (seq entity-ids)
            (update-group-membership (u/the-id group) entity-ids))
          (-> (get-group-by-entity-id id)
              (t2/hydrate :scim_group_members)
              mb-group->scim
              scim-response))))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete ["/Groups/:id" :id #"[^/]+"]
  "Delete a group."
  [{:keys [id]} :- [:map
                    [:id ms/NonBlankString]]]
  (with-prometheus-counters
    (let [group (get-group-by-entity-id id)]
      (scim.db/delete-group! (u/the-id group))
      (scim-response nil 204))))

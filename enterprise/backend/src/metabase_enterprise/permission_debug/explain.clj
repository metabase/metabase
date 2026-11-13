(ns metabase-enterprise.permission-debug.explain
  "Preview a principal's effective access, and why, without running any query: data permissions per database and
  table, collections in each namespace, and application permissions.

  A principal is a user, a group or a tenant, reduced to a set of group ids and a map of user attributes:

  - a user: their groups and attributes (tenant attributes included), as their own requests would see them;
  - a group: any member of it, so the group plus the magic group every member is in (All Users, or All tenant users
    for a tenant group), with no attributes, since attribute values differ per member;
  - a tenant: any of its users, so the All tenant users group, with the tenant's attributes.

  Every value comes with each group's own value and the group that applies. Across groups the most permissive value
  wins, and a sandbox or connection impersonation applies unless another of the groups, without one of its own, grants
  unrestricted access (`metabase-enterprise.sandbox.api.util/enforce-sandbox?`,
  `metabase-enterprise.impersonation.driver/enforce-impersonations?`)."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.permission-debug.db :as permission-debug.db]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.request.core :as request]
   [metabase.tenants.core :as tenants]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trun tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- Schemas ---------------------------------------------------

(def ^:private PrincipalType
  [:enum "user" "group" "tenant"])

(def ^:private Principal
  [:map {:closed true}
   [:type        PrincipalType]
   [:id          pos-int?]
   [:name        :string]
   [:detail      [:maybe :string]]
   [:superuser   :boolean]
   [:tenant_side :boolean]
   [:groups      [:sequential [:map {:closed true}
                               [:id   pos-int?]
                               [:name :string]]]]
   [:attributes  [:maybe [:map-of :string :any]]]])

(def ^:private Cell
  "One effective value, each group's own value, and the group that applies."
  [:map {:closed true}
   [:value    :string]
   [:group_id [:maybe pos-int?]]
   [:groups   [:sequential [:map {:closed true}
                            [:group_id pos-int?]
                            [:name     :string]
                            [:value    :string]]]]
   [:note     [:maybe :string]]])

(def ^:private Security
  [:map {:closed true}
   [:kind       [:enum "sandbox" "impersonation"]]
   [:group_id   pos-int?]
   [:group_name :string]
   [:rows       :string]
   [:columns    :string]])

(def ^:private TableAccess
  [:map {:closed true}
   [:id                    pos-int?]
   [:schema                [:maybe :string]]
   [:name                  :string]
   [:display_name          [:maybe :string]]
   [:view_data             Cell]
   [:create_queries        Cell]
   [:download_results      Cell]
   [:manage_table_metadata Cell]
   [:security              [:maybe Security]]])

(def DataAccessResponse
  "What [[explain-data-access]] returns."
  [:map {:closed true}
   [:principal Principal]
   [:databases [:sequential [:map {:closed true}
                             [:id              pos-int?]
                             [:name            :string]
                             [:reasons         [:sequential :string]]
                             [:manage_database Cell]
                             [:transforms      Cell]
                             [:tables          [:sequential TableAccess]]]]]])

(def TableUsersResponse
  "What [[explain-table-access-by-user]] returns."
  [:map {:closed true}
   [:table [:map {:closed true}
            [:id            pos-int?]
            [:db_id         pos-int?]
            [:database_name :string]
            [:schema        [:maybe :string]]
            [:name          :string]
            [:display_name  [:maybe :string]]]]
   [:users [:sequential [:map {:closed true}
                         [:principal Principal]
                         [:access    TableAccess]]]]])

(def CollectionNamespace
  "The collection tabs: main collections, shared (tenant) collections, and tenant collections."
  [:enum "default" "shared" "tenant"])

(def CollectionsResponse
  "What [[explain-collection-access]] returns."
  [:map {:closed true}
   [:principal   Principal]
   [:applies     :boolean]
   [:reason      [:maybe :string]]
   [:collections [:sequential [:map {:closed true}
                               [:id     [:maybe [:or pos-int? [:= :root]]]]
                               [:name   :string]
                               [:depth  nat-int?]
                               [:source [:enum "group" "personal" "tenant" "other-tenant"]]
                               [:access Cell]]]]])

(def ApplicationResponse
  "What [[explain-application-access]] returns."
  [:map {:closed true}
   [:principal   Principal]
   [:applies     :boolean]
   [:reason      [:maybe :string]]
   [:permissions [:sequential [:map {:closed true}
                               [:key    [:enum "setting" "monitoring" "subscription"]]
                               [:access Cell]]]]])

(def PrincipalsResponse
  "What [[previewable-principals]] returns."
  (let [Entry [:map {:closed true}
               [:id          pos-int?]
               [:name        :string]
               [:detail      [:maybe :string]]
               [:tenant_side :boolean]]]
    [:map {:closed true}
     [:users   [:sequential Entry]]
     [:groups  [:sequential Entry]]
     [:tenants [:sequential Entry]]]))

;;; ------------------------------------------------- Principals --------------------------------------------------

(defn- user-name
  [{:keys [first_name last_name email]}]
  (or (not-empty (str/trim (str first_name " " last_name))) email))

(defn- user-detail
  [{:keys [email tenant_id]} tenant-names]
  (if tenant_id
    (str (get tenant-names tenant_id) " · " email)
    email))

(defn- group-detail
  [group-id]
  (let [members (permission-debug.db/group-member-count group-id)]
    (trun "{0} member" "{0} members" members)))

(defn- tenant-detail
  [tenant-id]
  (let [users (permission-debug.db/tenant-user-count tenant-id)]
    (trun "{0} user" "{0} users" users)))

(defn- user-principal
  [user-id]
  (let [user (api/check-404 (permission-debug.db/user-for-explain user-id))]
    {:type                   "user"
     :id                     user-id
     :name                   (user-name user)
     :detail                 (user-detail user (permission-debug.db/tenant-names))
     :superuser              (boolean (:is_superuser user))
     :tenant_side            (some? (:tenant_id user))
     :tenant-id              (:tenant_id user)
     :group-ids              (permission-debug.db/user-group-ids user-id)
     ;; the same attributes a request bound to this user reads: tenant attributes, then JWT, then login ones
     :attributes             (request/with-current-user user-id
                               (api/current-user-attributes))
     :personal-collection-id (permission-debug.db/personal-collection-id user-id)}))

(defn- group-principal
  [group-id]
  (let [group-name (api/check-404 (permission-debug.db/group-name group-id))
        tenant?    (permission-debug.db/tenant-group? group-id)]
    {:type        "group"
     :id          group-id
     :name        group-name
     :detail      (group-detail group-id)
     :superuser   (= group-id (:id (perms/admin-group)))
     :tenant_side tenant?
     ;; not a set literal: previewing All Users or All tenant users itself names the same id twice
     :group-ids   (hash-set group-id (:id (if tenant? (perms/all-external-users-group) (perms/all-users-group))))
     :attributes  nil}))

(defn- tenant-principal
  [tenant-id]
  (let [tenant (api/check-404 (permission-debug.db/tenant tenant-id))]
    {:type        "tenant"
     :id          tenant-id
     :name        (:name tenant)
     :detail      (tenant-detail tenant-id)
     :superuser   false
     :tenant_side true
     :tenant-id   tenant-id
     :group-ids   #{(:id (perms/all-external-users-group))}
     :attributes  (tenants/login-attributes {:tenant_id tenant-id})}))

(defn- principal
  "The principal, with `:group-rows`, its groups by name, for the per-group values."
  [principal-type principal-id]
  (let [p (case principal-type
            "user"   (user-principal principal-id)
            "group"  (group-principal principal-id)
            "tenant" (tenant-principal principal-id))]
    (assoc p :group-rows (permission-debug.db/groups (:group-ids p)))))

(defn- principal-response
  [p]
  (-> (select-keys p [:type :id :name :detail :superuser :tenant_side :attributes])
      (assoc :groups (mapv #(select-keys % [:id :name]) (:group-rows p)))))

(mu/defn previewable-principals :- PrincipalsResponse
  "Every user, group and tenant an admin can preview, for the picker."
  []
  (let [tenant-names (permission-debug.db/tenant-names)]
    {:users   (for [user (permission-debug.db/previewable-users)]
                {:id          (:id user)
                 :name        (user-name user)
                 :detail      (user-detail user tenant-names)
                 :tenant_side (some? (:tenant_id user))})
     :groups  (for [group (permission-debug.db/previewable-groups)]
                {:id          (:id group)
                 :name        (:name group)
                 :detail      (group-detail (:id group))
                 :tenant_side (boolean (:is_tenant_group group))})
     :tenants (for [tenant (permission-debug.db/previewable-tenants)]
                {:id          (:id tenant)
                 :name        (:name tenant)
                 :detail      (tenant-detail (:id tenant))
                 :tenant_side true})}))

;;; ---------------------------------------------------- Cells ----------------------------------------------------

(defn- cell
  "Combine each group's value into the one that applies: the highest by `rank`, ties to the first group by name.
  `value-of` takes a group row and returns its value as a keyword."
  [group-rows value-of rank]
  (let [entries (mapv (fn [{:keys [id name] :as group}]
                        {:group_id id :name name :value (u/qualified-name (value-of group))})
                      group-rows)
        winner  (reduce (fn [best entry]
                          (if (> (rank (:value entry)) (rank (:value best))) entry best))
                        (first entries)
                        entries)]
    {:value    (:value winner)
     :group_id (:group_id winner)
     :groups   entries
     :note     nil}))

(def ^:private view-data-rank
  "Mirrors `data-perms/coalesce` for view data, with a sandbox or impersonation just below unrestricted: a group that
  grants unrestricted access without one lifts it."
  {"unrestricted" 4 "sandboxed" 3 "impersonated" 2 "blocked" 1 "legacy-no-self-service" 0})

(def ^:private ranks
  {:perms/create-queries        {"query-builder-and-native" 2 "query-builder" 1 "no" 0}
   :perms/download-results      {"one-million-rows" 2 "ten-thousand-rows" 1 "no" 0}
   :perms/manage-table-metadata {"yes" 1 "no" 0}
   :perms/manage-database       {"yes" 1 "no" 0}
   :perms/transforms            {"yes" 1 "no" 0}
   :collection                  {"write" 2 "read" 1 "none" 0}
   :application                 {"yes" 1 "no" 0}})

(defn- top-value
  [perm-type]
  (key (apply max-key val (ranks perm-type))))

(defn- admin-group? [group] (= "admin" (some-> (:magic_group_type group) name)))
(defn- data-analyst-group? [group] (= "data-analyst" (some-> (:magic_group_type group) name)))

;;; ------------------------------------------------- Data access -------------------------------------------------

(defn- attribute-value-text
  "How the value of `attribute` reads for this principal: the value, missing, or per member for a group."
  [attributes attribute]
  (cond
    (nil? attributes)                (tru "each member''s own value")
    (contains? attributes attribute) (tru "\"{0}\"" (str (get attributes attribute)))
    :else                            (tru "missing")))

(defn- routing-reasons
  [database-id attributes superuser?]
  (when-let [attribute (permission-debug.db/router-user-attribute database-id)]
    (let [value (get attributes attribute)]
      [(cond
         (nil? attributes)
         (tru "Database routing on attribute \"{0}\": each member goes to the destination their own value names." attribute)

         (= value "__METABASE_ROUTER__")
         (tru "Database routing on attribute \"{0}\": the value sends queries to the router database itself." attribute)

         (and (nil? value) superuser?)
         (tru "Database routing on attribute \"{0}\": admins without the attribute query the router database." attribute)

         (nil? value)
         (tru "Database routing on attribute \"{0}\": the attribute is missing, so every query fails." attribute)

         (permission-debug.db/destination-database-name-exists? database-id (str value))
         (tru "Database routing on attribute \"{0}\": queries go to the destination database \"{1}\"." attribute (str value))

         :else
         (tru "Database routing on attribute \"{0}\": no destination database is named \"{1}\", so every query fails."
              attribute (str value)))])))

(defn- sandbox-security
  [{:keys [group_id card_id attribute_remappings]} group-name attributes]
  {:kind       "sandbox"
   :group_id   group_id
   :group_name group-name
   :rows       (if card_id
                 (tru "Rows come from the saved question \"{0}\"." (:name (permission-debug.db/card card_id)))
                 (tru "Filtered by {0}."
                      (str/join ", " (for [attribute (sort (keys attribute_remappings))]
                                       (tru "the \"{0}\" attribute ({1})" attribute
                                            (attribute-value-text attributes attribute))))))
   :columns    (if card_id
                 (tru "Only the saved question''s columns.")
                 (tru "All columns."))})

(defn- impersonation-security
  [{:keys [group_id attribute]} group-name attributes]
  {:kind       "impersonation"
   :group_id   group_id
   :group_name group-name
   :rows       (tru "The database role from the \"{0}\" attribute ({1}) decides." attribute
                    (attribute-value-text attributes attribute))
   :columns    (tru "The database role decides.")})

(defn- table-access
  [{:keys [group-rows attributes]} database-id sandboxes impersonations {table-id :id :as table}]
  (let [table-sandboxes  (filter #(= table-id (:table_id %)) sandboxes)
        sandboxed-ids    (set (map :group_id table-sandboxes))
        impersonated-ids (set (map :group_id impersonations))
        value-of         (fn [perm-type]
                           (fn [{group-id :id :as group}]
                             (cond
                               (admin-group? group)
                               (keyword (top-value perm-type))

                               (and (= perm-type :perms/manage-table-metadata) (data-analyst-group? group))
                               :yes

                               :else
                               (perms/table-permission-for-groups #{group-id} perm-type database-id table-id))))
        view-data-of     (fn [{group-id :id :as group}]
                           (let [value (if (admin-group? group)
                                         :unrestricted
                                         (perms/table-permission-for-groups #{group-id} :perms/view-data database-id table-id))]
                             (cond
                               (not= value :unrestricted)   value
                               (sandboxed-ids group-id)     :sandboxed
                               (impersonated-ids group-id)  :impersonated
                               :else                        value)))
        view-data        (cell group-rows view-data-of view-data-rank)
        group-name       (into {} (map (juxt :id :name)) group-rows)
        security         (case (:value view-data)
                           "sandboxed"    (sandbox-security (some #(when (= (:group_id view-data) (:group_id %)) %)
                                                                  table-sandboxes)
                                                            (group-name (:group_id view-data))
                                                            attributes)
                           "impersonated" (impersonation-security (some #(when (= (:group_id view-data) (:group_id %)) %)
                                                                        impersonations)
                                                                  (group-name (:group_id view-data))
                                                                  attributes)
                           nil)
        overridden       (when (= "unrestricted" (:value view-data))
                           (seq (keep #(when (#{"sandboxed" "impersonated"} (:value %)) (:name %)) (:groups view-data))))
        metadata         (cell group-rows (value-of :perms/manage-table-metadata) (ranks :perms/manage-table-metadata))
        analyst-winner?  (some #(and (data-analyst-group? %) (= (:id %) (:group_id metadata))) group-rows)]
    {:id                    table-id
     :schema                (:schema table)
     :name                  (:name table)
     :display_name          (:display_name table)
     :view_data             (cond-> view-data
                              overridden (assoc :note (tru "Row and column security from {0} doesn''t apply: another group grants unrestricted access."
                                                           (str/join ", " overridden))))
     :create_queries        (cell group-rows (value-of :perms/create-queries) (ranks :perms/create-queries))
     :download_results      (cell group-rows (value-of :perms/download-results) (ranks :perms/download-results))
     :manage_table_metadata (cond-> metadata
                              analyst-winner? (assoc :note (tru "Data analysts can manage every table''s metadata.")))
     :security              security}))

(defn- database-cell
  [{:keys [group-rows group-ids]} perm-type database-id]
  (let [values (permission-debug.db/database-permission-values-for-groups group-ids perm-type database-id)]
    (cell group-rows
          (fn [{group-id :id :as group}]
            (if (admin-group? group) :yes (get values group-id :no)))
          (ranks perm-type))))

(defn- database-access
  [{:keys [group-ids attributes superuser] :as p} {database-id :id :as database}]
  (let [sandboxes      (permission-debug.db/sandboxes-for-groups-in-database group-ids database-id)
        impersonations (permission-debug.db/impersonations-for-groups-in-database group-ids database-id)]
    {:id              database-id
     :name            (:name database)
     :reasons         (vec (routing-reasons database-id attributes superuser))
     :manage_database (database-cell p :perms/manage-database database-id)
     :transforms      (database-cell p :perms/transforms database-id)
     :tables          (mapv #(table-access p database-id sandboxes impersonations %)
                            (permission-debug.db/active-tables-of-database database-id))}))

(mu/defn explain-data-access :- DataAccessResponse
  "What the principal gets on every database and table, each value with every group's own and the one that applies.
  Shows no data."
  [{:keys [principal-type principal-id]} :- [:map {:closed true}
                                             [:principal-type PrincipalType]
                                             [:principal-id   pos-int?]]]
  (let [p (principal principal-type principal-id)]
    {:principal (principal-response p)
     :databases (mapv #(database-access p %) (permission-debug.db/previewable-databases))}))

(mu/defn explain-table-access-by-user :- TableUsersResponse
  "What every active user gets on the Table with `table-id`: the reverse of [[explain-data-access]]."
  [table-id :- pos-int?]
  (let [{database-id :db_id :as table} (api/check-404 (permission-debug.db/table table-id))
        database                       (permission-debug.db/database database-id)]
    {:table {:id            table-id
             :db_id         database-id
             :database_name (:name database)
             :schema        (:schema table)
             :name          (:name table)
             :display_name  (:display_name table)}
     :users (for [{user-id :id} (permission-debug.db/previewable-users)
                  :let [{:keys [group-ids] :as p} (principal "user" user-id)]]
              {:principal (principal-response p)
               :access    (table-access p
                                        database-id
                                        (permission-debug.db/sandboxes-for-groups-in-database group-ids database-id)
                                        (permission-debug.db/impersonations-for-groups-in-database group-ids database-id)
                                        table)})}))

;;; ---------------------------------------------- Collection access ----------------------------------------------

(def ^:private graph-namespace
  {"default" nil, "shared" "shared-tenant-collection", "tenant" "tenant-specific"})

(defn- location-ids
  [location]
  (map parse-long (re-seq #"\d+" (or location ""))))

(defn- tree-order
  "The collections depth first, each with its `:depth` below `base-depth`."
  [collections base-depth]
  (let [children (group-by #(last (location-ids (:location %))) collections)
        walk     (fn walk [parent-id depth]
                   (mapcat (fn [collection]
                             (cons (assoc collection :depth depth) (walk (:id collection) (inc depth))))
                           (sort-by (comp u/lower-case-en :name) (children parent-id))))]
    (walk nil base-depth)))

(defn- without-personal
  [collections]
  (let [personal-ids (set (keep #(when (:personal_owner_id %) (:id %)) collections))]
    (remove #(or (personal-ids (:id %)) (some personal-ids (location-ids (:location %)))) collections)))

(defn- group-collection-row
  [{:keys [group-rows]} graph collection-id collection-name depth]
  {:id     collection-id
   :name   collection-name
   :depth  depth
   :source "group"
   :access (cell group-rows
                 (fn [{group-id :id :as group}]
                   (if (admin-group? group) :write (get-in graph [:groups group-id collection-id] :none)))
                 (ranks :collection))})

(defn- membership-row
  [collection-id collection-name depth source value note]
  {:id     collection-id
   :name   collection-name
   :depth  depth
   :source source
   :access {:value value :group_id nil :groups [] :note note}})

(defn- main-collection-rows
  [{p-type :type :keys [personal-collection-id] :as p} graph]
  (let [collections (tree-order (without-personal (permission-debug.db/collections-in-namespace nil)) 1)]
    (concat
     [(group-collection-row p graph :root (tru "Our analytics") 0)]
     (for [{:keys [id name depth]} collections]
       (group-collection-row p graph id name depth))
     (case p-type
       "user"  (when personal-collection-id
                 [(membership-row personal-collection-id (tru "Their personal collection") 0 "personal" "write"
                                  (tru "Everyone curates their own personal collection. It isn''t set per group."))])
       "group" [(membership-row nil (tru "Each member''s personal collection") 0 "personal" "write"
                                (tru "Everyone curates their own personal collection. It isn''t set per group."))]
       nil))))

(defn- shared-collection-rows
  [p graph]
  (cons (group-collection-row p graph :root (tru "Root shared collection") 0)
        (for [{:keys [id name depth]} (tree-order (permission-debug.db/collections-in-namespace "shared-tenant-collection") 1)]
          (group-collection-row p graph id name depth))))

(defn- tenant-collection-rows
  "Internal groups are granted tenant collections like any other. A tenant's own users curate their tenant's collection
  and everything in it from membership, never from a group (`metabase.permissions.user/user-permissions-set`), and
  can't open other tenants'."
  [{:keys [tenant_side tenant-id] :as p} graph]
  (let [collections (tree-order (permission-debug.db/collections-in-namespace "tenant-specific") 0)
        membership  (tru "A tenant''s users curate their tenant''s collection from being members of the tenant. It isn''t set per group.")]
    (cond
      (not tenant_side)
      (for [{:keys [id name depth]} collections]
        (group-collection-row p graph id name depth))

      tenant-id
      (let [own-id (permission-debug.db/tenant-collection-id tenant-id)]
        (for [{:keys [id name depth location]} collections
              :let [own? (or (= id own-id) (some #{own-id} (location-ids location)))]]
          (if own?
            (membership-row id name depth "tenant" "write" membership)
            (membership-row id name depth "other-tenant" "none"
                            (tru "Tenant users only ever open their own tenant''s collection.")))))

      :else
      [(membership-row nil (tru "Each member''s own tenant collection") 0 "tenant" "write"
                       (str membership " " (tru "Other tenants'' collections stay closed.")))])))

(mu/defn explain-collection-access :- CollectionsResponse
  "What the principal gets on each collection of one tab: main collections, shared collections or tenant collections."
  [{:keys [principal-type principal-id collection-namespace]} :- [:map {:closed true}
                                                                  [:principal-type       PrincipalType]
                                                                  [:principal-id         pos-int?]
                                                                  [:collection-namespace CollectionNamespace]]]
  (let [{:keys [group-ids tenant_side] :as p} (principal principal-type principal-id)
        graph                                 (perms/graph (graph-namespace collection-namespace) nil group-ids)
        applies?                              (not (and tenant_side (= collection-namespace "default")))]
    {:principal   (principal-response p)
     :applies     applies?
     :reason      (when-not applies?
                    (tru "Tenant users never see the main collections: tenant groups can''t be given access to them, so they aren''t on this tab. Check Shared collections and Tenant collections instead."))
     :collections (if applies?
                    (vec (case collection-namespace
                           "default" (main-collection-rows p graph)
                           "shared"  (shared-collection-rows p graph)
                           "tenant"  (tenant-collection-rows p graph)))
                    [])}))

;;; ---------------------------------------------- Application access ---------------------------------------------

(mu/defn explain-application-access :- ApplicationResponse
  "Which application permissions the principal gets, and from which group."
  [{:keys [principal-type principal-id]} :- [:map {:closed true}
                                             [:principal-type PrincipalType]
                                             [:principal-id   pos-int?]]]
  (let [{:keys [group-ids group-rows tenant_side] :as p} (principal principal-type principal-id)
        perm-types                                       [:setting :monitoring :subscription]
        held                                             (permission-debug.db/group-ids-with-permission-objects
                                                          group-ids
                                                          (into #{"/"} (map perms/application-perms-path) perm-types))]
    {:principal   (principal-response p)
     :applies     (not tenant_side)
     :reason      (when tenant_side
                    (tru "Tenant groups can''t be given application permissions, so tenant users never get settings, monitoring or subscription access."))
     :permissions (if tenant_side
                    []
                    (for [perm-type perm-types]
                      {:key    (name perm-type)
                       :access (cell group-rows
                                     (fn [{group-id :id}]
                                       (if (or (held [group-id "/"])
                                               (held [group-id (perms/application-perms-path perm-type)]))
                                         :yes
                                         :no))
                                     (ranks :application))}))}))

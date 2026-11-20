(ns metabase-enterprise.permission-debug.impl
  "Implementation of permission debugging functionality.

  Maps actions to it's own definition of a permission type since the permission types used in our
  modeling don't necessarily match 1:1 with actions a user may perform in the ui.

  | Action Type | Action | Target Model | Permissions |
  | ----------- | ------ | ------------ | ----------- |
  | `:card/read` | get a card model via API | card | perms/collection-access |
  | `:card/query` | run the query associated with the card | card → tables used in query | perms/view-data perms/collection-access |
  | `:card/download-data` | download data from the card query | card → tables used in query | perms/download-results perms/collection-access |
  | `:dashboard/read` | get a dashboard via API | dashboard | perms/collection-access |
  | `:dashboard/query` | run the dashboard's cards | dashboard → its cards → tables used in their queries | perms/view-data perms/collection-access |
  | `:collection/read` | open a collection | collection | perms/collection-access |
  "
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.permission-debug.db :as permission-debug.db]
   [metabase-enterprise.permission-debug.preview :as preview]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.request.core :as request]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.match :as match]))

(set! *warn-on-reflection* true)

(def DebuggerSchema
  "Format of the response the Debugger will return"
  [:schema {:registry
            {::group-id :int
             ::missing-attribute [:map {:closed true}
                                  [:attribute :string]
                                  [:table-id  pos-int?]
                                  [:group-id  ::group-id]]
             ;; a Database where the person's row and column security and connection impersonation both apply
             ::conflicting-database [:map {:closed true}
                                     [:database-id             pos-int?]
                                     [:sandbox-group-ids       [:sequential ::group-id]]
                                     [:impersonation-group-ids [:sequential ::group-id]]]
             ;; an attribute the person lacks that a connection impersonation policy (of `:group-id`) or the Database's
             ;; router reads
             ::missing-database-attribute [:map {:closed true}
                                           [:attribute   :string]
                                           [:database-id pos-int?]
                                           [:kind        [:enum "impersonation" "routing"]]
                                           [:group-id    {:optional true} ::group-id]]
             ::perm-debug-info [:map {:closed true}
                                [:model-type  [:enum "card" "dashboard" "collection" "invalid"]]
                                [:model-id    :string]
                                [:decision    [:enum "allow" "denied" "limited"]]
                                [:segment     [:set [:enum "sandboxed" "impersonated" "routed"]]]
                                [:message     [:sequential :string]]
                                [:data        [:map {:closed true}
                                               [:blocked-tables           {:optional true} [:map-of :string [:set :string]]]
                                               [:download-limited-tables  {:optional true} [:map-of :string [:set :string]]]
                                               [:download-no-tables       {:optional true} [:map-of :string [:set :string]]]
                                               ;; a dashboard's cards, and how many of them can't load: a blocked table, or a conflicting one
                                               [:card-count               {:optional true} nat-int?]
                                               [:blocked-card-count       {:optional true} nat-int?]
                                               ;; the tables the queries reach that more than one group's row and column
                                               ;; security applies to
                                               [:conflicting-tables       {:optional true} [:sequential pos-int?]]
                                               ;; the attributes the previewed person lacks that a row and column security
                                               ;; rule on a table the queries reach reads
                                               [:missing-attributes       {:optional true} [:sequential ::missing-attribute]]
                                               ;; the databases the queries reach that fail every query on them: row and
                                               ;; column security with connection impersonation, or an attribute
                                               ;; impersonation or routing reads that the person lacks
                                               [:conflicting-databases    {:optional true} [:sequential ::conflicting-database]]
                                               [:missing-database-attributes {:optional true}
                                                [:sequential ::missing-database-attribute]]
                                               ;; each card that can't load, with the names of its blocked tables
                                               [:blocked-cards            {:optional true}
                                                [:sequential [:map {:closed true}
                                                              [:id     pos-int?]
                                                              [:name   :string]
                                                              [:tables [:sequential :string]]
                                                              [:conflicting-tables {:optional true}
                                                               [:sequential pos-int?]]
                                                              [:missing-attributes {:optional true}
                                                               [:sequential ::missing-attribute]]
                                                              [:conflicting-databases {:optional true}
                                                               [:sequential ::conflicting-database]]
                                                              [:missing-database-attributes {:optional true}
                                                               [:sequential ::missing-database-attribute]]]]]]]
                                [:suggestions [:map-of ::group-id :string]]]}}
   ::perm-debug-info])

(def ActionType
  "Type of the action in the debugger API to dispatch on"
  [:enum :card/read :card/query :card/download-data :dashboard/read :dashboard/query :collection/read])

(def DebuggerArguments
  "Arguments for the Debugger function. The model type being operated on is inferred by the requested action type.
  `:attribute-overrides` are the attribute values an admin picked in a preview of the user, in place of the user's own."
  [:map
   [:user-id pos-int?]
   [:model-id pos-int?]
   [:action-type ActionType]
   [:attribute-overrides {:optional true} [:maybe [:map-of :string :string]]]])

(defmulti debug-permissions
  "Debug permissions for a given entity and user.

   Dispatches on the `:action-type` key in the input map.

   Expected input map keys:
   - `:user-id` - The ID of the user to check permissions for
   - `:model-id` - The ID of the model to check permissions against
   - `:action-type` - The type of permission to check (e.g., 'view', 'write')

   Returns a map conforming to the DebuggerSchema defined in the API."
  {:arglists '([debug-info-map])}
  (fn [{:keys [action-type user-id]}]
    (let [user-is-superuser? (permission-debug.db/user-superuser? user-id)]
      (if user-is-superuser?
        ::is-superuser
        action-type))))

(mu/defmethod debug-permissions :default :- DebuggerSchema
  [_debug-info-map :- DebuggerArguments]
  {:decision    "denied"
   :model-type  "invalid"
   :model-id    ""
   :segment     #{}
   :message     [(tru "Unknown permission type")]
   :data        {}
   :suggestions {}})

(mu/defmethod debug-permissions ::is-superuser :- DebuggerSchema
  [{:keys [action-type model-id]} :- DebuggerArguments]
  {:decision    "allow"
   :model-type  (namespace action-type)
   :model-id    (str model-id)
   :segment     #{}
   :message     [(tru "Superuser is allowed full access")]
   :data        {}
   :suggestions {}})

(defn- user-can-read?
  "Whether the User with `user-id` can read the `model` instance with `pk`, checked as that User: a superuser caller's
  own flags would otherwise let every check pass."
  [model pk user-id]
  (request/with-current-user user-id
    (boolean (mi/can-read? model pk))))

(mu/defn- merge-permission-check :- DebuggerSchema
  "Merges n permissions responses with right most wins semantics. model-type and model-id must match across
  permissions responses. If the decision is denied that should take precedence over limited which should be
  preferred over allowed when merging."
  [& responses :- [:sequential DebuggerSchema]]
  (when (seq responses)
    (let [first-response (first responses)
          decision-precedence {"denied" 3 "limited" 2 "allow" 1}
          get-highest-precedence-decision (fn [decisions]
                                            (->> decisions
                                                 (map #(vector (decision-precedence %) %))
                                                 (sort-by first >)
                                                 first
                                                 second))]
      (reduce (fn [acc response]
                ;; Verify model-type and model-id match
                (when (or (not= (:model-type acc) (:model-type response))
                          (not= (:model-id acc) (:model-id response)))
                  (throw (ex-info "model-type and model-id must match across permission responses"
                                  {:acc acc :response response})))

                ;; Determine the winning decision
                (let [winning-decision (get-highest-precedence-decision [(:decision acc) (:decision response)])
                      acc-precedence (decision-precedence (:decision acc))
                      response-precedence (decision-precedence (:decision response))
                      ;; Only include fields from responses that have the winning decision precedence
                      acc-contributes? (= acc-precedence (decision-precedence winning-decision))
                      response-contributes? (= response-precedence (decision-precedence winning-decision))]
                  {:decision    winning-decision
                   :model-type  (:model-type response)
                   :model-id    (:model-id response)
                   :segment     (set/union (if acc-contributes? (:segment acc) #{})
                                           (if response-contributes? (:segment response) #{}))
                   :message     (into (if acc-contributes? (:message acc) [])
                                      (if response-contributes? (:message response) []))
                   :data        (merge (if acc-contributes? (:data acc) {})
                                       (if response-contributes? (:data response) {}))
                   :suggestions (merge (if acc-contributes? (:suggestions acc) {})
                                       (if response-contributes? (:suggestions response) {}))}))
              first-response
              (rest responses)))))

(mu/defmethod debug-permissions :card/read :- DebuggerSchema
  [{:keys [user-id model-id] :as _debug-info} :- DebuggerArguments]
  (let [can-read? (user-can-read? :model/Card model-id user-id)]
    {:decision    (if can-read? "allow" "denied")
     :model-type  "card"
     :model-id    (str model-id)
     :segment     #{}
     :message     [(if can-read?
                     (tru "User has permission to read this card")
                     (tru "User does not have permission to read this card"))]
     :data        {}
     :suggestions {}}))

(defn- format-blocked
  "Formats a map of [:db_name :schema :table_name] -> #{:group_name} into a translatable string like:
  db_name.schema.table_name by group_name_1 and group_name 2."
  [blocked-by-group]
  (update-keys blocked-by-group (fn [[db-name schema table-name]]
                                  (if schema
                                    (str db-name "." schema "." table-name)
                                    (str db-name "." table-name)))))

(defn- check-table-permissions
  "Check table-level permissions for a card's query tables.

  Arguments:
   - user-id: The ID of the user to check permissions for
   - card: The card model containing the dataset_query to analyze
   - permissions-blocking: Map specifying which permission types to check for blocking
                           (e.g., {:perms/view-data :blocked} or {:perms/download-results :no})
   - permissions-granting: Map specifying which permission types should be considered as granting access
                            (e.g., {:perms/view-data :legacy-no-self-service} or {:perms/download-results :ten-thousand-rows})

   Returns a map of blocked tables by group in the format:
   {[db-name schema table-name] #{group-name-1 group-name-2}}"
  [user-id card permissions-blocking permissions-granting]
  (let [query (-> card :dataset_query qp.preprocess/preprocess)
        query-tables (lib/all-source-table-ids query)
        native? (match/match-one query {:native &truthy} true)]
    (->>
     (cond
       native?
       ;; native queries are blocked if _any_ table in the database is blocked (or limited for download perms)
       (permission-debug.db/blocked-tables-in-database user-id (:database_id card)
                                                       permissions-blocking permissions-granting)

       (seq query-tables)
       (permission-debug.db/blocked-tables-among user-id query-tables permissions-blocking permissions-granting)

       :else
       nil)
     (map (juxt (juxt :db_name :schema :table_name) :group_name))
     (reduce #(update %1 (first %2) set/union (set [(second %2)])) {}))))

(defn- field-id-in-target
  "The Field ID a sandbox's attribute remapping target points at (`[:dimension [:field 18 nil]]`), or nil."
  [target]
  (some (fn [form]
          (when (and (sequential? form)
                     (= "field" (some-> (first form) name))
                     (pos-int? (second form)))
            (second form)))
        (tree-seq sequential? seq target)))

(defn- enforced-sandboxes-by-table
  "The sandboxes the query processor enforces for the User with `user-id`, by table id: the ones another group's Can
  view doesn't lift (`metabase-enterprise.sandbox.api.util/enforce-sandbox?`)."
  [user-id]
  (group-by :table_id (request/with-current-user user-id
                        (perms/sandboxes-for-user))))

(defn- filtered-table-ids
  "The ids of the tables `sandbox`'s filters reach: a rule on Orders that filters by Products.Category reads Products."
  [{:keys [attribute_remappings]}]
  (into #{}
        (keep #(some-> (field-id-in-target %) permission-debug.db/field-table-id))
        (vals attribute_remappings)))

(defn- reached-table-ids
  "The ids of the tables a query on `table-ids` reaches: those, the tables their enforced sandboxes filter by, and
  theirs in turn."
  [sandboxes-by-table table-ids]
  (loop [reached #{}
         pending (set table-ids)]
    (if (empty? pending)
      reached
      (let [reached (into reached pending)]
        (recur reached
               (set/difference (into #{} (mapcat #(mapcat filtered-table-ids (sandboxes-by-table %))) pending)
                               reached))))))

(defn- conflicting-table-ids
  "The ids of the tables a query on `table-ids` reaches that have more than one enforced sandbox, which fails it
  (`metabase-enterprise.sandbox.query-processor.middleware.sandboxing/assert-one-sandbox-per-table`)."
  [sandboxes-by-table table-ids]
  (vec (sort (filter #(> (count (sandboxes-by-table %)) 1) (reached-table-ids sandboxes-by-table table-ids)))))

(defn- user-attributes
  "The attribute values the query processor reads for the User with `user-id`, with the preview's picked
  `attribute-overrides` in place of their own."
  [user-id attribute-overrides]
  (request/with-attribute-overrides (request/with-current-user user-id (api/current-user-attributes))
    attribute-overrides))

(defn- missing-attributes
  "One `{:attribute :table-id :group-id}` per enforced sandbox on a table a query on `table-ids` reaches that reads an
  attribute `attributes` lacks, which fails it (`metabase-enterprise.sandbox.query-processor.middleware.sandboxing/
  attr-remapping->parameter`)."
  [sandboxes-by-table attributes table-ids]
  (vec (sort-by (juxt :table-id :attribute :group-id)
                (for [table-id                                (reached-table-ids sandboxes-by-table table-ids)
                      {:keys [group_id attribute_remappings]} (sandboxes-by-table table-id)
                      attribute                               (keys attribute_remappings)
                      :when                                   (not (get attributes attribute))]
                  {:attribute attribute :table-id table-id :group-id group_id}))))

(defn- database-rules
  "What decides, per Database, whether the User with `user-id` can query it through connection impersonation or routing:
  their groups, the impersonation policies of those groups by Database, the router attribute of each router Database,
  and the sandboxes and `attributes` they have."
  [user-id sandboxes-by-table attributes]
  (let [group-ids (permission-debug.db/user-group-ids user-id)]
    {:group-ids                  group-ids
     :attributes                 attributes
     :sandboxes-by-table         sandboxes-by-table
     :impersonations-by-database (group-by :db_id (permission-debug.db/impersonations-of-groups group-ids))
     :router-attributes          (into {} (map (juxt :database_id :user_attribute)) (permission-debug.db/database-routers))}))

(defn- sandbox-group-ids-on-database
  [sandboxes-by-table database-id]
  (into (sorted-set)
        (comp cat
              (filter #(= database-id (get-in % [:table :db_id])))
              (map :group_id))
        (vals sandboxes-by-table)))

(defn- conflicting-databases
  "One `{:database-id :sandbox-group-ids :impersonation-group-ids}` per Database of `database-ids` where the person has
  an enforced sandbox and a group of theirs has an impersonation policy, which fails every query on it
  (`metabase-enterprise.impersonation.driver/enforced-impersonations-for-db`)."
  [{:keys [sandboxes-by-table impersonations-by-database]} database-ids]
  (vec (for [database-id (sort database-ids)
             :let [sandbox-group-ids       (sandbox-group-ids-on-database sandboxes-by-table database-id)
                   impersonation-group-ids (into (sorted-set) (map :group_id) (impersonations-by-database database-id))]
             :when (and (seq sandbox-group-ids) (seq impersonation-group-ids))]
         {:database-id             database-id
          :sandbox-group-ids       (vec sandbox-group-ids)
          :impersonation-group-ids (vec impersonation-group-ids)})))

(defn- impersonation-enforced?
  "Whether `impersonations`, those of the person's groups on a Database, apply: not when another of their groups grants
  Can view on the whole Database (`metabase-enterprise.impersonation.driver/enforce-impersonations?`)."
  [group-ids impersonations database-id]
  (let [other-group-ids (set/difference group-ids (set (map :group_id impersonations)))]
    (not-any? #{:unrestricted}
              (vals (permission-debug.db/database-permission-values-for-groups other-group-ids :perms/view-data database-id)))))

(defn- missing-database-attributes
  "One `{:attribute :database-id :kind :group-id}` per attribute the person lacks that an enforced impersonation policy
  on a Database of `database-ids` reads (`:kind` \"impersonation\", from the policy's group), and one per Database
  whose router reads one (`:kind` \"routing\"), which fails every query on it
  (`metabase-enterprise.impersonation.driver/connection-impersonation-role`,
  `metabase-enterprise.database-routing.common/router-db->destination-db-id*`)."
  [{:keys [group-ids attributes impersonations-by-database router-attributes]} database-ids]
  (vec (sort-by (juxt :database-id :kind :attribute)
                (concat
                 (for [database-id                       database-ids
                       :let                              [impersonations (impersonations-by-database database-id)]
                       :when                             (and (seq impersonations)
                                                              (impersonation-enforced? group-ids impersonations database-id))
                       {:keys [group_id attribute]}      impersonations
                       :when                             (nil? (get attributes attribute))]
                   {:attribute attribute :database-id database-id :kind "impersonation" :group-id group_id})
                 (for [database-id database-ids
                       :let        [attribute (router-attributes database-id)]
                       :when       (and attribute (nil? (get attributes attribute)))]
                   {:attribute attribute :database-id database-id :kind "routing"})))))

(defn- card-table-ids
  [card]
  (-> card :dataset_query qp.preprocess/preprocess lib/all-source-table-ids set))

(mu/defmethod debug-permissions :card/query :- DebuggerSchema
  [{:keys [user-id model-id attribute-overrides] :as debug-info} :- DebuggerArguments]
  (merge-permission-check
   (debug-permissions (assoc debug-info :action-type :card/read))
   (let [card (permission-debug.db/card model-id)
         blocked-by-group (check-table-permissions user-id card
                                                   {:perms/view-data :blocked}
                                                   {:perms/view-data :legacy-no-self-service})
         sandboxes-by-table (enforced-sandboxes-by-table user-id)
         table-ids        (card-table-ids card)
         attributes       (user-attributes user-id attribute-overrides)
         rules            (database-rules user-id sandboxes-by-table attributes)
         conflicting      (conflicting-table-ids sandboxes-by-table table-ids)
         missing          (missing-attributes sandboxes-by-table attributes table-ids)
         conflicting-dbs  (conflicting-databases rules #{(:database_id card)})
         missing-dbs      (missing-database-attributes rules #{(:database_id card)})
         fails?           (or (seq blocked-by-group) (seq conflicting) (seq missing) (seq conflicting-dbs) (seq missing-dbs))]
     {:decision    (if fails? "denied" "allow")
      :segment     #{}
      :model-type  "card"
      :model-id    (str model-id)
      :message     [(if fails?
                      (tru "User does not have permission to query this card")
                      (tru "User has permission to query this card"))]
      :data        (cond-> {}
                     (not-empty blocked-by-group) (assoc :blocked-tables (format-blocked blocked-by-group))
                     (seq conflicting)            (assoc :conflicting-tables conflicting)
                     (seq missing)                (assoc :missing-attributes missing)
                     (seq conflicting-dbs)        (assoc :conflicting-databases conflicting-dbs)
                     (seq missing-dbs)            (assoc :missing-database-attributes missing-dbs))
      :suggestions {}})))

(mu/defmethod debug-permissions :card/download-data :- DebuggerSchema
  [{:keys [user-id model-id] :as debug-info} :- DebuggerArguments]
  (merge-permission-check
   (debug-permissions (assoc debug-info :action-type :card/query))
   (let [card (permission-debug.db/card model-id)
         limited-by-group (check-table-permissions user-id card
                                                   {:perms/download-results :ten-thousand-rows}
                                                   {:perms/download-results :one-million-rows})
         blocked-by-group (check-table-permissions user-id card
                                                   {:perms/download-results :no}
                                                   {:perms/download-results :ten-thousand-rows})]
     {:decision    (cond
                     (seq blocked-by-group) "denied"
                     (seq limited-by-group) "limited"
                     :else "allow")
      :model-type  "card"
      :model-id    (str model-id)
      :segment     #{}
      :message     [(cond
                      (seq blocked-by-group) (tru "User does not have permission to download data from this card")
                      (seq limited-by-group) (tru "User has permission to download some data from this card")
                      :else (tru "User has permission to download data from this card"))]
      :data        (cond-> {}
                     (not-empty limited-by-group) (assoc :download-limited-tables (format-blocked limited-by-group))
                     (not-empty blocked-by-group) (assoc :download-no-tables (format-blocked blocked-by-group)))
      :suggestions {}})))

(mu/defmethod debug-permissions :dashboard/read :- DebuggerSchema
  [{:keys [user-id model-id] :as _debug-info} :- DebuggerArguments]
  (let [can-read? (user-can-read? :model/Dashboard model-id user-id)]
    {:decision    (if can-read? "allow" "denied")
     :model-type  "dashboard"
     :model-id    (str model-id)
     :segment     #{}
     :message     [(if can-read?
                     (tru "User has permission to read this dashboard")
                     (tru "User does not have permission to read this dashboard"))]
     :data        {}
     :suggestions {}}))

(mu/defmethod debug-permissions :dashboard/query :- DebuggerSchema
  [{:keys [user-id model-id attribute-overrides] :as debug-info} :- DebuggerArguments]
  (merge-permission-check
   (debug-permissions (assoc debug-info :action-type :dashboard/read))
   (let [card-ids         (permission-debug.db/dashboard-card-ids model-id)
         cards            (map permission-debug.db/card card-ids)
         blocked-by-card  (for [card cards]
                            (check-table-permissions user-id card
                                                     {:perms/view-data :blocked}
                                                     {:perms/view-data :legacy-no-self-service}))
         blocked-by-group (apply merge-with set/union {} blocked-by-card)
         sandboxes-by-table (enforced-sandboxes-by-table user-id)
         conflicts-by-card  (for [card cards]
                              (conflicting-table-ids sandboxes-by-table (card-table-ids card)))
         attributes         (user-attributes user-id attribute-overrides)
         missing-by-card    (for [card cards]
                              (missing-attributes sandboxes-by-table attributes (card-table-ids card)))
         rules              (database-rules user-id sandboxes-by-table attributes)
         conflicting-dbs-by-card (for [card cards]
                                   (conflicting-databases rules #{(:database_id card)}))
         missing-dbs-by-card     (for [card cards]
                                   (missing-database-attributes rules #{(:database_id card)}))
         failing-cards    (for [[card blocked conflicting missing conflicting-dbs missing-dbs]
                                (map vector cards blocked-by-card conflicts-by-card missing-by-card
                                     conflicting-dbs-by-card missing-dbs-by-card)
                                :when (or (seq blocked) (seq conflicting) (seq missing) (seq conflicting-dbs) (seq missing-dbs))]
                            (cond-> {:id     (:id card)
                                     :name   (:name card)
                                     ;; keyed by [db-name schema table-name]
                                     :tables (vec (sort (distinct (map last (keys blocked)))))}
                              (seq conflicting)     (assoc :conflicting-tables conflicting)
                              (seq missing)         (assoc :missing-attributes missing)
                              (seq conflicting-dbs) (assoc :conflicting-databases conflicting-dbs)
                              (seq missing-dbs)     (assoc :missing-database-attributes missing-dbs)))
         failing-count    (count failing-cards)
         conflicting      (vec (sort (distinct (apply concat conflicts-by-card))))
         missing          (vec (sort-by (juxt :table-id :attribute :group-id) (distinct (apply concat missing-by-card))))
         conflicting-dbs  (vec (sort-by :database-id (distinct (apply concat conflicting-dbs-by-card))))
         missing-dbs      (vec (sort-by (juxt :database-id :kind :attribute) (distinct (apply concat missing-dbs-by-card))))]
     {:decision    (cond
                     (zero? failing-count)               "allow"
                     (= failing-count (count card-ids)) "denied"
                     :else                               "limited")
      :model-type  "dashboard"
      :model-id    (str model-id)
      :segment     #{}
      :message     [(if (pos? failing-count)
                      (tru "User does not have permission to query some cards on this dashboard")
                      (tru "User has permission to query every card on this dashboard"))]
      :data        (cond-> {:card-count         (count card-ids)
                            :blocked-card-count failing-count}
                     (not-empty blocked-by-group) (assoc :blocked-tables (format-blocked blocked-by-group))
                     (seq failing-cards)          (assoc :blocked-cards (vec failing-cards))
                     (seq conflicting)            (assoc :conflicting-tables conflicting)
                     (seq missing)                (assoc :missing-attributes missing)
                     (seq conflicting-dbs)        (assoc :conflicting-databases conflicting-dbs)
                     (seq missing-dbs)            (assoc :missing-database-attributes missing-dbs))
      :suggestions {}})))

(mu/defmethod debug-permissions :collection/read :- DebuggerSchema
  [{:keys [user-id model-id] :as _debug-info} :- DebuggerArguments]
  (let [can-read? (user-can-read? :model/Collection model-id user-id)]
    {:decision    (if can-read? "allow" "denied")
     :model-type  "collection"
     :model-id    (str model-id)
     :segment     #{}
     :message     [(if can-read?
                     (tru "User has permission to read this collection")
                     (tru "User does not have permission to read this collection"))]
     :data        {}
     :suggestions {}}))

;;; ------------------------------------------------ Preview as user ------------------------------------------------

(def PrincipalType
  "Who an admin can preview or explain: a user or a permissions group."
  [:enum "user" "group"])

(defn- user-display
  [{:keys [id first_name last_name email]}]
  {:user_id   id
   :user_name (or (not-empty (str/trim (str first_name " " last_name))) email)})

(def ^:private Attributes
  [:map-of :string :string])

(def PreviewAttributesResponse
  "The attributes a group's access depends on, each with the values to pick from."
  [:sequential [:map
                [:attribute :string]
                [:uses [:sequential :string]]
                [:member_values [:sequential [:map [:value :string] [:count pos-int?]]]]
                [:other_values [:sequential :string]]
                [:default [:maybe :string]]]])

(defn- field-column-label
  ;; the field's own table: a rule on Orders can filter by its product's category, Products.Category
  [field-id]
  (str (some-> (permission-debug.db/field-table-id field-id) permission-debug.db/table-display-name)
       "."
       (permission-debug.db/field-display-name field-id)))

(defn remapping-column-label
  "The column a sandbox's attribute remapping `target` filters, like `Products.Category`, or nil when it names none."
  [target]
  (some-> (field-id-in-target target) field-column-label))

(defn- attribute-uses
  "One `{:attribute :use :values}` per place the group's access reads an attribute: a row-level security filter, a
  connection impersonation role, or a database router (which applies to every group)."
  [group-id]
  (concat
   (for [{:keys [table_id attribute_remappings]} (permission-debug.db/group-sandboxes group-id)
         [attribute target]                       attribute_remappings
         :let [field-id (field-id-in-target target)]]
     {:attribute attribute
      :use       (tru "Filters {0}" (or (permission-debug.db/table-display-name table_id) table_id))
      :values    (some-> field-id permission-debug.db/field-column-values)})
   (for [{:keys [db_id attribute]} (permission-debug.db/group-impersonations group-id)]
     {:attribute attribute
      :use       (tru "Sets the database role on {0}" (:name (permission-debug.db/database db_id)))
      :values    nil})
   (for [{:keys [database_id user_attribute]} (permission-debug.db/database-routers)]
     {:attribute user_attribute
      :use       (tru "Picks the database behind {0}" (:name (permission-debug.db/database database_id)))
      :values    (permission-debug.db/destination-database-names database_id)})))

(defn- member-attributes
  "Each active, non-admin member's attributes, merged as [[metabase.users.models.user/add-attributes]] merges them."
  [group-id]
  (let [members        (permission-debug.db/group-members-attributes group-id)
        tenant-id->attributes (permission-debug.db/tenant-attributes-by-id (set (keep :tenant_id members)))]
    (for [{:keys [tenant_id jwt_attributes login_attributes]} members]
      (merge {} (get tenant-id->attributes tenant_id) jwt_attributes login_attributes))))

(mu/defn preview-attributes :- PreviewAttributesResponse
  "The attributes the access of the group with `group-id` depends on, with the values its members have (most common
  first) and the other values the filtered column or router offers. Empty when nothing depends on an attribute."
  [group-id :- pos-int?]
  (api/check-404 (permission-debug.db/group-name group-id))
  (let [members (member-attributes group-id)]
    (for [[attribute uses] (group-by :attribute (attribute-uses group-id))
          :let [member-values (->> (keep #(get % attribute) members)
                                   frequencies
                                   (sort-by (juxt (comp - val) key))
                                   (mapv (fn [[value value-count]] {:value value :count value-count})))
                member-value? (set (map :value member-values))
                other-values  (->> (mapcat :values uses) (remove nil?) (map str) distinct (remove member-value?) sort vec)]]
      {:attribute     attribute
       :uses          (vec (distinct (map :use uses)))
       :member_values member-values
       :other_values  other-values
       :default       (or (:value (first member-values)) (first other-values))})))

(def AffectingAttributesResponse
  "The attributes a security rule on a person's groups reads, each with the rules that read it and the person's value."
  [:sequential [:map
                [:attribute :string]
                [:value [:maybe :string]]
                [:uses [:sequential [:map
                                     [:kind [:enum "sandbox" "impersonation" "routing"]]
                                     ;; what the rule acts on: a sandbox's table, or the database it impersonates or routes
                                     [:label :string]
                                     [:table_id {:optional true} ::lib.schema.id/table]
                                     [:field_id {:optional true} ::lib.schema.id/field]
                                     ;; the filtered column, as `Table.Column` display names
                                     [:column {:optional true} :string]
                                     [:database_id {:optional true} ::lib.schema.id/database]]]]
                ;; a user's value: where it comes from, as `metabase.users.models.user/add-attributes` merges them
                [:source {:optional true} [:enum "tenant" "jwt" "admin"]]
                [:tenant_name {:optional true} :string]
                [:applies :boolean]
                [:member_values {:optional true} [:sequential [:map [:value :string] [:count pos-int?]]]]
                [:other_values {:optional true} [:sequential :string]]]])

(defn- principal-group-ids
  "The groups whose rules apply to a principal: a user's own groups; a group with All Users (All tenant users for a
  tenant group), as its preview user has."
  [principal-type principal-id]
  (case principal-type
    "user"  (permission-debug.db/user-group-ids principal-id)
    "group" (do (api/check-404 (permission-debug.db/group-name principal-id))
                #{principal-id (:id (if (permission-debug.db/tenant-group? principal-id)
                                      (perms/all-external-users-group)
                                      (perms/all-users-group)))})))

(defn- rule-uses
  "One use per place a rule on `group-ids` reads an attribute, plus every database router."
  [group-ids]
  (concat
   (for [{:keys [table_id db_id attribute_remappings]} (permission-debug.db/sandboxes-of-groups group-ids)
         [attribute target]                             attribute_remappings
         :let [field-id (field-id-in-target target)]]
     (let [table-name (or (permission-debug.db/table-display-name table_id) (str table_id))]
       (cond-> {:attribute   attribute
                :kind        "sandbox"
                :label       table-name
                :table_id    table_id
                :database_id db_id}
         field-id (assoc :field_id field-id
                         :column   (field-column-label field-id)))))
   (for [{:keys [db_id attribute]} (permission-debug.db/impersonations-of-groups group-ids)]
     {:attribute   attribute
      :kind        "impersonation"
      :label       (or (:name (permission-debug.db/database db_id)) (str db_id))
      :database_id db_id})
   (for [{:keys [database_id user_attribute]} (permission-debug.db/database-routers)]
     {:attribute   user_attribute
      :kind        "routing"
      :label       (or (:name (permission-debug.db/database database_id)) (str database_id))
      :database_id database_id})))

(defn- card-scope
  "The `{:table-ids :database-ids}` the Card with `card-id` queries. A native query, or one that can't be
  preprocessed, counts as querying every table of its database."
  [card-id]
  (let [{:keys [dataset_query database_id]} (api/check-404 (permission-debug.db/card card-id))
        query     (try (qp.preprocess/preprocess dataset_query) (catch Throwable _ nil))
        native?   (or (nil? query) (match/match-one query {:native &truthy} true))]
    {:table-ids          (if native? #{} (set (lib/all-source-table-ids query)))
     :whole-database-ids (if native? #{database_id} #{})
     :database-ids       #{database_id}}))

(defn- item-scope
  [card-id dashboard-id]
  (cond
    card-id      (card-scope card-id)
    dashboard-id (do (api/check-404 (permission-debug.db/dashboard-exists? dashboard-id))
                     (apply merge-with set/union
                            {:table-ids #{} :whole-database-ids #{} :database-ids #{}}
                            (map card-scope (permission-debug.db/dashboard-card-ids dashboard-id))))))

(defn item-dependencies
  "The name and collection of the Card with `card-id` or the Dashboard with `dashboard-id`, and the tables and databases
  it, or every Card on the Dashboard, queries."
  [card-id dashboard-id]
  (let [{:keys [table-ids whole-database-ids database-ids]} (item-scope card-id dashboard-id)
        item (if card-id
               (permission-debug.db/card card-id)
               (permission-debug.db/dashboard dashboard-id))]
    {:name               (:name item)
     :collection_id      (:collection_id item)
     :table_ids          (vec (sort table-ids))
     :whole_database_ids (vec (sort whole-database-ids))
     :database_ids       (vec (sort database-ids))}))

(defn- use-touches-scope?
  [{:keys [table-ids whole-database-ids database-ids]} {:keys [kind table_id database_id]}]
  (if (= "sandbox" kind)
    (boolean (or (table-ids table_id) (whole-database-ids database_id)))
    (boolean (database-ids database_id))))

(defn- principal-values
  "The value of each attribute for the principal: a user's own (tenant, JSON Web Token then login attributes, as
  [[metabase.users.models.user/add-attributes]] merges them), or for a group the preview default."
  [principal-type principal-id]
  (case principal-type
    "user"  (let [{:keys [tenant_id jwt_attributes login_attributes]}
                  (api/check-404 (permission-debug.db/user-attribute-sources principal-id))]
              (merge {}
                     (some-> tenant_id permission-debug.db/tenant :attributes)
                     jwt_attributes
                     login_attributes))
    "group" (into {}
                  (keep (fn [{:keys [attribute default]}] (when default [attribute default])))
                  (preview-attributes principal-id))))

(defn- user-value-sources
  "Where each of a user's attribute values comes from: the tenant, then JSON Web Token, then the admin-set login
  attributes, each later one winning, as [[metabase.users.models.user/add-attributes]] merges them."
  [user-id]
  (let [{:keys [tenant_id jwt_attributes login_attributes]} (permission-debug.db/user-attribute-sources user-id)
        tenant                                              (some-> tenant_id permission-debug.db/tenant)]
    (merge (update-vals (or (:attributes tenant) {}) (constantly {:source "tenant" :tenant_name (:name tenant)}))
           (update-vals (or jwt_attributes {}) (constantly {:source "jwt"}))
           (update-vals (or login_attributes {}) (constantly {:source "admin"})))))

(mu/defn affecting-attributes :- AffectingAttributesResponse
  "The attributes a security rule on the principal's groups reads (sandbox remappings, connection impersonation, database
  routing), each with its rules and the principal's value. With `card-id` or `dashboard-id`, `:applies` says whether any
  of the attribute's rules touch the tables and databases the item queries. Then the principal's other attributes, with
  no rules and `:applies` false, leaving out the `@` system keys (`@tenant.slug`) no rule reads."
  [{:keys [principal-type principal-id card-id dashboard-id]}
   :- [:map {:closed true}
       [:principal-type PrincipalType]
       [:principal-id pos-int?]
       [:card-id {:optional true} [:maybe pos-int?]]
       [:dashboard-id {:optional true} [:maybe pos-int?]]]]
  (let [group-ids  (principal-group-ids principal-type principal-id)
        scope      (item-scope card-id dashboard-id)
        values     (principal-values principal-type principal-id)
        group-pick (when (= "group" principal-type)
                     (m/index-by :attribute (preview-attributes principal-id)))
        sources    (when (= "user" principal-type)
                     (user-value-sources principal-id))
        rule-reads (group-by :attribute (rule-uses group-ids))]
    (concat
     (for [[attribute uses] rule-reads
           :let [other-values (->> uses
                                   (keep (fn [{:keys [kind field_id database_id]}]
                                           (case kind
                                             "sandbox"       (some-> field_id permission-debug.db/field-column-values)
                                             "routing"       (permission-debug.db/destination-database-names database_id)
                                             nil)))
                                   (apply concat)
                                   (remove nil?) (map str) distinct sort vec)]]
       (cond-> {:attribute    attribute
                :value        (some-> (get values attribute) str)
                :uses         (mapv #(dissoc % :attribute) (distinct uses))
                :applies      (or (nil? scope) (boolean (some #(use-touches-scope? scope %) uses)))
                :other_values other-values}
         group-pick                   (assoc :member_values (get-in group-pick [attribute :member_values] [])
                                             :other_values  (get-in group-pick [attribute :other_values] other-values))
         (get sources attribute)      (merge (m/remove-vals nil? (get sources attribute)))))
     (for [attribute (sort (keys values))
           :when     (and (not (str/starts-with? attribute "@"))
                          (not (contains? rule-reads attribute)))]
       (cond-> {:attribute    attribute
                :value        (some-> (get values attribute) str)
                :uses         []
                :applies      false
                :other_values []}
         (get sources attribute) (merge (m/remove-vals nil? (get sources attribute))))))))

(defn- preview-user-email
  [principal-type principal-id]
  (format "permission-preview-%s-%d@permission-preview.invalid" principal-type principal-id))

(defn- most-common-tenant-id
  [group-id]
  (some->> (permission-debug.db/group-members-attributes group-id)
           (keep :tenant_id)
           frequencies
           not-empty
           (apply max-key val)
           key))

(defn- ensure-preview-user!
  "The ID of the hidden preview user of a group, created on first use: inactive, of type `:permission-preview`, in
  that group only (plus All Users or All tenant users, which every new user joins). A tenant group's preview user
  belongs to its members' most common tenant."
  [group-id group-name]
  (let [email (preview-user-email "group" group-id)]
    (or (permission-debug.db/preview-user-id email)
        (let [tenant-id    (when (permission-debug.db/tenant-group? group-id)
                             (api/check (most-common-tenant-id group-id)
                                        [400 (tru "This tenant group can''t be previewed until it has at least one user.")]))
              user-id      (permission-debug.db/insert-preview-user! {:email      email
                                                                      :first_name (tru "{0} preview" group-name)
                                                                      :tenant_id  tenant-id})
              magic-groups #{(:id (perms/all-users-group)) (:id (perms/all-external-users-group))}]
          (when-not (magic-groups group-id)
            (permission-debug.db/add-user-to-groups! user-id [group-id]))
          user-id))))

(mu/defn start-preview! :- [:map
                            [:user_id ::lib.schema.id/user]
                            [:user_name :string]
                            [:principal_name :string]
                            [:attributes Attributes]
                            [:preview_id :string]]
  "Resolve the principal an admin wants to preview to the user the request binds to, and record the start of the
  preview in the audit log. A user previews as themselves. A group previews as its hidden preview user, because
  permission checks look the user's groups up again by id, so the binding needs a user row; a real member would bring
  their other groups and their own attributes. A group's preview user carries `attributes`, defaulting to the most
  common value among members for each attribute the group's access depends on. A user's `attributes` override their
  own values in this admin's previews of them only. With
  `unsaved-edits-id` (from [[preview/create-unsaved-edits!]]), every request of the preview reads the admin's unsaved
  permission edits as if they were saved."
  [{:keys [principal-type principal-id attributes unsaved-edits-id]}
   :- [:map {:closed true}
       [:principal-type PrincipalType]
       [:principal-id pos-int?]
       [:attributes {:optional true} [:maybe Attributes]]
       [:unsaved-edits-id {:optional true} [:maybe :string]]]]
  (let [principal-name (case principal-type
                         "user"  (:user_name (some-> (permission-debug.db/user-summary principal-id) user-display))
                         "group" (-> (api/check-404 (first (permission-debug.db/groups #{principal-id})))
                                     (perms/group-display-name (perms/use-tenants))))
        _              (api/check (not (and (= "group" principal-type)
                                            (= principal-id (:id (perms/admin-group)))))
                                  [400 (tru "Admins can''t be previewed, because they can see everything.")])
        user-id        (if (= "user" principal-type)
                         principal-id
                         (ensure-preview-user! principal-id principal-name))
        ;; a user's own values stay on their row; these replace them in this admin's preview only
        overrides      (when (= "user" principal-type) (or attributes {}))
        attributes     (if (= "group" principal-type)
                         (into {}
                               (keep (fn [{:keys [attribute default]}]
                                       (when-let [value (get attributes attribute default)]
                                         (when-not (str/blank? value)
                                           [attribute value]))))
                               (preview-attributes principal-id))
                         ;; recorded in the audit log: the values the rules on their groups read
                         (into {}
                               (keep (fn [{:keys [attribute value]}] (when value [attribute value])))
                               (affecting-attributes {:principal-type principal-type
                                                      :principal-id   principal-id})))
        preview-id     (str (random-uuid))
        unsaved-edits  (when unsaved-edits-id
                         (api/check (preview/unsaved-edits-of api/*current-user-id* unsaved-edits-id)
                                    [400 (tru "These unsaved changes are no longer available. Go back to the permissions page and start the preview again.")]))]
    (api/check (permission-debug.db/previewable-user-info user-id)
               [400 (tru "Only active users who aren''t admins can be previewed.")])
    ;; TODO (proof of concept): one preview user per group stores the picked values on its own row, so two admins
    ;; previewing the same group with different values overwrite each other. Assumes one admin at a time.
    (when (= "group" principal-type)
      (permission-debug.db/set-user-login-attributes! user-id attributes))
    (when overrides
      (preview/set-attribute-overrides! api/*current-user-id* user-id preview-id overrides))
    (preview/set-preview-edits! api/*current-user-id* user-id preview-id unsaved-edits-id)
    (events/publish-event! :event/permissions-preview
                           {:user-id  api/*current-user-id*
                            :model    :model/User
                            :model-id user-id
                            :details  (cond-> {:action         "start"
                                               :preview-id     preview-id
                                               :principal-type principal-type
                                               :principal-id   principal-id
                                               :attributes     attributes}
                                        (seq overrides) (assoc :overrides overrides)
                                        unsaved-edits   (assoc :unsaved-edits (:edits unsaved-edits)))})
    {:user_id        user-id
     :user_name      principal-name
     :principal_name principal-name
     ;; the preview binds a group's values, and a user's overrides
     :attributes     (if (= "group" principal-type) attributes overrides)
     :preview_id     preview-id}))

(mu/defn end-preview! :- :nil
  "Record the end of the preview `preview-id` (from [[start-preview!]]) in the audit log, with the admin as the actor and
  the previewed user as the target."
  [{:keys [preview-id user-id principal-type principal-id attributes]}
   :- [:map {:closed true}
       [:preview-id :string]
       [:user-id ::lib.schema.id/user]
       [:principal-type PrincipalType]
       [:principal-id pos-int?]
       [:attributes {:optional true} [:maybe Attributes]]]]
  (events/publish-event! :event/permissions-preview
                         {:user-id  api/*current-user-id*
                          :model    :model/User
                          :model-id user-id
                          :details  (cond-> {:action         "end"
                                             :preview-id     preview-id
                                             :principal-type principal-type
                                             :principal-id   principal-id}
                                      (seq attributes) (assoc :attributes attributes))})
  (preview/clear-attribute-overrides! api/*current-user-id* user-id preview-id)
  (preview/clear-preview-edits! api/*current-user-id* user-id preview-id)
  nil)

(mu/defn preview-card-query :- :map
  "Run the Card with `card-id` as the User with `user-id` would run it: their permissions, attributes (including tenant
  attributes), sandboxes, connection impersonation and database routing all apply, because the whole request binding is
  swapped for theirs, as alerts and subscriptions already do for their creator. The calling admin's binding is back in
  place once this returns, and the preview is recorded in the audit log under the admin."
  [{:keys [user-id card-id]} :- [:map {:closed true}
                                 [:user-id ::lib.schema.id/user]
                                 [:card-id ::lib.schema.id/card]]]
  ;; TODO (proof of concept): inactive users can't be previewed; assumes previewing a deactivated user isn't needed.
  (api/check-404 (permission-debug.db/active-user-exists? user-id))
  (let [admin-id api/*current-user-id*
        card     (api/check-404 (permission-debug.db/card card-id))
        results  (request/with-current-user user-id
                   ;; TODO (proof of concept): the query execution log and the view log record the previewed user as
                   ;; the actor, so the preview shows up in their recents and usage analytics. Assumes that's
                   ;; acceptable for a proof of concept.
                   (qp.card/process-query-for-card
                    card :api
                    ;; a cached result from someone else's run (the admin's own, against the router database) must not
                    ;; be served as the previewed user's.
                    :ignore-cache true
                    ;; run inside the binding and return the results, rather than a streaming response that runs later
                    :make-run (fn [qp _export-format]
                                (fn [query info]
                                  (qp (update query :info merge info) nil)))))]
    (events/publish-event! :event/permissions-preview
                           {:user-id  admin-id
                            :model    :model/User
                            :model-id user-id
                            :details  {:card-id card-id}})
    results))

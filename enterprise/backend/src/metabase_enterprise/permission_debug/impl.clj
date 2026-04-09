(ns metabase-enterprise.permission-debug.impl
  "Implementation of permission debugging functionality.

  Maps actions to it's own definition of a permission type since the permission types used in our
  modeling don't necessarily match 1:1 with actions a user may perform in the ui.

  | Action Type | Action | Target Model | Permissions |
  | ----------- | ------ | ------------ | ----------- |
  | `:card/read` | get a card model via API | card | perms/collection-access |
  | `:card/query` | run the query associated with the card | card → tables used in query | perms/view-data perms/collection-access |
  | `:card/download-data` | download data from the card query | card → tables used in query | perms/download-results perms/collection-access |
  "
  (:require
   [clojure.set :as set]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def DebuggerSchema
  "Format of the response the Debugger will return"
  [:schema {:registry
            {::group-id :int
             ::perm-debug-info [:map
                                [:model-type  [:enum "card" "invalid"]]
                                [:model-id    :string]
                                [:decision    [:enum "allow" "denied" "limited"]]
                                [:segment     [:set [:enum "sandboxed" "impersonated" "routed"]]]
                                [:message     [:sequential :string]]
                                [:data        [:map]]
                                [:suggestions [:map-of ::group-id :string]]]}}
   ::perm-debug-info])

(def ActionType
  "Type of the action in the debugger API to dispatch on"
  [:enum :card/read :card/query :card/download-data])

(def DebuggerArguments
  "Arguments for the Debugger function. The model type being operated on is inferred by the requested action type"
  [:map
   [:user-id pos-int?]
   [:model-id :string]
   [:action-type ActionType]])

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
    (let [user-is-superuser? (t2/select-one-fn :is_superuser :model/User :id user-id)]
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
  ()
  {:decision    "allow"
   :model-type  (case (namespace action-type)
                  "card" "card")
   :model-id    model-id
   :segment     #{}
   :message     [(tru "Superuser is allowed full access")]
   :data        {}
   :suggestions {}})

(defn- user-can-read?
  "Reset the bound permissions to run a can read check for a specific user"
  [model pk user-id]
  (binding [api/*current-user-id* user-id
            api/*current-user-permissions-set* (delay (perms/user-permissions-set user-id))]
    (mi/can-read? model pk)))

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
  (let [can-read? (user-can-read? :model/Card (Integer/parseInt model-id) user-id)]
    {:decision    (if can-read? "allow" "denied")
     :model-type  "card"
     :model-id    model-id
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
        native? (boolean (lib.util.match/match-lite query {:native (_ :guard identity)} true))]
    (->>
     (cond
       native?
       ;; native queries are blocked if _any_ table in the database is blocked (or limited for download perms)
       (t2/query {:select [[:db.name :db_name] :blocked.schema [:blocked.name :table_name] [:pg.name :group_name]]
                  :from [[:metabase_table :blocked]]
                  :join [[(perms/select-tables-and-groups-granting-perm
                           {:user-id user-id
                            :is-superuser? false}
                           permissions-blocking) :perm_grant] [:= :blocked.id :perm_grant.id]
                         [:metabase_database :db] [:= :blocked.db_id :db.id]
                         [:permissions_group :pg] [:= :perm_grant.group_id :pg.id]]
                  :where [:and [:= :blocked.db_id (:database_id card)]
                          [:not
                           [:in :blocked.id (perms/visible-table-filter-select
                                             :id
                                             {:user-id user-id
                                              :is-superuser? false}
                                             permissions-granting)]]]})

       (seq query-tables)
       (t2/query {:select [[:db.name :db_name] :blocked.schema [:blocked.name :table_name] [:pg.name :group_name]]
                  :from [[:metabase_table :blocked]]
                  :join [[(perms/select-tables-and-groups-granting-perm
                           {:user-id user-id
                            :is-superuser? false}
                           permissions-blocking) :perm_grant] [:= :blocked.id :perm_grant.id]
                         [:metabase_database :db] [:= :blocked.db_id :db.id]
                         [:permissions_group :pg] [:= :perm_grant.group_id :pg.id]]
                  :where [:and [:in :blocked.id query-tables]
                          [:not
                           [:in :blocked.id (perms/visible-table-filter-select
                                             :id
                                             {:user-id user-id
                                              :is-superuser? false}
                                             permissions-granting)]]]})
       :else
       nil)
     (map (juxt (juxt :db_name :schema :table_name) :group_name))
     (reduce #(update %1 (first %2) set/union (set [(second %2)])) {}))))

(mu/defmethod debug-permissions :card/query :- DebuggerSchema
  [{:keys [user-id model-id] :as debug-info} :- DebuggerArguments]
  (merge-permission-check
   (debug-permissions (assoc debug-info :action-type :card/read))
   (let [card-id (Integer/parseInt model-id)
         card (t2/select-one :model/Card :id card-id)
         blocked-by-group (check-table-permissions user-id card
                                                   {:perms/view-data :blocked}
                                                   {:perms/view-data :legacy-no-self-service})]
     {:decision    (if (seq blocked-by-group) "denied" "allow")
      :segment     #{}
      :model-type  "card"
      :model-id    model-id
      :message     [(if (seq blocked-by-group)
                      (tru "User does not have permission to query this card")
                      (tru "User has permission to query this card"))]
      :data        (cond-> {}
                     (not-empty blocked-by-group) (assoc :blocked-tables (format-blocked blocked-by-group)))
      :suggestions {}})))

(mu/defmethod debug-permissions :card/download-data :- DebuggerSchema
  [{:keys [user-id model-id] :as debug-info} :- DebuggerArguments]
  (merge-permission-check
   (debug-permissions (assoc debug-info :action-type :card/query))
   (let [card-id (Integer/parseInt model-id)
         card (t2/select-one :model/Card :id card-id)
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
      :model-id    model-id
      :segment     #{}
      :message     [(cond
                      (seq blocked-by-group) (tru "User does not have permission to download data from this card")
                      (seq limited-by-group) (tru "User has permission to download some data from this card")
                      :else (tru "User has permission to download data from this card"))]
      :data        (cond-> {}
                     (not-empty limited-by-group) (assoc :download-limited-tables (format-blocked limited-by-group))
                     (not-empty blocked-by-group) (assoc :download-no-tables (format-blocked blocked-by-group)))
      :suggestions {}})))

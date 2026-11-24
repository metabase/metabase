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
  | `:dashboard/query` | load the cards of the dashboard | dashboard → tables used in its cards' queries | perms/view-data perms/collection-access |
  | `:collection/read` | get a collection via API | collection | perms/collection-access |

  Every answer carries the reasons per group (see [[metabase-enterprise.permission-debug.reasons]]) and the outcome
  the permissions model names: allowed, reshaped, limited, denied or broken.
  "
  (:require
   [clojure.set :as set]
   [metabase-enterprise.permission-debug.db :as permission-debug.db]
   [metabase-enterprise.permission-debug.reasons :as permission-debug.reasons]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.request.core :as request]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.match :as match]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def DebuggerSchema
  "Format of the response the Debugger will return"
  [:schema {:registry
            {::group-id :int
             ::reasons [:map {:closed true}
                        [:collection     {:optional true} :map]
                        [:tables         {:optional true} [:sequential :map]]
                        [:impersonations {:optional true} [:sequential :map]]
                        [:routes         {:optional true} [:sequential :map]]
                        [:problems       {:optional true} [:sequential :map]]]
             ::perm-debug-info [:map {:closed true}
                                [:model-type  [:enum "card" "dashboard" "collection" "invalid"]]
                                [:model-id    :string]
                                [:decision    [:enum "allow" "denied" "limited"]]
                                [:outcome     [:enum "allowed" "reshaped" "limited" "denied" "broken"]]
                                [:reasons     [:ref ::reasons]]
                                [:segment     [:set [:enum "sandboxed" "impersonated" "routed"]]]
                                [:message     [:sequential :string]]
                                [:data        [:map {:closed true}
                                               [:blocked-tables           {:optional true} [:map-of :string [:set :string]]]
                                               [:download-limited-tables  {:optional true} [:map-of :string [:set :string]]]
                                               [:download-no-tables       {:optional true} [:map-of :string [:set :string]]]
                                               [:cards-total              {:optional true} :int]
                                               [:cards-blocked            {:optional true} :int]]]
                                [:suggestions [:map-of ::group-id :string]]]}}
   ::perm-debug-info])

(def ActionType
  "Type of the action in the debugger API to dispatch on"
  [:enum :card/read :card/query :card/download-data :dashboard/read :dashboard/query :collection/read])

(def DebuggerArguments
  "Arguments for the Debugger function. The model type being operated on is inferred by the requested action type"
  [:map
   [:user-id pos-int?]
   [:model-id pos-int?]
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
    (let [user-is-superuser? (permission-debug.db/user-superuser? user-id)]
      (if user-is-superuser?
        ::is-superuser
        action-type))))

(mu/defmethod debug-permissions :default :- DebuggerSchema
  [_debug-info-map :- DebuggerArguments]
  {:decision    "denied"
   :model-type  "invalid"
   :model-id    ""
   :outcome     "denied"
   :reasons     {}
   :segment     #{}
   :message     [(tru "Unknown permission type")]
   :data        {}
   :suggestions {}})

(mu/defmethod debug-permissions ::is-superuser :- DebuggerSchema
  [{:keys [action-type model-id]} :- DebuggerArguments]
  {:decision    "allow"
   :model-type  (namespace action-type)
   :model-id    (str model-id)
   :outcome     "allowed"
   :reasons     {}
   :segment     #{}
   :message     [(tru "Superuser is allowed full access")]
   :data        {}
   :suggestions {}})

(defn- user-can-read?
  "Whether the User with `user-id` can read `entity`, checked as that User."
  [user-id entity]
  (request/with-current-user user-id
    (boolean (some-> entity (t2/hydrate :can_read) mi/can-read?))))

(defn- response-outcome
  "The outcome of `response`: denied, else broken when a policy can't work, else limited, reshaped or allowed."
  [{:keys [decision segment reasons]}]
  (cond
    (= "denied" decision)       "denied"
    (seq (:problems reasons))   "broken"
    (= "limited" decision)      "limited"
    (seq segment)               "reshaped"
    :else                       "allowed"))

(defn- with-outcome
  [response]
  (assoc response :outcome (response-outcome response)))

(mu/defn- merge-permission-check :- DebuggerSchema
  "Merges n permissions responses with right most wins semantics. model-type and model-id must match across
  permissions responses. If the decision is denied that should take precedence over limited which should be
  preferred over allowed when merging. The reasons of every response are kept, since a reason explains an answer even
  when another response wins."
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
      (with-outcome
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
                     :reasons     (merge (:reasons acc) (:reasons response))
                     :segment     (set/union (if acc-contributes? (:segment acc) #{})
                                             (if response-contributes? (:segment response) #{}))
                     :message     (into (if acc-contributes? (:message acc) [])
                                        (if response-contributes? (:message response) []))
                     :data        (merge (if acc-contributes? (:data acc) {})
                                         (if response-contributes? (:data response) {}))
                     :suggestions (merge (if acc-contributes? (:suggestions acc) {})
                                         (if response-contributes? (:suggestions response) {}))}))
                first-response
                (rest responses))))))

(defn- collection-id-reasons
  [user-id collection-id]
  {:collection (permission-debug.reasons/collection-reasons user-id collection-id)})

(mu/defmethod debug-permissions :card/read :- DebuggerSchema
  [{:keys [user-id model-id] :as _debug-info} :- DebuggerArguments]
  (let [card      (permission-debug.db/card model-id)
        can-read? (user-can-read? user-id card)]
    (with-outcome
      {:decision    (if can-read? "allow" "denied")
       :model-type  "card"
       :model-id    (str model-id)
       :reasons     (if card (collection-id-reasons user-id (:collection_id card)) {})
       :segment     #{}
       :message     [(if can-read?
                       (tru "User has permission to read this card")
                       (tru "User does not have permission to read this card"))]
       :data        {}
       :suggestions {}})))

(defn- format-blocked
  "Formats a map of [:db_name :schema :table_name] -> #{:group_name} into a translatable string like:
  db_name.schema.table_name by group_name_1 and group_name 2."
  [blocked-by-group]
  (update-keys blocked-by-group (fn [[db-name schema table-name]]
                                  (if schema
                                    (str db-name "." schema "." table-name)
                                    (str db-name "." table-name)))))

(defn- expanded-query
  "The preprocessed query of `card`, as the User with `user-id`, so that row and column security has rewritten it and
  the Tables its policies join in are part of it. When a policy can't run for them (a missing attribute, conflicting
  policies), the query as it is without policies."
  [user-id card]
  (try
    (request/with-current-user user-id
      (qp.preprocess/preprocess (:dataset_query card)))
    (catch clojure.lang.ExceptionInfo _
      (qp.preprocess/preprocess (:dataset_query card)))))

(defn- card-tables
  "The Tables the query of `card` reads for the User with `user-id`: `{:native? :database-id :table-ids}`."
  [user-id card]
  (let [query (expanded-query user-id card)]
    {:native?     (boolean (match/match-one query {:native &truthy} true))
     :database-id (:database_id card)
     :table-ids   (lib/all-source-table-ids query)}))

(defn- check-table-permissions
  "Check table-level permissions for the Tables of a card's query.

  Arguments:
   - user-id: The ID of the user to check permissions for
   - card-tables: The Tables the card's query reads, as [[card-tables]] returns them
   - permissions-blocking: Map specifying which permission types to check for blocking
                           (e.g., {:perms/view-data :blocked} or {:perms/download-results :no})
   - permissions-granting: Map specifying which permission types should be considered as granting access
                            (e.g., {:perms/view-data :legacy-no-self-service} or {:perms/download-results :ten-thousand-rows})

   Returns a map of blocked tables by group in the format:
   {[db-name schema table-name] #{group-name-1 group-name-2}}"
  [user-id {:keys [native? database-id table-ids]} permissions-blocking permissions-granting]
  (->>
   (cond
     native?
     ;; native queries are blocked if _any_ table in the database is blocked (or limited for download perms)
     (permission-debug.db/blocked-tables-in-database user-id database-id
                                                     permissions-blocking permissions-granting)

     (seq table-ids)
     (permission-debug.db/blocked-tables-among user-id table-ids permissions-blocking permissions-granting)

     :else
     nil)
   (map (juxt (juxt :db_name :schema :table_name) :group_name))
   (reduce #(update %1 (first %2) set/union (set [(second %2)])) {})))

(defn- reason-table-ids
  "The Tables worth explaining for `card-tables`: the ones its query reads, and for a native query, whose Tables are
  the whole Database's, those a policy or a block keeps the User from using as they are."
  [user-id {:keys [native? database-id table-ids]}]
  (if native?
    (let [group-ids (set (map :id (permission-debug.db/user-groups user-id)))
          blocked   (permission-debug.db/blocked-tables-in-database user-id database-id
                                                                    {:perms/view-data :blocked}
                                                                    {:perms/view-data :legacy-no-self-service})]
      (into (set (map :table_id blocked))
            (map :table_id)
            (permission-debug.db/sandboxes group-ids (permission-debug.db/table-ids-of-database database-id))))
    table-ids))

(defn- table-segments
  "The kinds of policy that `table-reasons` enforces: sandboxed, impersonated, routed."
  [{:keys [tables impersonations routes]}]
  (cond-> #{}
    (some :enforced? (mapcat :sandboxes tables)) (conj "sandboxed")
    (some :enforced? impersonations)             (conj "impersonated")
    (some #(= "routed" (:status %)) routes)      (conj "routed")))

(mu/defmethod debug-permissions :card/query :- DebuggerSchema
  [{:keys [user-id model-id] :as debug-info} :- DebuggerArguments]
  (merge-permission-check
   (debug-permissions (assoc debug-info :action-type :card/read))
   (let [card             (permission-debug.db/card model-id)
         tables           (card-tables user-id card)
         blocked-by-group (check-table-permissions user-id tables
                                                   {:perms/view-data :blocked}
                                                   {:perms/view-data :legacy-no-self-service})
         reasons          (permission-debug.reasons/table-reasons user-id (reason-table-ids user-id tables))]
     (with-outcome
       {:decision    (if (seq blocked-by-group) "denied" "allow")
        :segment     (table-segments reasons)
        :model-type  "card"
        :model-id    (str model-id)
        :reasons     reasons
        :message     [(if (seq blocked-by-group)
                        (tru "User does not have permission to query this card")
                        (tru "User has permission to query this card"))]
        :data        (cond-> {}
                       (not-empty blocked-by-group) (assoc :blocked-tables (format-blocked blocked-by-group)))
        :suggestions {}}))))

(mu/defmethod debug-permissions :card/download-data :- DebuggerSchema
  [{:keys [user-id model-id] :as debug-info} :- DebuggerArguments]
  (merge-permission-check
   (debug-permissions (assoc debug-info :action-type :card/query))
   (let [card             (permission-debug.db/card model-id)
         tables           (card-tables user-id card)
         limited-by-group (check-table-permissions user-id tables
                                                   {:perms/download-results :ten-thousand-rows}
                                                   {:perms/download-results :one-million-rows})
         blocked-by-group (check-table-permissions user-id tables
                                                   {:perms/download-results :no}
                                                   {:perms/download-results :ten-thousand-rows})]
     (with-outcome
       {:decision    (cond
                       (seq blocked-by-group) "denied"
                       (seq limited-by-group) "limited"
                       :else "allow")
        :model-type  "card"
        :model-id    (str model-id)
        :reasons     {}
        :segment     #{}
        :message     [(cond
                        (seq blocked-by-group) (tru "User does not have permission to download data from this card")
                        (seq limited-by-group) (tru "User has permission to download some data from this card")
                        :else (tru "User has permission to download data from this card"))]
        :data        (cond-> {}
                       (not-empty limited-by-group) (assoc :download-limited-tables (format-blocked limited-by-group))
                       (not-empty blocked-by-group) (assoc :download-no-tables (format-blocked blocked-by-group)))
        :suggestions {}}))))

(mu/defmethod debug-permissions :dashboard/read :- DebuggerSchema
  [{:keys [user-id model-id] :as _debug-info} :- DebuggerArguments]
  (let [dashboard (permission-debug.db/dashboard model-id)
        can-read? (user-can-read? user-id dashboard)]
    (with-outcome
      {:decision    (if can-read? "allow" "denied")
       :model-type  "dashboard"
       :model-id    (str model-id)
       :reasons     (if dashboard (collection-id-reasons user-id (:collection_id dashboard)) {})
       :segment     #{}
       :message     [(if can-read?
                       (tru "User has permission to read this dashboard")
                       (tru "User does not have permission to read this dashboard"))]
       :data        {}
       :suggestions {}})))

(mu/defmethod debug-permissions :dashboard/query :- DebuggerSchema
  [{:keys [user-id model-id] :as debug-info} :- DebuggerArguments]
  (merge-permission-check
   (debug-permissions (assoc debug-info :action-type :dashboard/read))
   (let [cards            (permission-debug.db/dashboard-cards model-id)
         cards-tables     (map #(card-tables user-id %) cards)
         blocked-per-card (map #(check-table-permissions user-id %
                                                         {:perms/view-data :blocked}
                                                         {:perms/view-data :legacy-no-self-service})
                               cards-tables)
         blocked-by-group (apply merge-with set/union {} blocked-per-card)
         blocked-cards    (count (filter seq blocked-per-card))
         reasons          (permission-debug.reasons/table-reasons
                           user-id (into #{} (mapcat #(reason-table-ids user-id %)) cards-tables))
         decision         (cond
                            (zero? blocked-cards)                    "allow"
                            (= blocked-cards (count cards))          "denied"
                            :else                                    "limited")]
     (with-outcome
       {:decision    decision
        :segment     (table-segments reasons)
        :model-type  "dashboard"
        :model-id    (str model-id)
        :reasons     reasons
        :message     [(case decision
                        "allow"  (tru "User has permission to see the results of this dashboard''s cards")
                        "denied" (tru "User does not have permission to see the results of any card on this dashboard")
                        "limited" (tru "User does not have permission to see the results of some cards on this dashboard"))]
        :data        (cond-> {:cards-total (count cards) :cards-blocked blocked-cards}
                       (not-empty blocked-by-group) (assoc :blocked-tables (format-blocked blocked-by-group)))
        :suggestions {}}))))

(mu/defmethod debug-permissions :collection/read :- DebuggerSchema
  [{:keys [user-id model-id] :as _debug-info} :- DebuggerArguments]
  (let [collection (permission-debug.db/collection model-id)
        can-read?  (user-can-read? user-id collection)]
    (with-outcome
      {:decision    (if can-read? "allow" "denied")
       :model-type  "collection"
       :model-id    (str model-id)
       :reasons     (if collection (collection-id-reasons user-id model-id) {})
       :segment     #{}
       :message     [(if can-read?
                       (tru "User has permission to read this collection")
                       (tru "User does not have permission to read this collection"))]
       :data        {}
       :suggestions {}})))

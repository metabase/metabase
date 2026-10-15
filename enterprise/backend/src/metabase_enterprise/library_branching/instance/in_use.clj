(ns metabase-enterprise.library-branching.instance.in-use
  "The content outside the Library that uses an item: the cards and dashboards that are not in scope and not in the
  trash, and that refer to it."
  (:require
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.format.kinds.portable :as format.portable]
   [metabase-enterprise.library-branching.instance.kinds.card :as kinds.card]
   [metabase-enterprise.library-branching.instance.kinds.dashboard :as kinds.dashboard]
   [metabase-enterprise.library-branching.instance.portable :as portable]
   [metabase-enterprise.library-branching.scope :as scope]))

(set! *warn-on-reflection* true)

(def ^:private model-of
  {:action    :model/Action
   :dashboard :model/Dashboard
   :measure   :model/Measure
   :metric    :model/Card
   :model     :model/Card
   :question  :model/Card
   :segment   :model/Segment
   :snippet   :model/NativeQuerySnippet})

(def ^:private roles
  "The roles of a reference that uses an item of each kind."
  {:dashboard #{:dashboard}
   :measure   #{:measure}
   :metric    #{:metric :card :source-card}
   :model     #{:card :source-card}
   :question  #{:card :source-card}
   :segment   #{:segment}
   :snippet   #{:snippet}})

(def ^:private card-kinds
  "The kinds of the cards, which a dashboard can show."
  #{:metric :model :question})

(defn- card-refs
  "`{card refs}`: the references of the portable query of each card of `cards`."
  [cards]
  (let [export (get (kinds.card/export-fns) :query (fn [_card v] v))]
    (zipmap cards (portable/export-batch (fn [card] (format.portable/query-refs (portable/document (export card (:dataset_query card)))))
                                         cards))))

(defn- uses?
  "True iff the references `refs` hold one to item `id` of `kind`."
  [kind id refs]
  (some (fn [[role target]] (and (= id target) (contains? (roles kind) role))) refs))

(defn- query-users
  "The users of item `id` of `kind`, with row id `row-id`, outside `in-scope`: the cards whose queries refer to it, and
  for a card, the dashboards that show it."
  [in-scope id kind row-id]
  (concat
   (for [[card refs] (card-refs (library-branching.db/cards-mentioning row-id))
         :when (and (not (contains? in-scope (:entity_id card))) (uses? kind id refs))]
     {:kind :card :id (:entity_id card) :name (:name card)})
   (when (contains? card-kinds kind)
     (for [{:keys [entity_id name]} (library-branching.db/dashboards-showing row-id)
           :when (not (contains? in-scope entity_id))]
       {:kind :dashboard :id entity_id :name name}))))

(defn- dashboard-users
  "The users of dashboard `id`, with row id `row-id`, outside `in-scope`: the cards and dashboards whose content refers
  to it by a click behavior or a link card."
  [in-scope id row-id]
  ;; A question of the dashboard is no user: a trash of the dashboard puts its questions in the trash.
  (let [users (fn [user-kind read-items candidates]
                (for [[eid {:keys [name refs]}] (read-items (remove in-scope candidates))
                      :when (uses? :dashboard id refs)]
                  {:kind user-kind :id eid :name name}))]
    (concat (users :card kinds.card/read-cards (library-branching.db/cards-mentioning-dashboard row-id))
            (users :dashboard kinds.dashboard/read-dashboards (library-branching.db/dashboards-mentioning-dashboard row-id)))))

(defn- action-users
  "The users of the action with row id `row-id` outside `in-scope`: the dashboards with a button of it."
  [in-scope row-id]
  (for [{:keys [entity_id name]} (library-branching.db/dashboards-with-action row-id)
        :when (not (contains? in-scope entity_id))]
    {:kind :dashboard :id entity_id :name name}))

(defn- users
  "The users outside the Library of the trashed item `id` of `kind`. `in-scope` is the set of the identities of the
  in-scope cards and dashboards."
  [in-scope {:keys [id kind]}]
  (when-let [row-id (some-> (model-of kind) (library-branching.db/row-id-by-entity-id id))]
    (not-empty (vec (sort-by (juxt :kind :name :id)
                             (case kind
                               :action    (action-users in-scope row-id)
                               :dashboard (dashboard-users in-scope id row-id)
                               (query-users in-scope id kind row-id)))))))

(defn trashed-in-use
  "`{identity [{:kind :id :name} ...]}`: of the trashed items `trashed` (`[{:id :kind}]`), each one that a card or a
  dashboard outside the scope of `roots` (default `scope/roots`) uses, with those users, sorted. Only cards,
  dashboards, snippets, segments, measures and actions have such users. Reads in the current transaction."
  ([trashed]
   (trashed-in-use scope/roots trashed))
  ([roots trashed]
   (if (empty? trashed)
     {}
     (let [in-scope (into #{} cat (vals (scope/scope-ids roots #{:dashboard :metric :model :question})))]
       (into {}
             (keep (fn [t] (when-let [us (users in-scope t)] [(:id t) us])))
             trashed)))))

(ns metabase-enterprise.library-branching.instance.in-use
  "The content outside the Library that uses an item: the cards and dashboards that are not in scope and not in the
  trash, and that refer to it."
  (:require
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.format.kinds.portable :as format.portable]
   [metabase-enterprise.library-branching.instance.kinds.metric :as kinds.metric]
   [metabase-enterprise.library-branching.instance.portable :as portable]
   [metabase-enterprise.library-branching.scope :as scope]))

(set! *warn-on-reflection* true)

(def ^:private model-of
  {:metric  :model/Card
   :snippet :model/NativeQuerySnippet})

(def ^:private roles
  "The roles of a reference that uses an item of each kind."
  {:metric  #{:metric :card :source-card}
   :snippet #{:snippet}})

(defn- card-refs
  "`{card refs}`: the references of the portable query of each card of `cards`."
  [cards]
  (let [export (get (kinds.metric/export-fns) :query identity)]
    (zipmap cards (portable/export-batch (fn [card] (format.portable/query-refs (portable/document (export (:dataset_query card)))))
                                         cards))))

(defn- users
  "The users outside the Library of the trashed item `id` of `kind`. `in-scope` is the set of the identities of the
  in-scope cards and dashboards."
  [in-scope {:keys [id kind]}]
  (when-let [row-id (some-> (model-of kind) (library-branching.db/row-id-by-entity-id id))]
    (let [uses?      (fn [refs] (some (fn [[role target]] (and (= id target) (contains? (roles kind) role))) refs))
          cards      (for [[card refs] (card-refs (library-branching.db/cards-mentioning row-id))
                           :when (and (not (contains? in-scope (:entity_id card))) (uses? refs))]
                       {:kind :card :id (:entity_id card) :name (:name card)})
          dashboards (when (= :metric kind)
                       (for [{:keys [entity_id name]} (library-branching.db/dashboards-showing row-id)
                             :when (not (contains? in-scope entity_id))]
                         {:kind :dashboard :id entity_id :name name}))]
      (not-empty (vec (sort-by (juxt :kind :name :id) (concat cards dashboards)))))))

(defn trashed-in-use
  "`{identity [{:kind :id :name} ...]}`: of the trashed items `trashed` (`[{:id :kind}]`), each one that a card or a
  dashboard outside the scope of `roots` (default `scope/roots`) uses, with those users, sorted. Only metrics and
  snippets have such users. Reads in the current transaction."
  ([trashed]
   (trashed-in-use scope/roots trashed))
  ([roots trashed]
   (if (empty? trashed)
     {}
     (let [in-scope (into #{} cat (vals (scope/scope-ids roots #{:dashboard :metric :model :question})))]
       (into {}
             (keep (fn [t] (when-let [us (users in-scope t)] [(:id t) us])))
             trashed)))))

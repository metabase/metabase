(ns metabase-enterprise.library-branching.scope
  "Scope: the items that library branching syncs, computed from the app DB alone.

  Scope is the containment closure of [[roots]] minus the trash. An item is in scope iff it is not archived, and its
  collection is in scope, or it is at the root level of a root namespace that holds its kind, or its kind is one of
  the kinds with no container that the roots hold; a segment or a measure is in scope iff it is not archived and its
  table is an in-scope published table. Every reader of scope calls [[scope-ids]] or [[scope-count]].

  Precondition: archive is closed downward. An archived collection's subtree and the items in it, and a dashboard's
  questions, are archived with it; an archive on the instance keeps this."
  (:require
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.roots :as library-branching.roots]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]))

(set! *warn-on-reflection* true)

(def roots
  "The fixed roots of scope: `library-branching.roots/roots`."
  library-branching.roots/roots)

(def kinds
  "The kinds of the items that scope holds."
  #{:action :collection :dashboard :data-app :document :glossary-term :measure :metric :model :published-table
    :python-library :question :segment :snippet :transform :transform-job :transform-tag})

(defmulti kind-query
  "HoneySQL that selects the in-scope items of `kind` for `roots`: the column `:id`, and `:entity_id` (or `:db`,
  `:schema` and `:table` for a published table). The query has the metadata `:allow-subquery`, so it can be a
  subquery."
  {:arglists '([roots kind])}
  (fn [_roots kind] kind))

(defn- subquery
  [query]
  (vary-meta query assoc :allow-subquery true))

(defn- unarchived
  [column]
  [:= column false])

(defn- in-scope
  "HoneySQL: `column` holds the id of an in-scope item of `kind`."
  [roots column kind]
  [:in column (subquery {:select [:s.id] :from [[(kind-query roots kind) :s]]})])

(defn- root-level
  "HoneySQL: `condition`, if `roots` puts the root-level items of `kind` in scope; else false."
  [{:keys [namespaces root-level]} kind condition]
  (if (contains? namespaces (get root-level kind))
    condition
    false))

(defn- unplaced
  "True iff `roots` puts every item of `kind`, a kind with no container, in scope."
  [{:keys [unplaced-kinds]} kind]
  (contains? unplaced-kinds kind))

(defn- in-namespaces
  "HoneySQL: the collection aliased `c` is in one of `namespaces`."
  [namespaces]
  (if (seq namespaces)
    [:in :c.namespace (mapv name (sort namespaces))]
    false))

(defn- in-tree
  "HoneySQL: the collection aliased `c` is a collection of one of `types`, or in the subtree of one."
  [types]
  (if (seq types)
    [:exists (subquery {:select [[1 :one]]
                        :from   [[:collection :r]]
                        :where  [:and
                                 [:in :r.type (vec (sort types))]
                                 [:or
                                  [:= :r.id :c.id]
                                  [:like :c.location [:concat :r.location :r.id "/%"]]]]})]
    false))

(defmethod kind-query :collection
  [{:keys [collection-types namespaces]} _kind]
  (subquery {:select [:c.id :c.entity_id]
             :from   [[:collection :c]]
             :where  [:and
                      (unarchived :c.archived)
                      [:or (in-namespaces namespaces) (in-tree collection-types)]]}))

(defn- card-query
  [roots card-type]
  (subquery {:select [:t.id :t.entity_id]
             :from   [[:report_card :t]]
             :where  [:and
                      [:= :t.type card-type]
                      (unarchived :t.archived)
                      (in-scope roots :t.collection_id :collection)]}))

(defmethod kind-query :metric
  [roots _kind]
  (card-query roots "metric"))

(defmethod kind-query :model
  [roots _kind]
  (card-query roots "model"))

(defmethod kind-query :question
  [roots _kind]
  (card-query roots "question"))

(defmethod kind-query :dashboard
  [roots _kind]
  (subquery {:select [:t.id :t.entity_id]
             :from   [[:report_dashboard :t]]
             :where  [:and
                      (unarchived :t.archived)
                      (in-scope roots :t.collection_id :collection)]}))

;; An exploration's summary document belongs to its exploration, which does not sync.
(defmethod kind-query :document
  [roots _kind]
  (subquery {:select [:t.id :t.entity_id]
             :from   [[:document :t]]
             :where  [:and
                      (unarchived :t.archived)
                      [:= :t.exploration_id nil]
                      (in-scope roots :t.collection_id :collection)]}))

(defmethod kind-query :published-table
  [roots _kind]
  (subquery {:select [:t.id [:d.name :db] :t.schema [:t.name :table]]
             :from   [(warehouse-schema-overlay/table-query {:alias :t})]
             :join   [[:metabase_database :d] [:= :d.id :t.db_id]]
             :where  [:and
                      [:= :t.is_published true]
                      [:= :t.archived_at nil]
                      (in-scope roots :t.collection_id :collection)]}))

(defn- table-item-query
  "The in-scope rows of `table`, whose rows live on a warehouse table: those not archived on an in-scope published
  table."
  [roots table]
  (subquery {:select [:t.id :t.entity_id]
             :from   [[table :t]]
             :where  [:and
                      (unarchived :t.archived)
                      (in-scope roots :t.table_id :published-table)]}))

(defmethod kind-query :segment
  [roots _kind]
  (table-item-query roots :segment))

(defmethod kind-query :measure
  [roots _kind]
  (table-item-query roots :measure))

(defmethod kind-query :snippet
  [roots _kind]
  (subquery {:select [:t.id :t.entity_id]
             :from   [[:native_query_snippet :t]]
             :where  [:and
                      (unarchived :t.archived)
                      [:or
                       (root-level roots :snippet [:= :t.collection_id nil])
                       (in-scope roots :t.collection_id :collection)]]}))

;; A transform has no archived flag; it leaves scope only with its collection.
(defmethod kind-query :transform
  [roots _kind]
  (subquery {:select [:t.id :t.entity_id]
             :from   [[:transform :t]]
             :where  [:or
                      (root-level roots :transform [:= :t.collection_id nil])
                      (in-scope roots :t.collection_id :collection)]}))

;; An action with a model belongs to its model. Only an action without a model is at the root level.
(defmethod kind-query :action
  [roots _kind]
  (subquery {:select [:t.id :t.entity_id]
             :from   [[:action :t]]
             :where  [:and
                      (unarchived :t.archived)
                      [:or
                       (root-level roots :action [:and [:= :t.collection_id nil] [:= :t.model_id nil]])
                       (in-scope roots :t.collection_id :collection)]]}))

;; A data app is in no collection: every data app is at the root level of its namespace.
(defmethod kind-query :data-app
  [roots _kind]
  (subquery {:select [:t.id :t.entity_id]
             :from   [[:data_app :t]]
             :where  (root-level roots :data-app true)}))

;; A built-in tag or job belongs to the release, which creates it on every instance.
(defmethod kind-query :transform-tag
  [roots _kind]
  (subquery {:select [:t.id :t.entity_id]
             :from   [[:transform_tag :t]]
             :where  (root-level roots :transform-tag [:= :t.built_in_type nil])}))

(defmethod kind-query :transform-job
  [roots _kind]
  (subquery {:select [:t.id :t.entity_id]
             :from   [[:transform_job :t]]
             :where  (root-level roots :transform-job [:= :t.built_in_type nil])}))

;; The built-in library is in scope: its source can change.
(defmethod kind-query :python-library
  [roots _kind]
  (subquery {:select [:t.id :t.entity_id]
             :from   [[:python_library :t]]
             :where  (root-level roots :python-library true)}))

;; A glossary term is in no collection, and Metabase has no trash for it.
(defmethod kind-query :glossary-term
  [roots kind]
  (subquery {:select [:t.id :t.entity_id]
             :from   [[:glossary :t]]
             :where  (unplaced roots kind)}))

(defn- row-identity
  [kind row]
  (if (= :published-table kind)
    [(:db row) (:schema row) (:table row)]
    (:entity_id row)))

(defn scope-ids
  "`{kind #{identity}}`: the identities of the in-scope items of each kind of `ks` (default [[kinds]]), for `roots`
  (default [[roots]]). Reads the app DB in the current transaction, with one query per kind."
  ([]
   (scope-ids roots))
  ([roots]
   (scope-ids roots kinds))
  ([roots ks]
   (into {}
         (map (fn [kind]
                [kind (into #{}
                            (map (partial row-identity kind))
                            (library-branching.db/rows (kind-query roots kind)))]))
         ks)))

(defn scope-count
  "`{kind n}`: the number of in-scope items of each kind of [[kinds]], for `roots` (default [[roots]]). Equals the
  size of each set of [[scope-ids]]. Reads the app DB in the current transaction, with one query per kind."
  ([]
   (scope-count roots))
  ([roots]
   (into {}
         (map (fn [kind] [kind (library-branching.db/row-count (kind-query roots kind))]))
         kinds)))

(defn row-in-scope?
  "True iff the row with app DB id `row-id` of the table of `kind` holds an in-scope item for `roots` (default
  [[roots]]). Reads the app DB in the current transaction, with one query."
  ([kind row-id]
   (row-in-scope? roots kind row-id))
  ([roots kind row-id]
   (pos? (library-branching.db/row-count
          (subquery {:select [:s.id] :from [[(kind-query roots kind) :s]] :where [:= :s.id row-id]})))))

(defn place-in-scope?
  "True iff a new item of `kind` in the collection with app DB id `collection-id` (nil: at the root level) is in scope
  for `roots` (default [[roots]]): the collection is in scope, or, at the root level, `roots` puts the root-level or
  unplaced items of `kind` in scope. Reads the app DB in the current transaction, with at most one query."
  ([kind collection-id]
   (place-in-scope? roots kind collection-id))
  ([roots kind collection-id]
   (if (some? collection-id)
     (row-in-scope? roots :collection collection-id)
     (boolean (or (unplaced roots kind)
                  (contains? (:namespaces roots) (get (:root-level roots) kind)))))))

(defn in-scope?
  "True iff the item of `kind` with identity `id` is in scope for `roots` (default [[roots]]). Reads the app DB in the
  current transaction, with one query."
  ([kind id]
   (in-scope? roots kind id))
  ([roots kind id]
   (let [match (if (= :published-table kind)
                 (let [[db schema table] id]
                   [:and [:= :s.db db] [:= :s.schema schema] [:= :s.table table]])
                 [:= :s.entity_id id])]
     (pos? (library-branching.db/row-count
            (subquery {:select [:s.id] :from [[(kind-query roots kind) :s]] :where match}))))))

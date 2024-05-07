(ns metabase.lib.datascript
  (:refer-clojure :exclude [filter])
  (:require
   [clojure.walk :as walk]
   [datascript.core :as d]
   [medley.core :as m]
   [metabase.lib.metadata :as lib.metadata]))

(def ^:private metadata-schema
  {;; Databases - just exist for now.
   :metadata.database/id          {:db/cardinality :db.cardinality/one
                                   #_#_:db/valueType   :db.type/int
                                   :db/unique      :db.unique/identity}

   ;; Tables - ID, name, database
   :metadata.table/id             {:db/cardinality :db.cardinality/one
                                   #_#_:db/valueType   :db.type/int
                                   :db/unique      :db.unique/identity}
   :metadata.table/name           {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/string}
   :metadata.table/display-name   {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/string}
   :metadata.table/schema         {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/string}
   :metadata.table/database       {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}

   ;; Fields - ID, name, table, fk-target, position, base-type, effective-type, semantic-type
   :metadata.field/id             {:db/cardinality :db.cardinality/one
                                   #_#_:db/valueType   :db.type/int
                                   :db/unique      :db.unique/identity}
   :metadata.field/name           {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/string}
   :metadata.field/table          {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}
   :metadata.field/fk-target      {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref} ; field
   :metadata.field/position       {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/int}
   :metadata.field/base-type      {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/keyword}
   :metadata.field/effective-type {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/keyword}
   :metadata.field/semantic-type  {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/keyword}})

(defn- ns-keys [m nspace]
  (update-keys m #(keyword nspace (name %))))

(defn- field-tx [field-metadata]
  (-> field-metadata
      (select-keys [:id :name :display-name :position :base-type])
      (ns-keys "metadata.field")
      (assoc :db/id (- (:id field-metadata))) ; Set the :db/id to the negated field ID for FKs to work.
      (m/assoc-some :metadata.field/effective-type (:effective-type field-metadata))
      (m/assoc-some :metadata.field/semantic-type  (:semantic-type  field-metadata))
      ;; Since the order of the fields is not known in advance, using [:metadata.field/id 7] entids for
      ;; `:fk-target` won't work. Nothing else is using tempids, so we can just negate the Metabase field IDs
      ;; to yield valid, unique tempids for the fields.
      (m/assoc-some :metadata.field/fk-target
                    (when-let [fk-id (:fk-target-field-id field-metadata)]
                      (- fk-id)))))

(defn- table-tx [table-metadata]
  (-> table-metadata
      (select-keys [:id :name :display-name])
      (ns-keys "metadata.table")
      (m/assoc-some :metadata.table/schema (:schema table-metadata))))

(defn- metadata-tx
  "Given a metadata provider, returns a transactable data structure for that provider."
  [metadata-provider]
  {:metadata.database/id (:id (lib.metadata/database metadata-provider))
   :metadata.table/_database
   (vec (for [table (lib.metadata/tables metadata-provider)]
          (let [fields (mapv field-tx (lib.metadata/fields metadata-provider (:id table)))]
            (assoc (table-tx table) :metadata.field/_table fields))))})

#?(:clj
   (comment
     (require '[metabase.lib.metadata.jvm])
     (def mp (metabase.lib.metadata.jvm/application-database-metadata-provider 1))))

(def query-schema
  "Schema for MBQL queries."
  {;; A query is defined as the *last* stage.
   :mbql.query/database           {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}
   :mbql.query/stage              {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}
   :mbql.query/stage0             {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}

   ;; MBQL Stages - Effectively a doubly-linked list since DataScript refs are always indexed both ways.
   ;; You can move from a stage to its successor with `:mbql.stage/_previous-stage`
   :mbql.stage/previous-stage     {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}
   :mbql.stage/query              {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}

   ;; Primary source of a stage. Sources are reified as separate entities.
   ;; They might contain a limited set of columns, or they might not. If they don't, the entire
   ;; underlying source (:mbql.source/incoming) is included.
   :mbql.stage/source             {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}

   :mbql.source/incoming          {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}
   :mbql.source/field             {:db/cardinality :db.cardinality/many, :db/valueType :db.type/ref}


   ;; Stages have many parts:
   ;; - A single(?) :mbql/source (always)
   ;; - 0+ :mbql.stage/aggregation
   ;; - 0+ :mbql.stage/expression
   ;; - 0+ :mbql.stage/filter
   ;; - 0+ :mbql.stage/join
   ;; - 0+ :mbql.stage/breakout
   :mbql.stage/filter             {:db/cardinality :db.cardinality/many, :db/valueType :db.type/ref}
   :mbql.stage/aggregation        {:db/cardinality :db.cardinality/many, :db/valueType :db.type/ref}
   :mbql.stage/expression         {:db/cardinality :db.cardinality/many, :db/valueType :db.type/ref}
   :mbql.stage/breakout           {:db/cardinality :db.cardinality/many, :db/valueType :db.type/ref}

   ;; Aggregations have an `:mbql.aggregation/operator`, eg. `:count`, `:sum`, etc.
   ;; Some have no argument (`:count`) and some have a column `:mbql.aggregation/column`.
   ;; `:count-where` and `:sum-where` have `:mbql.aggregation/filter` (a `:mbql.clause/*` like filters).
   ;; `:sum-where` has both `column` and `filter`.
   :mbql.aggregation/operator     {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/keyword}
   :mbql.aggregation/column       {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}
   :mbql.aggregation/filter       {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}

   ;; The human-defined name of an expression clause; attached to the topmost :mbql.clause/*.
   :mbql.expression/name          {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/string}

   ;; Breakouts are references to other columns, plus possibly binning or bucketing.
   :mbql.breakout/origin          {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}
   :mbql.breakout/temporal-unit   {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/keyword}
   :mbql.breakout/binning         {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}

   :mbql.binning/num-bins         {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/int}
   :mbql.binning/bin-width        {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/double}

   ;; Filters are just a clause AST:
   ;; - :mbql.clause/operator: keyword, like := or :concat
   ;; - :mbql.clause/argument: many ref
   :mbql.clause/operator          {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/keyword}
   :mbql.clause/argument          {:db/cardinality :db.cardinality/many
                                   :db/valueType   :db.type/ref
                                   :db/isComponent true}

   ;; Value containers for arguments
   :mbql/lit                      {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/any}
   :mbql/ref                      {:db/cardinality :db.cardinality/one
                                   :db/valueType   :db.type/ref
                                   :db/isComponent true}

   ;; Common property for tracking the ordering of clauses like filters and aggregations.
   :mbql/series                   {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/int}
   })

;; Filters point to their stage, stages to their query as well as their predecessor.
;; Queries point to both their 0th and last stages.

(defn fresh-db
  "Returns a fresh DataScript database with the schemas loaded."
  []
  (d/empty-db  (merge metadata-schema query-schema)))

(defn fresh-conn
  "Create a blank mutable database with the schema but nothing else."
  []
  (d/conn-from-db (fresh-db)))

;; Stages 0 and N are pointers to the two ends.
;; Negative numbers mean counting backwards from stage N.
(def rules-stages
  "Datalog **rules** for working with stages in queries."
  '[;; Stage 0: Return the first stage.
    [(stage-number ?query ?n ?stage)
     [(= ?n 0)]
     [?query :mbql.query/stage0 ?stage]]
    ;; Stage -1: Return the last stage.
    [(stage-number ?query ?n ?stage)
     [(= ?n -1)]
     [?query :mbql.query/stage  ?stage]]
    ;; Positive number: start counting from stage0.
    [(stage-number ?query ?n ?stage)
     [(> ?n 0)]
     [?query  :mbql.query/stage0    ?stage0]
     (stages-asc ?stage0 ?n 1 ?stage)]

    ;; Ascending order: k == target
    [(stages-asc ?stage-k-1 ?target ?k ?stage)
     [(= ?target ?k)]
     [?stage :mbql.stage/previous-stage ?stage-k-1]]
    ;; Ascending order: k < target
    [(stages-asc ?stage-k-1 ?target ?k ?stage)
     [(> ?target ?k)]
     [?stage-k :mbql.stage/previous-stage ?stage-k-1]
     [(inc ?k) ?k+1]
     (stages-asc ?stage-k ?target ?k+1 ?stage)]])

;; TODO: Sort out a way to memoize these.
(defn- database-for [metadata-provider]
  (d/db-with (fresh-db) [(metadata-tx metadata-provider)]))

(defn query-stage
  "Given a `query-entity` and stage index, return the stage as an entity."
  [query-entity stage-number]
  (let [db        (d/entity-db query-entity)
        stage-eid (d/q '[:find ?stage .
                         :in % $ ?query ?stage-number :where
                         (stage-number ?query ?stage-number ?stage)]
                       rules-stages db (:db/id query-entity) stage-number)]
    (d/entity db stage-eid)))

(defn filters
  "Returns a list of all filters on the specified stage, in order."
  [query-entity stage-number]
  (->> (query-stage query-entity stage-number)
       :mbql.stage/filter
       (sort-by :mbql/series)
       vec))

(defn expression-parts
  "Returns an expression as an AST: a map with `:mbql.clause/operator :=` and `:mbql.clause/argument [{...}]`.
  The arguments list might be empty, but any arguments present will have `:mbql/series` plus exactly one of:

  - `:mbql/ref` to a field, column, further clause, etc.
  - `:mbql/lit` with a number, string, keyword, etc.

  Note that the values are returned sorted by the `:mbql/series`."
  ;; TODO: Sort them *recursively*!
  [db expr-eid]
  (->> expr-eid
       (d/pull db '[:mbql.clause/operator :mbql.clause/argument])
       (walk/postwalk (fn [form]
                                (if (map? form)
                                  (m/update-existing form :mbql.clause/argument #(->> % (sort-by :mbql/series) vec))
                                  form)))))

;; Query builder ===============================================================================
;; Reproducing a bunch of the query building functions for easier testing.
;; In this model, queries are passed and returned as Entities. That can be broken down into a database and EID with
;; d/entity-db and :db/id.
;; TODO: There are other options - one DB per query with a hard-coded EID;
;; or a global DB passing just the EID. To be considered further.
(defn query
  "Construct a query for the indicated table."
  [metadata-provider table-metadata]
  (let [table-eid (if (number? table-metadata)
                    table-metadata
                    [:metadata.table/id (or (:metadata.table/id table-metadata)
                                            (:id table-metadata))])
        tx-data   [{:db/id -1
                    :mbql.query/database
                    [:metadata.database/id (:id (lib.metadata/database metadata-provider))]
                    :mbql.query/stage  {:db/id -2
                                        :mbql.stage/source {:mbql.source/incoming table-eid}
                                        :mbql.stage/query  -1}
                    :mbql.query/stage0 -2}]
        tx        (-> (database-for metadata-provider)
                      d/conn-from-db
                      (d/transact! tx-data))]
    (d/entity (:db-after tx) (get-in tx [:tempids -1]))))

(defn- with-stage [query-entity stage-number f]
  (let [stage (query-stage query-entity stage-number)]
    (-> query-entity
        d/entity-db
        (d/db-with (f stage))
        (d/entity (:db/id query-entity)))))

(defn filter
  "Attaches the given `expr-parts` to the query as a filter.

  `expr-parts` should be a transactable expression form as returned by [[expr]]."
  [query-entity stage-number expr-parts]
  (let [next-series (count (filters query-entity stage-number))
        new-filter  (assoc expr-parts :mbql/series next-series)]
    (with-stage query-entity stage-number
      (fn [stage]
        [{:db/id             (:db/id stage)
          :mbql.stage/filter new-filter}]))))

(defn- entid? [x]
  (and (vector? x)
       (= (count x) 2)
       (keyword? (first x))
       (number? (second x))))

(defn- clause-argument [arg]
  (cond
    (or (number? arg)
        (string? arg)
        (boolean? arg)) {:mbql/lit arg}
    (map? arg)          {:mbql/ref (or (:db/id arg) arg)}
    (entid? arg)        {:mbql/ref arg}
    :else (throw (ex-info (str "clause-argument does not know what to do with " (pr-str arg)) {:arg arg}))))

(defn- clause-arguments [args]
  (vec (map-indexed (fn [i arg]
                      (assoc (clause-argument arg) :mbql/series i))
                    args)))

(defn expr
  "Shorthand for creating expression ASTs. This is like the named [[metabase.lib.expression/=]] etc., but I don't want
  to wrestle with the name collisions in this big playground namespace.

  Arguments can be DataScript `Entities`, `[:metabase.field/id 12]` refs, maps (typically nested clauses), or literal
  numbers and strings.

  Returns the `:mbql.clause/*` entity in a transactable form."
  [op & args]
  {:mbql.clause/operator op
   :mbql.clause/argument (clause-arguments args)})

(defn- aggregation-clause
  "Builder for an aggregation. Takes 1 to 3 args:

  - `(aggregation-clause :count)`
  - `(aggregation-clause :sum [:metadata.field/id 12])`
  - `(aggregation-clause :sum-where [:metadata.field/id 12] (expr := [:metadata.field/id 9] 7))`
      - `(aggregation-clause :count-where nil (expr := [:metadata.field/id 9] 7))`"
  ([op] (aggregation-clause op nil nil))
  ([op column] (aggregation-clause op column nil))
  ([op column filter-expr]
   (cond-> {:mbql.aggregation/operator (keyword op)}
     column      (assoc :mbql.aggregation/column column)
     filter-expr (assoc :mbql.aggregation/filter filter-expr))))

(defn agg-count
  "Returns a `:count` aggregation clause."
  []
  (aggregation-clause :count))

(defn agg-sum
  "Returns a `:sum` aggregation clause."
  [column]
  (aggregation-clause :sum column))

(defn agg-min
  "Returns a `:min` aggregation clause."
  [column]
  (aggregation-clause :min column))

(defn agg-max
  "Returns a `:max` aggregation clause."
  [column]
  (aggregation-clause :max column))

(defn agg-sum-where
  "Returns a `:sum-where` aggregation clause."
  [column filter-expr]
  (aggregation-clause :sum-where column filter-expr))

(defn agg-count-where
  "Returns a `:count-where` aggregation clause."
  [filter-expr]
  (aggregation-clause :count-where nil filter-expr))

(defn aggregations
  "Returns the (ordered) list of aggregations on the given stage, as a vector of entities."
  [query-entity stage-number]
  (->> (query-stage query-entity stage-number)
       :mbql.stage/aggregation
       (sort-by :mbql/series)
       vec))

(defn aggregate
  "Attaches `aggregation` to the query. The `aggregation` should be built with eg. [[agg-sum]].
  Returns the updated query entity."
  [query-entity stage-number aggregation]
  (let [series (count (aggregations query-entity stage-number))]
    (with-stage query-entity stage-number
      (fn [stage]
        [{:db/id                  (:db/id stage)
          :mbql.stage/aggregation (assoc aggregation :mbql/series series)}]))))


;; Breakouts ====================================================================================
(defn breakouts
  "Returns the breakouts in order."
  [query-entity stage-number]
  (->> (query-stage query-entity stage-number)
       :mbql.stage/breakout
       (sort-by :mbql/series)
       vec))

(defn- ->breakout [column-or-breakout]
  (if (:mbql.breakout/origin column-or-breakout)
    column-or-breakout
    {:mbql.breakout/origin column-or-breakout}))

(defn breakout
  "Adds a breakout to this stage. The breakout is a column, perhaps with bucketing or binning. It can also be a direct
  ref to a field or column.

  Breakouts are stored with `:mbql.breakout/origin` pointing to the original column, field, etc.; if the input does not
  have that attribute it will be used as the value for `:mbql.breakout/origin` in a new entity."
  [query-entity stage-number breakout-clause]
  (let [series          (count (breakouts query-entity stage-number))]
    (with-stage query-entity stage-number
      (fn [stage]
        [{:db/id               (:db/id stage)
          :mbql.stage/breakout (-> breakout-clause
                                   ->breakout
                                   (assoc :mbql/series series))}]))))

(defn with-temporal-bucketing
  "Turns the `breakoutable` (a column or breakout) into a proper breakout, and attaches the `temporal-unit` to it.

  Returns the modified breakout map."
  [breakoutable temporal-unit]
  (assoc (->breakout breakoutable) :mbql.breakout/temporal-unit temporal-unit))

;; Expressions ==================================================================================
(defn expressions
  "Returns the expressions in order."
  [query-entity stage-number]
  (->> (query-stage query-entity stage-number)
       :mbql.stage/expression
       (sort-by :mbql/series)
       vec))

(defn expression
  "Adds an expression to this stage, with the given name.

  The expression is a clause (see [[expr]])."
  [query-entity  stage-number expression-name an-expression-clause]
  (let [series (count (expressions query-entity stage-number))]
    (with-stage query-entity stage-number
      (fn [stage]
        [{:db/id                  (:db/id stage)
          :mbql.stage/expression  (merge an-expression-clause
                                         {:mbql.expression/name expression-name
                                          :mbql/series          series})}]))))

;; START HERE: Need tests for expressions and breakouts.
;; Then start writing returned-columns and visible-columns.

;; Problem: Populating metadata DB ==============================================================
;; On JS we can maintain a single, sometimes updated atom with the entire picture in it; the FE takes
;; care of requesting metadata on demand. But perhaps we can point the arrow the other way? Make the
;; DataScript DB the source of truth for metadata, and avoid the need to backwards-update it?
;; Probably yes; it's all hidden behind the `Metadata` class.
;;
;; On JVM, the entire metadata is accessible but we generally access it on demand, synchronously.
;; There's no way currently to plug lazy access into DataScript, even when we can block on JVM.
;; But I think we can tackle it with a pre-tx step that examines the transaction we're about to
;; execute looking for eg. `[:metadata.table/id X]` idents and prefetching those values into the
;; transaction, and replacing the idents with `-1` placeholders.
;; That function can be a no-op on the CLJS side, since there we would assume the FE had already
;; populated the data.


;; Operations on lists of clauses ===============================================================
;; Before I sweat too hard about order, what are the actual operations on eg. the list of filters
;; on a stage?
;; Append at the end, delete anywhere, update anywhere, list in order, swap a pair!
;; Possible approaches:
;; - Singly linked, eldest first
;; - Single linked, youngest first
;; - Doubly linked, eldest first
;; - Doubly linked, youngest first
;; - Order number
;; Singly linked is tough for random deletes, so that's out.
;; Doubly linked is a lot to maintain.
;; Order numbers wins!
;;
;; New ones only go at the end, so we can find the largest of the current ones and increment it.
;; No worries if there are gaps.
;; We never need to make a gap since there's never a proper insert.
;; We do support `swap-clauses`, but that's easy - they trade order numbers.

;; Sources =======================================================================================
;; A source is an entity, with a `many` of columns. Columns have a name, the three types
;; (base-type required, the others optional) and an origin, which is another column or perhaps a
;; :metadata.field/...

;; Types of sources:
;; - :mbql.source/table is a ref to the table metadata - these columns are fields.
;; - :mbql.source/card is a ref to a :metadata/card
;; - :mbql.source/model is a ref to a model (also a :metadata/card, but possibly with a metadata
;;   wrapper)
;; - :mbql.source/implicit-join points at the target column (not field!), and
;;   :mbql.source/foreign-key points to the FK column. (Columns not fields so that these work for
;;   models.)
;; - :mbql.source/select is a pseudosource, which reorders and filters columns coming from a
;;   previous source.
;; - :mbql.source/explicit-join has a source, but it might be the a select around the proper join
;;   source

;; Data model for sources:
;; - Selecting columns is on the *input* side, on stages and joins.
;; - The output of a stage is quite dependent, since it depends on whether there are aggrgations
;;   on the stage. Hard (but perhaps not impossible?) to query in Datalog.

;; - Columns are "fat" refs, small entities that add extra information about a further ref.
;;   - Columns point to the source and the specific column from it.

;; A stage has an (ordered?) set of columns it returns, and so can act as a source itself.
;; - Reified or implied? Implied I think:
;;   - If there are aggregations, then all breakouts followed by all aggregations, each in order.
;;   - If not: primary source, joins in order, expressions, (breakouts?)
;;   - That logic would be difficult to express in a Datalog query...
;; - Stages point at their predecessor directly, but it might also be their mbql.stage/source.
;; - Is "select" worth representing anywhere except at the stage level?
;;   - We surface it on joins in the UI, but it's not necessary to store it there.
;;   - Even though I like the *idea* of a separate "select" layer, there's no need to model
;;     it that way either. The sources are already reified as entities, they can include a
;;     field list.
;;     - I think it does make sense to store them on joins...
;; - Column names are immaterial inside the database - they can just refer to real fields etc.
;;   - Every source needs to have a defined name... but I'm not sure how to frame that.


;; Columns proper are "fat refs", entities that specify some extra things while linking two
;; other entities.
;; A column is identified by :mbql.column/source, which points at the source, and by
;; :mbql.column/origin, which points to its original form.
;; That might be an expression or aggregation in an earlier stage, or elsewhere...

;; Or should I do things fully reified, with all columns fully modeled in the database?
;; It feels more heavyweight, but perhaps it's not hard to update them incrementally?
;; - On adding a join, its own source must be queried to find all the columns, and export
;;   versions of them added to the export list.
;; - On removing a join, every output column that references it needs to be dropped
;;   - That's an easy, indexed ref query, and it can cascade through aggregations, etc.


;; Miscellaneous thoughts ========================================================================
;; - Manipulating the `:next-eid` in DataScript to separate metadata from the query from caches
;;   makes a fast way to delete en bloc when eg. the metadata updates.
;;   Grab all the query-zone datoms, rebuild the metadata portion, and reapply the query portion.
;; - Slicing each query to like a 64K region on round values gives a way to keep all the queries in
;;   one database without interleaving them.

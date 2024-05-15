(ns metabase.lib.datascript
  (:refer-clojure :exclude [filter])
  (:require
   [clojure.core :as core]
   [clojure.walk :as walk]
   [datascript.core :as d]
   [medley.core :as m]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.util.log :as log]))

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
   ;; Note, however, that most of these are actually on the common ns :metadata.column/*.
   ;; Only the truly Field-specific ones like :metadata.field/id are here.
   :metadata.field/id             {:db/cardinality :db.cardinality/one
                                   #_#_:db/valueType   :db.type/int
                                   :db/unique      :db.unique/identity}
   :metadata.column/name           {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/string}
   :metadata.column/display-name   {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/string}
   ;; Points at the :metadata.table/* for proper Fields; any arbitrary :mbql.source/* otherwise.
   :metadata.column/source         {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}
   :metadata.column/fk-target      {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref} ; field
   :metadata.column/base-type      {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/keyword}
   :metadata.column/effective-type {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/keyword}
   :metadata.column/semantic-type  {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/keyword}

   ;; [source-id name] pairs are unique.
   :metadata.column/handle         {:db/cardinality :db.cardinality/one,
                                    :db/tupleAttrs  [:metadata.column/source :metadata.column/name],
                                    :db/unique      :db.unique/identity}

   ;; Mirroring is used for eg. explicit join columns which are straight copies of input columns with some adjustment.
   :metadata.column/mirror         {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}})

(defn- ns-keys [m nspace]
  (update-keys m #(keyword nspace (name %))))

(defn- field-tx [{:keys [id] :as field-metadata}]
  (merge #:metadata.column{:id           (:id field-metadata)
                           :name         (:name field-metadata)
                           :display-name (:display-name field-metadata)
                           :base-type    (:base-type field-metadata)}
         {:metadata.field/id id
          ;; Set a tempid of the negated field ID for FKs to line up neatly.
          :mbql/series       (:position field-metadata)
          :db/id             (- id)}
         (when-let [et (:effective-type field-metadata)]
           {:metadata.column/effective-type et})
         (when-let [st (:semantic-type field-metadata)]
           {:metadata.column/semantic-type st})
         ;; Since the order of the fields is not known in advance, using [:metadata.field/id 7] entids for
         ;; `:fk-target` won't work. Nothing else is using tempids, so we can just negate the Metabase field IDs
         ;; to yield valid, unique tempids for the fields.
         (when-let [fk-id (:fk-target-field-id field-metadata)]
           {:metadata.column/fk-target (- fk-id)})))

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
            (assoc (table-tx table) :metadata.column/_source fields))))})

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

   ;; Sources are in several flavours:
   ;; - :metadata.table/*
   ;; - :metadata.card/*
   ;; - :mbql.stage/* for previous stages
   ;; - :mbql.join/* for explicit joins
   ;; - :mbql.join.implicit/* for implicit joins
   ;; - :mbql.select/* to filter which columns are coming through.

   ;; Primary source of a stage.
   :mbql.stage/source             {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}

   ;; Joins on the stage are an ordered list (:mbql/series); each join has a source and condition list.
   :mbql.join/source              {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}
   :mbql.join/condition           {:db/cardinality :db.cardinality/many, :db/valueType :db.type/ref}
   ;; Bidirectional link to the columns (:mbql.join/column and :metadata.column/source), so that we can get
   ;; `:db/isComponent true` auto-deletion.
   :mbql.join/column              {:db/cardinality :db.cardinality/many
                                   :db/valueType   :db.type/ref
                                   :db/isComponent true}

   ;; Implicit joins come in two parts - as a column and a source.
   ;; Implicit join sources are unique on [stage fk-field].
   ;; The column points to that implicit join source and to the :metadata.column/implicitly-joined
   ;; (also a column). Columns need to be unique on [source name]. Sources are de-duped, so that's
   ;; no problem. The name needs to be generated based on the FK column's name and the target's name:
   ;; the existing library does that as a *join alias* of `TargetTable__via__FK_COLUMN`, but I think we
   ;; should go farther: TargetTable__TARGET_COLUMN__via__SourceAlias__FK_COLUMN.
   ;; That's longer, but it's unambiguous. That also implies that we need a way to turn every source
   ;; into a unique, string name. Possibly it needs to be deduplicated as well, which is distressing.
   ;; But at least we have indexing so it's fast to check.
   ;; TODO: Make sure join aliases and de-duplication is actually implemented and tested.
   :mbql.join.implicit/fk-column  {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}
   :mbql.join.implicit/target     {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}
   :mbql.join.implicit/stage      {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}
   :mbql.join.implicit/handle     {:db/cardinality :db.cardinality/one
                                   :db/tupleAttrs  [:mbql.join.implicit/stage
                                                    :mbql.join.implicit/fk-column]
                                   :db/unique      :db.unique/identity}

   ;; Stages have many parts:
   ;; - A single(?) :mbql/source (always)
   ;; - 0+ :mbql.stage/aggregation
   ;; - 0+ :mbql.stage/expression
   ;; - 0+ :mbql.stage/filter
   ;; - 0+ :mbql.stage/breakout
   :mbql.stage/filter             {:db/cardinality :db.cardinality/many, :db/valueType :db.type/ref}
   :mbql.stage/aggregation        {:db/cardinality :db.cardinality/many, :db/valueType :db.type/ref}
   :mbql.stage/expression         {:db/cardinality :db.cardinality/many, :db/valueType :db.type/ref}
   :mbql.stage/breakout           {:db/cardinality :db.cardinality/many, :db/valueType :db.type/ref}
   :mbql.stage/join               {:db/cardinality :db.cardinality/many, :db/valueType :db.type/ref}

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
   ;; Common property for unique, upsertable UUID strings.
   :mbql/uuid                     {:db/cardinality :db.cardinality/one
                                   :db/unique      :db.unique/value ; Only one copy of the UUID allowed anywhere!
                                   #_#_:db/valueType :db.type/string}
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

;; Internals ====================================================================================
(defn- entities-without-uuid [db]
  (d/q '[:find [?e ...] :in $ :where
         [?e _ _]
         [(missing? $ ?e :mbql/uuid)]]
       db))

(defn- add-missing-uuids [db]
  (let [missing (entities-without-uuid db)]
    (d/db-with db (for [e missing]
                    [:db/add e :mbql/uuid (str (random-uuid))]))))

(defn- gen-uuid [maplike]
  (cond-> maplike
    (not (:mbql/uuid maplike)) (assoc :mbql/uuid (str (random-uuid)))))

(defn- external-key [entity]
  (m/find-first #(get entity %)
                [:metadata.field/id :metadata.table/id :metadata.database/id]))

(defn- external-entid
  "Given any entity, return a portable entid for it.

  For metadata entities that exist in appdb, this is eg. `[:metadata.field/id 123]`.
  For fragments of queries (including columns), this is `[:mbql/uuid \"bcebd82a-4f29-48fa-8d8a-effd3f5dc574\"]`."
  [entity]
  (or (when-let [extkey (external-key entity)]
        [extkey (get entity extkey)])
      (when-let [the-uuid (:mbql/uuid entity)]
        [:mbql/uuid the-uuid])
      (throw (ex-info "Cannot generate external-entid without either an external key or UUID"
                      {:entity (d/touch entity)}))))

(defn- missing-uuids
  "Returns those entities which don't have UUIDs *and* that needed them!

  That is, things like Tables and Fields that have their own external keys are excluded.

  Returns a list of Entities."
  [db]
  (not-empty (for [e (entities-without-uuid db)
                   :let [entity (d/entity db e)]
                   :when (not (external-key entity))]
               entity)))

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

(defn- walk-expression
  "Given a function from a `:mbql.clause/*` map to a replacement map, walks an expression completely in postorder,
  replacing the clauses as it goes."
  [{:keys [arg-fn clause-fn ref-fn] :as ctx} expr]
  (cond
    ;; Expression clause with operator: walk the args recursively, then the outer expression.
    (:mbql.clause/operator expr) (-> expr
                                     (update :mbql.clause/argument (fn [args] (map #(walk-expression ctx %) args)))
                                     ((or clause-fn identity)))

    ;; Argument, with :mbql/ref on it: recurse first, then ref-fn on the inner ref, then arg-fn on the whole thing.
    (:mbql/ref expr) (-> expr
                         (update :mbql/ref #(walk-expression ctx %))
                         (update :mbql/ref (or ref-fn identity))
                         ((or arg-fn identity)))

    ;; Argument, with :mbql/lit on it: arg-fn and return.
    (:mbql/lit expr) ((or arg-fn identity) expr)

    ;; Anything else: return as is - don't recursive into anything outside this expression!
    :else expr))

(defn- walk-clauses [f expr]
  (walk-expression {:clause-fn f} expr))
(defn- walk-args [f expr]
  (walk-expression {:arg-fn f} expr))
(defn- walk-refs [f expr]
  (walk-expression {:ref-fn f} expr))

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
        tx-data   [{:db/id               -1
                    :mbql/uuid           (str (random-uuid))
                    :mbql.query/database [:metadata.database/id (:id (lib.metadata/database metadata-provider))]
                    :mbql.query/stage    {:db/id             -2
                                          :mbql/uuid         (str (random-uuid))
                                          :mbql.stage/source table-eid
                                          :mbql.stage/query  -1}
                    :mbql.query/stage0   -2}]
        tx        (-> (database-for metadata-provider)
                      (d/with tx-data))]
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
       (keyword? (first x))))

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
                      (assoc (clause-argument arg)
                             :mbql/series i
                             :mbql/uuid   (str (random-uuid))))
                    args)))

(defn expr
  "Shorthand for creating expression ASTs. This is like the named [[metabase.lib.expression/=]] etc., but I don't want
  to wrestle with the name collisions in this big playground namespace.

  Arguments can be DataScript `Entities`, `[:metadata.field/id 12]` refs, maps (typically nested clauses), or literal
  numbers and strings.

  Returns the `:mbql.clause/*` entity in a transactable form."
  [op & args]
  {:mbql/uuid            (str (random-uuid))
   :mbql.clause/operator op
   :mbql.clause/argument (clause-arguments args)})

;; Aggregations =================================================================================
(defn- aggregation-clause
  "Builder for an aggregation. Takes 1 to 3 args:

  - `(aggregation-clause :count)`
  - `(aggregation-clause :sum [:metadata.field/id 12])`
  - `(aggregation-clause :sum-where [:metadata.field/id 12] (expr := [:metadata.field/id 9] 7))`
      - `(aggregation-clause :count-where nil (expr := [:metadata.field/id 9] 7))`"
  ([op] (aggregation-clause op nil nil))
  ([op column] (aggregation-clause op column nil))
  ([op column filter-expr]
   (cond-> {:mbql.aggregation/operator (keyword op)
            :mbql/uuid                 (str (random-uuid))}
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

(defn- stage-aggregations [stage]
  (->> stage
       :mbql.stage/aggregation
       (sort-by :mbql/series)
       vec))

(defn aggregations
  "Returns the (ordered) list of aggregations on the given stage, as a vector of entities."
  [query-entity stage-number]
  (stage-aggregations (query-stage query-entity stage-number)))

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
(defn- stage-breakouts [stage-entity]
  (->> stage-entity
       :mbql.stage/breakout
       (sort-by :mbql/series)
       vec))

(defn breakouts
  "Returns the breakouts in order."
  [query-entity stage-number]
  (stage-breakouts (query-stage query-entity stage-number)))

(defn- ->breakout [column-or-breakout]
  (if (:mbql.breakout/origin column-or-breakout)
    column-or-breakout
    {:mbql.breakout/origin column-or-breakout
     :mbql/uuid            (str (random-uuid))}))

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
(defn- stage-expressions [stage-entity]
  (->> stage-entity
       :mbql.stage/expression
       (sort-by :mbql/series)
       vec))

(defn expressions
  "Returns the expressions in order."
  [query-entity stage-number]
  (stage-expressions (query-stage query-entity stage-number)))

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

;; Explicit Joins ===============================================================================
(declare returned-columns-method)

(defn- stage-joins [stage-entity]
  (->> stage-entity
       :mbql.stage/join
       (sort-by :mbql/series)
       vec))

(defn joins
  "Returns the explicit joins in order."
  [query-entity stage-number]
  (stage-joins (query-stage query-entity stage-number)))

(defn- tx-join-columns [series stage]
  (let [join (->> stage
                  :mbql.stage/join
                  (core/filter #(= (:mbql/series %) series))
                  first)]
    (->> (returned-columns-method (:mbql.join/source join))
         (map-indexed (fn [i col]
                        (let [tempid (- -100 i)]
                          [;; Update the join with a pointer to the column
                           [:db/add (:db/id join) :mbql.join/column tempid]
                           ;; And add the column itself.
                           {:db/id                  tempid
                            :mbql/series            i
                            :metadata.column/source (:db/id join)
                            :metadata.column/name   (:metadata.column/name col)
                            :metadata.column/mirror (:db/id col)}])))
         (apply concat))))

(defn- add-mbql-series [maps]
  (map-indexed #(assoc %2 :mbql/series %1) maps))

(defn- entid [db-or-entity entid-or-entity]
  (or (when (number? entid-or-entity) entid-or-entity)
      (:db/id entid-or-entity)
      (let [db (if (d/db? db-or-entity)
                 db-or-entity
                 (d/entity-db db-or-entity))]
        (d/entid db entid-or-entity))))

(defn- fix-join-conditions
  "When adding a `join-clause` with conditions, those conditions will probably contain `:mbql/ref`s pointing to columns
  from the join's `source`. Since join columns are reified in the database with `:metadata.column/source the-join`
  and `:metadata.column/mirror original-column`, we should adjust those refs to point at the join's own columns instead
  of the source's columns. They're easy to find: their `source` is the same as the join's `source`."
  [series stage conditions]
  (let [join-clause (->> stage
                         :mbql.stage/join
                         (core/filter #(= (:mbql/series %) series))
                         first)
        source-id   (:db/id (:mbql.join/source join-clause))]
    [{:db/id (:db/id join-clause)
      :mbql.join/condition
      (vec (for [cnd conditions]
             (let [[lhs rhs]    (sort-by :mbql/series (:mbql.clause/argument cnd))
                   ref-eid      (entid stage (:mbql/ref rhs))
                   ref-entity   (d/entity (d/entity-db stage) ref-eid)
                   ref-source   (:metadata.column/source ref-entity)
                   adjusted-ref (if (= (entid stage ref-source)
                                       source-id)
                                  [:metadata.column/handle [(:db/id join-clause)
                                                            (:metadata.column/name ref-entity)]]
                                  (:mbql/ref rhs))]
               (assoc cnd :mbql.clause/argument [lhs (assoc rhs :mbql/ref adjusted-ref)]))))}]))

(defn join
  "Adds an explicit join to this stage, with the given source and conditions.

  The `joinable` is either a source or a `:mbql.join/*` entity.

  The columns for this join are reified in the DB; copied from their original form with the join as their source."
  ([query-entity stage-number joinable-source conditions]
   (let [source-entid (cond
                        (number? joinable-source)                       joinable-source
                        (and (vector? joinable-source)
                             (= (count joinable-source) 2))             joinable-source
                        (:db/id joinable-source)                        :db/id
                        (= (:lib/type joinable-source) :metadata/table) [:metadata.table/id (:id joinable-source)]
                        :else (throw (ex-info "Unknown join source" {:joinable-source joinable-source})))]
     (join query-entity stage-number {:mbql.join/source    source-entid
                                      :mbql.join/condition (add-mbql-series conditions)})))

  ([query-entity stage-number join-clause]
   (let [series      (count (joins query-entity stage-number))]
     (-> query-entity
         (with-stage stage-number
           (fn [stage]
             [{:db/id           (:db/id stage)
               :mbql.stage/join (-> join-clause
                                    gen-uuid
                                    (dissoc :mbql.join/condition)
                                    (assoc :mbql/series series))}]))
         (with-stage stage-number #(tx-join-columns series %))
         (with-stage stage-number #(fix-join-conditions series % (:mbql.join/condition join-clause)))))))

;; Source type dispatch =========================================================================
;; Sources come in a bunch of different flavours; this looks at sets of keys to determine what kind
;; of source this is.
(def ^:private source-dispatch-keys
  {:mbql.stage/query         :mbql/stage
   :metadata.table/id        :metadata/table
   :metadata.card/id         :metadata/card
   :mbql.join/source         :mbql/join
   :mbql.join.implicit/stage :mbql/join.implicit})

(defn- source-dispatch [maplike]
  (some source-dispatch-keys (keys maplike)))

;; Source names =================================================================================
(defmulti source-name
  "Given a `source`, return a unique name for it as a string. For now they can resemble the original
  MLv2 forms, until there's a reason to change. But these should be opaque, an internal matter for
  the library. Viz settings should be saved using the `:db/id` and only converted to strings on the
  way over the wire.

  - `\"__MB_PREVIOUS_STAGE\"` is reserved for the subjective previous stage.
  - Tables use their names
  - Cards and models use `\"card__1234\"`
  - Explicit joins use their source's name plus `\"__join__1234\"`, using the `:db/id` of the join.
  - Implicit joins use `\"TargetSource__via__Source__FK_COLUMN\"`."
  source-dispatch)

(defmethod source-name :metadata/table [table]
  (:metadata.table/name table))

(defmethod source-name :metadata/card [card]
  (str "card__" (:metadata.card/id card)))

(defmethod source-name :mbql/join [a-join]
  (let [src-name (source-name (:mbql.join/source a-join))]
    ;; TODO: Rethink this - does this ever need to be reproduced?
    (str src-name "__join__" (:db/id a-join))))

(defmethod source-name :mbql/join.implicit [imp-join]
  (let [target-name    (-> imp-join :mbql.join.implicit/target :metadata.column/source source-name)
        fk-column      (:mbql.join.implicit/fk-column imp-join)
        fk-source-name (-> fk-column :metadata.column/source source-name)]
    (str target-name "__via__" fk-source-name "__" (:metadata.column/name fk-column))))

;; Returned columns =============================================================================
(defmulti returned-columns-method
  "Inner method for [[returned-columns]]. Dispatches based on the keys available in the entity
  argument."
  source-dispatch)

(defmethod returned-columns-method :default [mystery]
  (throw (ex-info "Unknown return-columns-method input" {:mystery-entity mystery})))

(defmethod returned-columns-method :mbql/join [join-entity]
  ;; When explicit joins are added to the query, the source's columns are reified on the join.
  ;; So here we can just retrieve them.
  (->> join-entity
       :mbql.join/column
       (sort-by :mbql/series)))

(defmethod returned-columns-method :mbql/join.implicit [_imp-join-entity]
  ;; Implicit joins don't exist directly; they only get used inside eg. filters, breakouts, join conditions.
  (log/warn "Tried to call returned-columns-method on an implicit join source?")
  [])

(defmethod returned-columns-method :mbql/stage [stage]
  (if-let [brks+aggs (not-empty (concat (stage-breakouts stage)
                                        (stage-aggregations stage)))]
    ;; With a breakout or aggregation: return the breakouts followed by the aggregations.
    brks+aggs

    ;; Unaggregated: main source, joins in order, expressions.
    (concat (returned-columns-method (:mbql.stage/source stage))
            (->> (:mbql.stage/join stage)
                 (sort-by :mbql/series)
                 (mapcat returned-columns-method))
            (stage-expressions stage))))

(defmethod returned-columns-method :metadata/table [table]
  (->> table
       :metadata.column/_source
       (sort-by :mbql/series)))

(defn returned-columns
  "Given a query and stage number, return the (ordered) list of the columns it will return.

  - MBQL stages with aggregations return all their breakouts followed by all their aggregations, each in order.
  - MBQL stages without aggregations return the columns from: main source, explicit joins in order, expressions."
  ;; TODO: Double-check that ordering.
  [query-entity stage-number]
  (returned-columns-method (query-stage query-entity stage-number)))

;; Visible columns ==============================================================================
;; Correcting an error in the OG implementation - rather than returning the columns and then grouping them later, let's
;; return the groups at the top level, and concat them into one list if desired.
(defn- root-column
  "Note: This is only safe to follow for unchanging metadata like fk-target and effective-type.
  Don't call this expecting to compare columns or anything like that. Any clause which transforms a column
  (eg. a breakout) should return a new, fresh column and not be mirrored."
  [column-entity]
  (if-let [mirror (:metadata.column/mirror column-entity)]
    (recur mirror)
    column-entity))

(defn visible-column-groups
  "Given a query and stage number, return the (ordered) list of the columns which are \"visible\" to that stage,
  grouped by their origins.

  That's the following columns, in this order:
  - Columns returned by the main source.
  - Columns from expressions on this stage.
  - Columns returned by each explicit join, in order.
  - Columns implicitly joinable through any FKs which appear in the above, in the same order.

  MBQL stages with aggregations return all their breakouts followed by all their aggregations, each in order.
  MBQL stages without aggregations return the columns from: main source, explicit joins in order, expressions."
  ;; TODO: Double-check that ordering.
  ;; TODO: These groups don't quite line up with the "sources".
  [query-entity stage-number]
  (let [stage      (query-stage query-entity stage-number)
        main-group {:lib/type                             :metadata/column-group
                    :metabase.lib.column-group/group-type :group-type/main
                    :metabase.lib.column-group/columns    (concat (returned-columns-method (:mbql.stage/source stage))
                                                                  (stage-expressions stage))}
        exp-joins  (for [join-entity (stage-joins stage)]
                     {:lib/type                             :metadata/column-group
                      :metabase.lib.column-group/group-type :group-type/join.explicit
                      :metabase.lib.column-group/columns    (returned-columns-method join-entity)})
        groups     (concat [main-group] exp-joins)
        columns    (mapcat :metabase.lib.column-group/columns groups)
        fks        (core/filter (comp :metadata.column/fk-target root-column) columns)]
    ;; Currently the FKs are always pointing to PKs of other tables.
    (concat groups
            (for [fk fks
                  :let [pk            (:metadata.column/fk-target (root-column fk))
                        foreign-table (:metadata.column/source pk)]]
              {:lib/type                               :metadata/column-group
               :metabase.lib.column-group/group-type   :group-type/join.implicit
               :metabase.lib.column-group/foreign-key  fk
               :metabase.lib.column-group/columns
               (let [imp-join-source {:mbql.join.implicit/stage     stage
                                      :mbql.join.implicit/fk-column fk
                                      :mbql.join.implicit/target    pk
                                      #_#_:mbql.join.implicit/handle    [(:db/id stage) (:db/id fk)]}]
                 (for [[i column] (map-indexed vector (returned-columns-method foreign-table))]
                   ;; Dynamic columns for a source that isn't saved to the query.
                   ;; TODO: Or should these also be reified?
                   {:metadata.column/source imp-join-source
                    :metadata.column/name   (:metadata.column/name column)
                    :metadata.column/mirror column
                    :mbql/series            i}))}))))

(defn visible-columns
  "Given a query and stage number, return the (ordered) list of the columns which are \"visible\" to that stage.

  These are in the same order as the groups and `columns` lists in [[visible-column-groups]]."
  [query-entity stage-number]
  (mapcat :metabase.lib.column-group/columns (visible-column-groups query-entity stage-number)))



;; Problem: Populating metadata DB ==============================================================
;; On JS we can maintain a single, sometimes updated atom with the entire picture in it; the FE takes
;; care of requesting metadata on demand. But perhaps we can point the arrow the other way? Make the
;; DataScript DB the source of truth for metadata, and avoid the need to backwards-update it?
;; Probably yes; it's all hidden behind the `Metadata` class.
;;
;; On JVM, the entire metadata is accessible but we generally access it on demand, synchronously.
;; There's no way currently to plug lazy access into DataScript, even when we can block on JVM.
;; But I think we can tackle it with a pre-tx step that examines the transaction we're about to
;; execute looking for eg. `{:metadata.table/id X}` idents and prefetching those values into the
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

;; # DataScript-powered MLv2
;;
;; This is a proof-of-concept for storing MBQL queries as a DataScript database rather than a regular data structure.
;;
;; ## DataScript
;;
;; DataScript is an in-memory database in the style of Datomic. Here's some high-level points if you're not familiar:
;;
;; - It is a "triple store", storing relationships (*attributes*) between *entities* and *values*.
;; - Perhaps our entity is a particular user, and `:user/email` is `"braden@metabase.com"`.
;; - There are no tables - any entity can have any attributes.
;; - An entity can be viewed as a map, with attributes as keys and the values as, well, the values.
;; - A DataScript database is a *value*, in the Clojure sense - it's an immutable object that can be passed around!
;; - Schema is optional, but it makes good documentation. The only type that matters is `:db.type/ref` (pointers to
;;   other entities); the only qualifiers that matter are `:db/unique` and `:db/cardinality` to mark list-y attributes
;;   rather than singular ones.
;; - **Set semantics**: DataScript treats everything as a set - unordered and de-duplicated.
;;
;; ## High-level Design
;;
;; An MBQL query is represented with a DataScript database. That database has only one query in it, but it includes all
;; the metadata (tables, fields, etc.).
;;
;; Entity IDs are opaque, arbitrary numbers. But attributes marked as `:db.unique/identity` can be used to identify
;; entities with a pair, eg. `[:metadata.table/id (meta/id :orders)]` uniquely identifies the Orders table.
;;
;; ### On Refs
;;
;; There are no MBQL refs - they are replaced with DataScript refs, that is, an attribute whose value is the Entity ID
;; for some other entity. DataScript refs are indexed in both directions, and can therefore be navigated in both
;; directions - `:mbql.join/condition` maps from a join clause to its conditions; `:mbql.join/_condition` from a
;; condition clause to the *set* of incoming refs.
;;
;; Reverse direction is always a set, since there might be many refs to one entity; forward is singular or a set based
;; on `:db/cardinality`.
;;
;; ### Sources
;;
;; Every column has a *source*, which is a ref to another entity. The sources can be of various types: tables, previous
;; stages, an explicit join, an implicit join.
(ns metabase.lib.datascript
  (:refer-clojure :exclude [filter])
  (:require
   [clojure.core :as core]
   [clojure.walk :as walk]
   [datascript.core :as d]
   [medley.core :as m]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.util.log :as log]))

;; ## Metadata
;;
;; Here is the part of the schema for the metadata. `foo_id` numbers are replaced, naturally, with refs to the `foo`
;; itself. Some attributes are renamed to fit the broader pattern, eg. A field has `:metadata.column/source`, not
;; `:metadata.field/table`.
(def ^:private metadata-schema
  {;; ### Databases
   ;; Just exist with their Metabase IDs for now. Maybe settings or driver will be needed eventually.
   :metadata.database/id          {:db/cardinality :db.cardinality/one
                                   #_#_:db/valueType   :db.type/int
                                   :db/unique      :db.unique/identity}

   ;; ### Tables
   ;; ID, name, schema, database, display name.
   :metadata.table/id             {:db/cardinality :db.cardinality/one
                                   #_#_:db/valueType   :db.type/int
                                   :db/unique      :db.unique/identity}
   :metadata.table/name           {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/string}
   :metadata.table/display-name   {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/string}
   :metadata.table/schema         {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/string}
   :metadata.table/database       {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}

   ;; ### Fields
   ;; Note that everything other than ID is actually in the `:metadata.column/*` namespace, since these attributes apply
   ;; to all columns and not just Fields.
   :metadata.field/id             {:db/cardinality :db.cardinality/one
                                   #_#_:db/valueType   :db.type/int
                                   :db/unique      :db.unique/identity}
   :metadata.column/name           {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/string}
   :metadata.column/display-name   {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/string}

   ;; `:metadata.column/source` points at the :metadata.table/* for proper Fields. See below for much more on sources.
   ;;
   ;; `:mbql/removal` is a custom meta-attribute used for `remove-clause` (which see).
   :metadata.column/source         {:db/cardinality :db.cardinality/one
                                    :db/valueType   :db.type/ref
                                    :mbql/removal   :mbql.removal/reverse}

   ;; `:metadata.column/fk-target` points directly to the foreign PK column, rather than giving just its ID.
   ;; FKs are not marked for `:mbql/removal` - if the target column is removed then the `fk-target` ref should be
   ;; dropped from this column, but the column itself still exists.
   :metadata.column/fk-target      {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}
   :metadata.column/base-type      {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/keyword}
   :metadata.column/effective-type {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/keyword}
   :metadata.column/semantic-type  {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/keyword}

   ;; ### Handles
   ;;
   ;; `:metadata.column/handle` is a *tuple* which DataScript will maintain automatically. Since it has `:db/unique`,
   ;; DataScript will ensure that any particular `[source-id mirror-id name]` triple is unique, and supports "upserting"
   ;; rather than duplicating columns.

   ;; Most columns only have one of `mirror` and `name`, but the triples still work as a unique key with `nil` for one
   ;; of these attributes.
   :metadata.column/handle         {:db/cardinality :db.cardinality/one
                                    :db/tupleAttrs  [:metadata.column/source
                                                     :metadata.column/mirror
                                                     :metadata.column/name]
                                    :db/unique      :db.unique/identity}

   ;; ### Mirroring
   ;;
   ;; Many times a column (on an explicit join, or exported from a query stage) is just a "copy" of another column
   ;; elsewhere. In that case, we create a separate entity for that duplicate column with only
   ;;
   ;;     {:metadata.column/source the-join-or-stage
   ;;      :metadata.column/mirror original-column}
   ;;
   ;; This supports the vital distinction between two copies of the same Field (from, say, the main source and an
   ;; explicit join) but also makes it easy to follow `:metadata.column/mirror` recursively to the original column.
   ;; (Mostly that's used to find its type, name, etc.)
   ;;
   ;; Note that mirror columns are marked `:mbql.removal/reverse`, so a mirror will be deleted when its original is
   ;; deleted.
   :metadata.column/mirror         {:db/cardinality :db.cardinality/one
                                    :db/valueType   :db.type/ref
                                    :mbql/removal   :mbql.removal/reverse}

   ;; ### Common attributes
   ;; DataScript provides set semantics, but we care about the order of aggregation clauses, the order of expression
   ;; arguments, etc. `:mbql/series` is used everywhere we care about order, and holds a 0-based index we can sort on.
   :mbql/series                   {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/int}

   ;; `:mbql/uuid` holds UUID strings, which are attached to most things. It can be used as an ID.
   :mbql/uuid                     {:db/cardinality :db.cardinality/one
                                   :db/unique      :db.unique/value ; Only one copy of the UUID allowed anywhere!
                                   #_#_:db/valueType :db.type/string}})

;; ### Machinery
;;
;; Here's a bunch of helpers for turning a `metadata-provider` into `tx-data` for feeding into DataScript.
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

;; ## Schema for Queries
;;
;; First a couple of helpers, since there are many attributes with each of these definitions.
(def ^:private component-one
  {:db/cardinality :db.cardinality/one
   :db/valueType   :db.type/ref
   :db/isComponent true})

(def ^:private component-many
  {:db/cardinality :db.cardinality/many
   :db/valueType   :db.type/ref
   :db/isComponent true})


(def query-schema
  "Schema for MBQL queries."
  {;; ### "Outer" query
   ;; Like legacy MBQL, the outer query links to the database and to the stages.
   ;;
   ;; Note that the query points to the first and last stages (which might be the same) but also that every stage has
   ;; `:mbql.stage/query` pointing back to the query.
   :mbql.query/database           {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}
   :mbql.query/stage              component-one
   :mbql.query/stage0             component-one

   ;; ### Stages
   ;; These form a doubly-linked list, since the `:mbql.stage/source` of a later stage is the previous stage, and that
   ;; ref can be followed both ways.
   :mbql.stage/query              {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}

   ;; `:mbql.stage/source` is the primary source of a stage. In a multi-stage query it forms a linked list of stages;
   ;; in the first stage it's a card or table. Note that `:mbql.stage/source` is not a component: we don't want to
   ;; delete the table or card. Deleting a middle stage (rather than the last one) isn't supported.
   :mbql.stage/source             {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}

   ;; Stages other than the final stage have reified column lists in `:mbql.stage/returned`.
   :mbql.stage/returned           component-many

   ;; ### Explicit Joins
   ;; Joins on the stage are an ordered list (`:mbql/series`). Each join has a `source` and 1 or more `condition`s.

   :mbql.join/source              {:db/cardinality :db.cardinality/one
                                   :db/valueType   :db.type/ref
                                   ;; Not sure this can ever happen - tables/cards don't really get removed.
                                   ;; Joins typically cascade because a column used in the condition is removed.
                                   :mbql/removal   :mbql.removal/reverse}

   ;; #### Conditions
   ;; Join conditions are components of the join and get deleted with it.
   ;; These get removed both ways - if the join is deleted so are the conditions (`:db/isComponent`); and if the last
   ;; condition gets removed then so does the join.
   ;;
   ;; Note that the condition -> join cascade is currently the only *conditional* `:mbql/removal` cascade - see the
   ;; function in [[remove-edge-conditions]] below.
   :mbql.join/condition           (merge component-many
                                         {:mbql/removal :mbql.removal/reverse})

   ;; #### Columns
   ;; A join has a ref to its *output* columns. (It's bidirectional since the columns also have the join as their
   ;; `:metadata.column/source`.) The columns are deleted if the join is deleted.
   ;;
   ;; TODO: Actually since `:metadata.column/_source` is already marked for `:mbql/removal`, this double link might be
   ;; unnecessary?
   :mbql.join/column              component-many

   ;; ### Implicit joins
   ;;
   ;; **Note: Implicit joins are not as battle-tested as most other parts of this model.** They work, but there might be
   ;; lurking issues that need refactoring here.
   ;;
   ;; Implicit joins are modeled as a *column*, whose `:metadata.column/source` as an entity for the implicit join, and
   ;; `:metadata.column/mirror` is the column we want to join.
   ;;
   ;; Implicit join *sources* are linked to the stage, and unique on `[stage fk-field]`. That is, on a given stage there
   ;; is at most one implicit join source for each FK column on that stage. This is one case where separate column
   ;; entities which `mirror` the same original is important: I might get `Orders.PRODUCT_ID` from both the source table
   ;; and an explicit join; those are separate columns and could have two separate implicit joins to `Products`.

   ;; #### Columns

   ;; An implicitly joined column is a standard "mirror" column, whose `source` is the implicit join source and `mirror`
   ;; is the column being joined in.
   ;;
   ;; Columns are de-duped on `[source-id mirror-id name]`, so if the same column is implicitly joined twice, say in
   ;; a filter and an aggregation, they are one entity.
   :mbql.join.implicit/fk-column  {:db/cardinality :db.cardinality/one
                                   :db/valueType   :db.type/ref
                                   :mbql/removal   :mbql.removal/reverse} ; If FK is removed, so is this join.
   ;; TODO: Should this be called `source`?
   :mbql.join.implicit/target     {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}
   :mbql.join.implicit/stage      {:db/cardinality :db.cardinality/one,  :db/valueType :db.type/ref}
   :mbql.join.implicit/handle     {:db/cardinality :db.cardinality/one
                                   :db/tupleAttrs  [:mbql.join.implicit/stage
                                                    :mbql.join.implicit/fk-column]
                                   :db/unique      :db.unique/identity}

   ;; ### Stage contents
   ;; Each type of clause on a stage is a list of entities.
   :mbql.stage/filter             component-many
   :mbql.stage/aggregation        component-many
   :mbql.stage/expression         component-many
   :mbql.stage/breakout           component-many
   :mbql.stage/join               component-many

   ;; ### Expression clauses
   ;;
   ;; Much of MBQL is defined as a tree of `[:function arg...]` clauses. Here that is represented as an AST, where each
   ;; node has `:mbql.clause/operator` (keywords as used in the clause arrays), and 0 or more `:mbql.clause/argument`s.
   :mbql.clause/operator          {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/keyword}
   :mbql.clause/argument          (merge component-many
                                         ;; Remove the whole clause if one of its input refs is removed.
                                         {:mbql/removal :mbql.removal/reverse})

   ;; Each `:mbql.clause/argument` is an entity with `:mbql/series` for ordering, and **exactly one of:**
   ;;
   ;; - `:mbql/lit` holding a literal values (number, string, keyword, whatever)
   ;; - `:mbql/ref` for references to columns
   ;; - `:mbql/sub` for subexpressions (`:mbql.clause/*` entities)
   ;;
   ;; Even though both of the latter are `:db.type/ref`, it makes sense to separate them since they get deleted
   ;; differently.
   :mbql/lit                      {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/any}
   ;; `:mbql/ref`s to columns are not `:db/isComponent`, since we don't want to delete a Field when a filter on that
   ;; field is deleted. `:mbql/ref` is `:mbql.removal/reverse`, though: if a column is deleted (eg. because its join is
   ;; getting deleted) then anything based on that column should be deleted too.
   :mbql/ref                      {:db/cardinality :db.cardinality/one
                                   :db/valueType   :db.type/ref
                                   :mbql/removal   :mbql.removal/reverse}
   ;; `:mbql/sub` subexpressions are both `:db/isComponent` and `:mbql.removal/reverse`, so deletes cascade in both
   ;; directions. Naturally a subexpression should be deleted any time the parent expression is deleted.
   :mbql/sub                      (merge component-one
                                         {:mbql/removal :mbql.removal/reverse})

   ;; ### Filters
   ;; Filters are `:mbql.clause/*` entities with `:mbql/series` for ordering.

   ;; ### Aggregations
   ;; Aggregations always have an `:mbql.aggregation/operator`, eg. `:count`, `:sum`, etc. Then there are two optional
   ;; attributes, depending on what the aggregation needs:
   ;;
   ;; `:mbql.aggregation/column` specifies the column of interest, for eg. `:sum`, `:max`. (Deleting the column deletes
   ;; the aggregation.)
   ;;
   ;; `:mbql.aggregation/filter` specifies a condition for `:count-where`, `:sum-where`. (Likewise, deleting the filter
   ;; cascades to the aggregation.)
   :mbql.aggregation/operator     {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/keyword}
   :mbql.aggregation/column       {:db/cardinality :db.cardinality/one
                                   :db/valueType   :db.type/ref
                                   :mbql/removal   :mbql.removal/reverse}
   :mbql.aggregation/filter       {:db/cardinality :db.cardinality/one
                                   :db/valueType   :db.type/ref
                                   :db/isComponent true
                                   :mbql/removal   :mbql.removal/reverse}

   ;; ### Custom expressions
   ;; A top-level expression on a stage is a `:mbql.clause/*` entity with two extra attributes: `:mbql.expression/name`
   ;; giving the human-defined name, and of course `:mbql/series`.
   :mbql.expression/name          {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/string}

   ;; ### Breakouts
   ;; Breakouts are "remixes" of a column (`:mbql.breakout/origin`), with optional binning or bucketing added.
   :mbql.breakout/origin          {:db/cardinality :db.cardinality/one
                                   :db/valueType   :db.type/ref
                                   :mbql/removal   :mbql.removal/reverse} ; Remove breakout if column is removed.
   ;; `:mbql.breakout/temporal-unit` is the keyword (eg. `:month`) of the temporal unit.
   :mbql.breakout/temporal-unit   {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/keyword}
   ;; `:mbql.breakout/binning` is a standalone entity giving the binning details.
   :mbql.breakout/binning         component-one

   :mbql.binning/num-bins         {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/int}
   :mbql.binning/bin-width        {:db/cardinality :db.cardinality/one,  #_#_:db/valueType :db.type/double}})

(def ^:private schema
  (merge metadata-schema query-schema))

(def ref-attrs
  (into #{} (for [[attr details] schema
                  :when (= (:db/valueType details) :db.type/ref)]
              attr)))

(defn fresh-db
  "Returns a fresh DataScript database with the schemas loaded."
  []
  (d/empty-db schema))

;; TODO: Probably remove anything `conn`-related, and stick to DB values?
(defn fresh-conn
  "Create a blank mutable database with the schema but nothing else."
  []
  (d/conn-from-db (fresh-db)))

;; ## Internal helpers
(defn- entity? [possible-entity]
  (datascript.impl.entity/entity? possible-entity))

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
  "Given any Entity, return a portable entid for it.

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

(defn- entid? [x]
  (and (vector? x)
       (= (count x) 2)
       (keyword? (first x))))

;; TODO: Fix up or delete this. It's unused currently and I think might be unnecessary.
;; If I do want to keep it, it should be reworked to handle the split of :mbql/ref and :mbql/sub into two.
#_(defn- walk-expression
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

#_(defn- walk-clauses [f expr]
  (walk-expression {:clause-fn f} expr))
#_(defn- walk-args [f expr]
  (walk-expression {:arg-fn f} expr))
#_(defn- walk-refs [f expr]
  (walk-expression {:ref-fn f} expr))

;; ## Stage numbers
;; The stages are stored as a linked list (via `:mbql.stage/source`) and the query has pointers to the first and last
;; stages. We need a way to turn a stage number (0, 1, -1) into the correct stage entity.
;;
;; With Entity smart maps, this can be done by logic to walk the stages. But to enable Datalog queries, we defined a set
;; of Datalog **rules**, named Datalog subqueries with parameters.
;;
;; This is *by far* the most complex Datalog querying in the PoC; feel free to skip right over it.
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
     [?stage :mbql.stage/source ?stage-k-1]]
    ;; Ascending order: k < target
    [(stages-asc ?stage-k-1 ?target ?k ?stage)
     [(> ?target ?k)]
     [?stage-k :mbql.stage/source ?stage-k-1]
     [(inc ?k) ?k+1]
     (stages-asc ?stage-k ?target ?k+1 ?stage)]])

;; TODO: Sort out a way to memoize these.
(defn- database-for [metadata-provider]
  (d/db-with (fresh-db) [(metadata-tx metadata-provider)]))

;; ## Library API
;; A few parts of this are DataScript-specific, but most of it is lifted straight from `metabase.lib.js`.
;;
;; The main difference is that queries are passed as DataScript Entities - smart maps that can dynamically walk the
;; indexes.
(defn query-stage
  "Given a `query-entity` and stage index, return the stage as an entity."
  [query-entity stage-number]
  (let [db        (d/entity-db query-entity)
        stage-eid (d/q '[:find ?stage .
                         :in % $ ?query ?stage-number :where
                         (stage-number ?query ?stage-number ?stage)]
                       rules-stages db (:db/id query-entity) stage-number)]
    (d/entity db stage-eid)))

;; ### Query builder
;; TODO: There are other possible inputs to base a query on.
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

(defn- with-stage
  "Important helper: takes a `query-entity`, `stage-number` and a function `(f stage-entity) => tx-data`.

  Expects to pass in the `stage-entity` for the specified stage, and get back a transaction to apply."
  [query-entity stage-number f]
  (let [stage (query-stage query-entity stage-number)]
    (-> query-entity
        d/entity-db
        (d/db-with (f stage))
        (d/entity (:db/id query-entity)))))

;; ### Filters
(defn filters
  "Returns a list of all filters on the specified stage, in order."
  [query-entity stage-number]
  (->> (query-stage query-entity stage-number)
       :mbql.stage/filter
       (sort-by :mbql/series)
       vec))

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

;; ### Expression clauses
(defn- clause-argument
  "Helper for turning user inputs into a `:mbql.clause/argument` entity with the right flavour of `:mbql/lit`,
  `:mbql/ref` or `:mbql/sub`."
  [arg]
  (cond
    (or (number? arg)
        (string? arg)
        (boolean? arg)) {:mbql/lit arg}
    ;; Handles both literal maps and entities.
    (or (map? arg)
        (:db/id arg))   (let [k (if (:metadata.column/source arg) :mbql/ref :mbql/sub)
                              v (or (:db/id arg) arg)]
                          {k v})
    ;; Safe to assume this is a column ref, since subexpressions have no entity ref.
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

  The `args` can be DataScript Entities, `[:metadata.field/id 12]` refs, maps (typically nested clauses), or literal
  numbers and strings. (Note that they can't be plain numeric entity IDs - those will get interpreted as literal
  numbers!)

  Returns the `:mbql.clause/*` entity in a transactable form."
  [op & args]
  {:mbql/uuid            (str (random-uuid))
   :mbql.clause/operator op
   :mbql.clause/argument (clause-arguments args)})

;; ### Aggregations
(defn- aggregation-clause
  "Builder for an aggregation. Takes 1 to 3 args:

  - `(aggregation-clause :count)`
  - `(aggregation-clause :sum [:metadata.field/id 12])`
  - `(aggregation-clause :sum-where [:metadata.field/id 12] (expr := [:metadata.field/id 9] 7))`
      - `column` can be nil: `(aggregation-clause :count-where nil (expr := [:metadata.field/id 9] 7))`"
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
  "Returns the (ordered) list of aggregations on the given stage, as a vector of Entities."
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


;; ### Breakouts
(defn- stage-breakouts [stage-entity]
  (->> stage-entity
       :mbql.stage/breakout
       (sort-by :mbql/series)
       vec))

(defn breakouts
  "Returns the breakouts in order."
  [query-entity stage-number]
  (stage-breakouts (query-stage query-entity stage-number)))

(defn- ->breakout
  "Accepts a regular *column* or a breakout entity.

  Wraps vanilla columns into a breakout Entity with `:mbql.breakout/origin`."
  [column-or-breakout]
  (if (:mbql.breakout/origin column-or-breakout)
    column-or-breakout
    {:mbql.breakout/origin column-or-breakout
     :mbql/uuid            (str (random-uuid))}))

(defn breakout
  "Adds a breakout to this stage. The breakout is a column, perhaps with bucketing or binning. It can also be a direct
  ref to a field or column.

  Breakouts are stored with `:mbql.breakout/origin` pointing to the original column, field, etc.; if the input does not
  have that attribute then the entire input will be used as the value for `:mbql.breakout/origin` in a new entity."
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

;; ### Custom expressions
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
                                         {:metadata.column/source (:db/id stage)
                                          :metadata.column/name   expression-name
                                          :mbql.expression/name   expression-name
                                          :mbql/series            series})}]))))

;; ### Explicit joins
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

(defn- entity->db [db-or-entity]
  (if (d/db? db-or-entity)
    db-or-entity
    (d/entity-db db-or-entity)))

(defn- entid [db-or-entity entid-or-entity]
  (or (when (number? entid-or-entity) entid-or-entity)
      (:db/id entid-or-entity)
      (d/entid (entity->db db-or-entity) entid-or-entity)))

(defn- entity [db-or-other-entity entid-or-entity]
  (if (entity? entid-or-entity)
    entid-or-entity
    (d/entity (entity->db db-or-other-entity) (entid db-or-other-entity entid-or-entity))))

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

(defn- fix-join-conditions
  "When adding a `join-clause` with conditions, those conditions will probably contain `:mbql/ref`s pointing to columns
  from the join's `source`. Since join columns are reified in the database with `:metadata.column/source the-join`
  and `:metadata.column/mirror original-column`, we should adjust those refs to point at the join's own columns instead
  of directly at the source's columns.

  This assumes the \"standard\" shape of join conditions, where the LHS references existing columns and the RHS
  references join columns. (In most cases, we can tell them apart in any position because the `source` of the column is
  the same as the join's `source`. But that doesn't work when joining the source table a second time, either directly or
  via other joins.)"
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
                                                            ref-eid
                                                            (:metadata.column/name ref-entity)]]
                                  (:mbql/ref rhs))]
               (assoc cnd :mbql.clause/argument [lhs (assoc rhs :mbql/ref adjusted-ref)]))))}]))

(defn join
  "Adds an explicit join to this stage, with the given source and conditions.

  The `joinable` is either a source like a table, or a `:mbql.join/*` entity.

  The columns for this join are reified in the DB: the join is their source and they `mirror` the original columns."
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
   (let [series     (count (joins query-entity stage-number))]
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

;; ### Internals: Source type dispatch
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

;; ### Source names
;; These aren't actually used anywhere yet. I thought they would be needed but ended up using a different approach.
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

;; ### Column names for synthesized columns
(def ^:private column-dispatch-keys
  {:metadata.column/mirror    :column/mirror
   :metadata.field/id         :column/field
   :mbql.expression/name      :column/expression
   :mbql.aggregation/operator :column/aggregation
   :mbql.breakout/origin      :column/breakout})

(defn- column-dispatch [maplike]
  (some column-dispatch-keys (keys maplike)))

(defmulti column-name
  "Returns a plausible, nearly unique (might need `_2` disambiguation) column name, based on the kind of column."
  column-dispatch)

(defmethod column-name :column/field [column]
  (:metadata.column/name column))

(defmethod column-name :column/mirror [column]
  (column-name (:metadata.column/mirror column)))

(defmethod column-name :column/expression [column]
  (:mbql.expression/name column))

(defmethod column-name :column/aggregation [{:mbql.aggregation/keys [operator column]}]
  (if column
    (str (name operator) "__" (column-name column))
    (name operator)))

(defmethod column-name :column/breakout [column]
  (column-name (:mbql.breakout/origin column)))

;; ### Returned columns
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
  ;; Implicit joins don't export columns directly. They only get returned when used for something that is exported, like
  ;; a breakout. Those are handled in other [[returned-columns-method]]s.
  (log/warn "Tried to call returned-columns-method on an implicit join source?")
  [])

(defmethod returned-columns-method :mbql/stage [stage]
  (if-let [retcols (:mbql.stage/returned stage)]
    ;; This isn't the last stage, so return the reified list of returned columns.
    (sort-by :mbql/series retcols)

    ;; Last stages don't have reified columns, so return them dynamically.
    (or
      ;; With a breakout or aggregation: return the breakouts followed by the aggregations.
      (not-empty (concat (stage-breakouts stage)
                         (stage-aggregations stage)))

      ;; With no breakouts or aggregations: main source then expressions then joins (in order).
      ;; TODO: Is that actually the right order?
      (concat (returned-columns-method (:mbql.stage/source stage))
              (stage-expressions stage)
              (->> (:mbql.stage/join stage)
                   (sort-by :mbql/series)
                   (mapcat returned-columns-method))))))

(defmethod returned-columns-method :metadata/table [table]
  (->> table
       :metadata.column/_source
       (sort-by :mbql/series)))

(defn returned-columns
  "Given a query and stage number, return the (ordered) list of the columns it will return.

  - MBQL stages with aggregations return all their breakouts followed by all their aggregations, each in order.
  - MBQL stages without aggregations return the columns from: main source, expressions, explicit joins in order."
  ;; TODO: Double-check that ordering.
  [query-entity stage-number]
  (returned-columns-method (query-stage query-entity stage-number)))

;; ### Visible columns
;; This reverses the "column groups" flow from the original API - the primary function [[visible-column-groups]] returns
;; the groups. [[visible-columns]] calls that and `concat`s the column lists of each group. This is more natural and
;; avoids expensively inferring the groups from the combined column list.
(defn- root-column
  "Recursively follow `:metadata.column/mirror` to find the original column.

  **Note:** This should only be used to get the name, types, etc. for a column. It is not safe to use for comparisons
  or anything else. Even when \"the same\" column is coming from multiple sources, they should be treated as separate.

  Any clause which transforms a column (eg. a breakout) should be considered a new, fresh column and not have
  `:metadata.column/mirror`. (Breakouts even without bucketing or binning are new columns, since breakouts are sorted
  and de-duped via `GROUP BY`.)"
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

;; ### Multiple stages
(defn append-stage
  "Appends a new stage to the provided query. The previous stage will have reified columns added for all its
  [[returned-columns]], with `:metadata.column/mirror` pointed at the original column, and `:metadata.column/source`
  pointed at that earlier stage."
  ;; TODO: Update the reified columns for intermediate stages when they get edited.
  [query-entity]
  (let [stage   (:mbql.query/stage query-entity)
        reified (map-indexed (fn [i column]
                               {:metadata.column/mirror (:db/id column)
                                :metadata.column/source (:db/id stage)
                                :mbql/series            i})
                             (returned-columns-method stage))]
    (-> (d/entity-db query-entity)
        (d/db-with
          [;; Updating the top-level query with its new stage, whose source is the earlier stage.
           {:db/id               (:db/id query-entity)
            :mbql.query/stage    {:mbql.stage/source (:db/id stage)
                                  :mbql.stage/query  (:db/id query-entity)}}
           ;; Updating the original stage to have its reified set of columns.
           {:db/id               (:db/id stage)
            :mbql.stage/returned reified}])
        (d/entity (:db/id query-entity)))))

;; ### Paths
;; These are test helpers to replace a lot of `(meta/field-metadata ...)` calls etc.

;; See [[in>]] for the details.

;; Note the convention that all functions of this shape `(foo> entity path...)` *end* with `>`.
(defn- path-step [x path-part]
  (cond
    (entity? path-part)  (first (core/filter #(= (:db/id %) (:db/id path-part)) x))
    (string? path-part)  (first (core/filter #(= (:metadata.column/name (root-column %)) path-part) x))
    (number? path-part)  (first (core/filter #(= (:mbql/series %) path-part) x))
    (fn? path-part)      (path-part x)
    (keyword? path-part) (path-part x)
    :else                (throw (ex-info "path-step cannot understand path part" {:path-part path-part}))))

(defn- in>* [entity path-parts]
  (reduce path-step entity path-parts))

(defn in>
  "Test helper that navigates from the provided `entity` to some inner value.

      (in> query :mbql.query/stage :mbql.stage/join 0 :mbql.join/column \"PRODUCT_ID\"

  (But see [[stage>]] for a more convenient way to write the same path.)

  - Keywords are applied directly on the entity (`:mbql.stage/join`)
  - Functions are likewise applied directly
  - Strings search a list for the matching `:metadata.column/name`
  - Numbers search a list for the matching `:mbql/series`
  - Entities are *not* used directly!
      - Instead, their `:db/id` is used to look up the version of that entity within the navigated entity's DB.
      - The navigated entity's DB might be newer (or older) than the one provided in the path.

  Returns the entity navigated to."
  [entity & parts]
  (in>* entity parts))

(defn stage>
  "Test helper which wraps [[in>]] with the common logic of starting from a query's latest stage.

  The first argument `stage-or-query` can be either a query or stage entity."
  [stage-or-query & parts]
  (in>* (or (:mbql.query/stage stage-or-query)
            stage-or-query)
        parts))


;; ## Remove and Replace
;;
;; This is one of the most complex parts of the original MLv2 implementation and a real proof (or disproof) of the value
;; of this database-powered approach.

;; ### Schema attributes

;; The DataScript schema has been augmented with our own meta-attribute `:mbql/removal`, which has a value of
;; `:mbql.removal/forward`, `:mbql.removal/reverse` or `:mbql.removal/bidirectional`.
;; (Currently everything is `:mbql.removal/reverse`, but I think that's just a coincidence? Or maybe the forward
;; direction is captured by `:db/isComponent`?)

;; In addition we use the built-in `:db/isComponent true` meta-attribute, which will be followed when transacting with
;; `:db.fn/retractEntity`. This is useful for deleting parts of entities that cannot outlive the parent -
;; subexpressions, join conditions, etc.

;; The difference here is important: the `:mbql/removal` edges give the MBQL sense of cascading deletes, eg. deleting
;; an explicit join should delete anything that references its columns (even across stages). These edges go both
;; "upward" and "downward" in the traditional MBQL data structure. `:db/isComponent` is a more fundamental, DataScript
;; sense of containment - it says that eg. `:mbql.clause/argument` entities have no existence independently of the
;; parent clause entity, and get deleted when it does.

;; These are separate because there are cases where we need to control each separately. For example, when a complex
;; aggregation like `:sum-where` is deleted, its `:mbql.aggregation/filter` expression tree needs to be (recursively)
;; deleted too; that's handled with `:db/isComponent`. In contrast, the column being summed (`:mbql.aggregation/column`)
;; might be a global `[:metadata.field/id 123]`, and should not be deleted.

;; Going the other way, if a join gets removed so do its columns, and if one of those columns was used in *either* the
;; aggregation's `filter` or `column`, then the entire aggregation should be removed. This is the MBQL cascading delete
;; powered by `:mbql/removal`.

;; ### Removal process

;; Removal proceeds like this:
;;
;; 1. Wrap the target clause we want to delete into a set of `removals`.
;; 2. Recursively follow the `:mbql/removal` edges until the set stops growing - this is the transitive closure of
;;    things to remove.
;; 3. A few edges have more complex conditions on them; these are checked before traversing them.
;;     - For example, `:mbql.join/_condition`: deleting a condition deletes the join ONLY IF all the conditions are
;;       getting deleted.
;; 4. Transact `[:db.fn/retractEntity eid]` for each of those entities.
;;     - That retracts (1) all attributes on the entity `eid` itself, **and** (2) recursively follows any
;;       `:db/isComponent` refs and deletes them entirely as well.
;; 5. Walk each stage and each ordered slice, and fix any `:mbql/series` indexing that's now broken.
;;    It's easier to walk the entire query for this than it is to try to keep track of what needs to change.
;;
;; ### Replace
;;
;; This is straightforward, since any references to the changing clause are just entity ID numbers; they don't copy its
;; column name or anything like that.
;;
;; ### Swap
;;
;; We expect the two entities to be the same kind, which means that they both have eg. `:mbql.stage/_aggregation`
;; pointing to the same stage. This is an easy check on the entities.
;;
;; There's an additional condition for expressions. Call the two expressions `earlier` and `later`:
;;
;; - None of the expressions in `(earlier, later]` can depend on `earlier`
;; - `later` cannot depend on `[earlier, later)`
;;
;; Those conditions are easy enough to check with [[d/query]]. (The same would be true for joins, except that we don't
;; allow swapping their order.)
;;
;; Assuming those preconditions pass, enacting a swap is trivial: swap their `:mbql/series` values.

;; TODO: Support order-by, which I've been ignoring pretty much completely. Should be straightforward.
;; TODO: Make sure order-by is included in removal!
;; TODO: Add limit as well.

(def ^:private remove-edges
  "The set of attributes (forward or reverse) that should be followed to find \"parent\" entities when something is
  slated for deletion. For example, from a source to all its columns, from a column to any `:mbql/ref` clause arguments
  to parent clauses to the join whose condition this is, to all columns on that join, ...

  When new attributes are added to the schema, they should be considered for inclusion here. There's no enforcement, but
  perhaps we could insist on that at a schema level?"
  (set (for [[attr {removal :mbql/removal}] schema
             :when removal]
         (case removal
           :mbql.removal/forward attr
           :mbql.removal/reverse (keyword (namespace attr) (str "_" (name attr)))))))

(def ^:private remove-edge-conditions
  "Map of edges (forward or backward attributes) to functions which check some larger condition.
  These condition functions are passed the current set of removals, the source entity, and the target entity.
  They return a set of removals, possibly with extra things in it.

  Note that the source entity is already in the `removals` set when the function is called."
  {;; Joins are removed only when their *last* condition is about to be removed. So if we're following a condition->join
   ;; edge (:mbql.join/_condition) and that puts *all* the conditions on the chopping block, then we add the join.
   :mbql.join/_condition (fn [removals cnd join]
                           (cond-> removals
                             (every? removals (:mbql.join/condition join)) (conj join)))})

(defn- extend-removals
  "Given a set of things to be removed and an entity from that set, walk any removal edges from that entity and add them
  to the set. Returns the possibly larger removal set."
  [removals entity]
  (into removals
        (for [edge  remove-edges                             ; For each removal edge:
              :let [pred    (remove-edge-conditions edge)
                    targets (when-let [t (get entity edge)]
                              (if (set? t) t #{t}))]
              :when targets                                  ; If that edge exists on this entity
              target targets                                 ; For each target of the edge
              :when (or (not pred)                           ; When either there's no predicate for this edge
                        (pred removals entity target))]      ; or the predicate passes
          target)))                                          ; Add that target to the set.

(defn- removal-closure
  "Recursively expands a set of removals until it stops growing."
  [removals]
  (loop [removals removals]
    (let [removals' (reduce extend-removals removals removals)]
      (if (= (count removals) (count removals'))
        removals'
        (recur removals')))))

(defn- removals->tx [removals]
  (vec (for [removed removals]
         [:db.fn/retractEntity (:db/id removed)])))

(defn- fix-series-indexing
  [query-entity]
  (let [db    (d/entity-db query-entity)
        edits (for [stage-id (d/q '[:find [?stage ...]
                                    :in $ ?query :where
                                    [?stage :mbql.stage/query ?query]]
                                  db (:db/id query-entity))
                    :let [stage (d/entity db stage-id)]
                    attr [:mbql.stage/aggregation :mbql.stage/breakout :mbql.stage/expression
                          :mbql.stage/join :mbql.stage/filter :mbql.stage/order-by]
                    [correct-index entity] (map-indexed vector (sort-by :mbql/series (get stage attr)))
                    :when (not= correct-index (:mbql/series entity))]
                [:db/add (:db/id entity) :mbql/series correct-index])]
    (if (seq edits)
      (-> (d/db-with db edits)
          (d/entity (:db/id query-entity)))
      query-entity)))

(defn remove-clause
  "Removes the `target-clause` from its `query`. No stage number is needed since the `target-clause` is self-contained.

  Returns the updated query entity."
  [query-entity target-clause]
  (let [tx-data (->> #{target-clause}
                     removal-closure
                     removals->tx)]
    (-> (d/entity-db target-clause)
        (d/db-with tx-data)
        (d/entity (:db/id query-entity))
        fix-series-indexing)))

;; # Thoughts and Notes

;; ## Problem: Updating metadata
;; Currently in the FE we maintain a `Metadata` object and periodically update it; each query gets a `metadata-provider`
;; which wraps the JS `Metadata` object at creation time. Those objects never change, and are replaced outright when
;; new metadata is retrieved from the server.
;;
;; There's no "bleeding" issue here but I think DataScript offers a tantalizing possibility of a much smarter "sync"
;; process between server and client, with the atomically updated DB as the source of truth rather than the JS object.
;; (It's straightforward to support the JS API on top of the DB.) We could (1) cache the metadata in LocalStorage,
;; (2) send diffs from the server rather than re-fetching things we already have, (3) be more reactive in trying to
;; render things, failing due to missing or mismatched metadata, trigger a refresh, and then reactively update.

;; On JVM, the entire metadata is accessible but we generally access it on demand, synchronously.
;; There's no way currently to plug lazy access into DataScript, even when we can block on JVM.
;; But I think we can tackle it with a pre-tx step that examines the transaction we're about to
;; execute looking for eg. `{:metadata.table/id X}` idents and prefetching those values into the
;; transaction, and replacing the idents with `-1` placeholders.
;; That function can be a no-op on the CLJS side, since there we would assume the FE had already
;; populated the data.

;; ## Miscellaneous ideas
;;
;; ### Updating metadata on existing queries
;;
;; Manipulating the `:next-eid` in DataScript to separate metadata from the query from caches gives us a fast way to
;; delete or select either the metadata or the query parts en bloc.
;;
;; To update the metadata, select all the query-related datoms with `(d/seek-datoms db :eavt query-slice-eid0)`, build
;; the new metadata DB, and reapply the query datoms on top.

;; ### One big database
;;
;; Rather than each query getting its own database, they could all live in one big database. That's more
;; memory-efficient but there's some tricky parts. There's no good way to tell that a query hasn't been used in a long
;; time and can be dropped from the working DB. (Perhaps that's not an issue if the whole DB is ephemeral.)
;;
;; The big concern to me here is the handling of ad-hoc queries vs. their original forms. There's a vital difference
;; between a saved query and the ad-hoc query we created by editing it but haven't yet saved. Treating each query as a
;; different, immutable DB *value* gives us exactly the semantics we need. If only the saved questions live in the big
;; database, that's effectively just sharing the metadata.

;; ### Saved questions and find/replace
;;
;; In the light of the find/replace features we're planning, I think there's some powerful tools in the navigability of
;; the DataScript DB. Since the links formed by field refs are reified and queryable in both directions, and no data is
;; cloned or copied, it is possible to perform sophisticated, efficiently indexed walks of the cards.
;;
;; **Thought experiment:** If we have in appdb an index of all the queries touching a certain table or field, we can
;; load them all into DataScript. Now consider some possible find/replace things:
;;
;; - Changing the name of a field? Every ref to it everywhere is found in the transitive closure of `:mbql/_ref` and
;;   `:metadata.column/_mirror`. Collect the list of query IDs that need updating, and write out the legacy MBQL.
;; - Removing a field? We already have the logic for this and it doesn't care about query boundaries! Run that, skim the
;;   set of deletions to get the set of touched queries, and write them back out to legacy.
;; - New field on a table? Add it to all reified column lists (on joins, non-final stages) that aren't marked as being
;;   an explicit `:fields` clause!
;;
;; ### Why even appDB?
;;
;; This is considerably more radical, but there's no fundamental reason that we have to store the appdb data in SQL at
;; all. The server could store the metadata (Database, Table, Field) and at least the `:dataset_query` part of cards
;; in a DataScript-based durable DB like Datahike. (The rest of the cards and all the other data could stay in SQL, with
;; just the Datahike entity IDs for queries, databases, etc. in it.)
;;
;; - Datahike keeps history, like Datomic. That enables two things:
;;     - Let a client keep a local cache, and send it batched updates over the network - cheap and easy diff sync!
;;     - Querying at any point in time, enabling us to expose the history of any table, card, model, etc. transparently.
;; - No added deployment overhead. Datahike has pluggable storage, including a mature JDBC backend.
;;     - So the Datahike data goes in new tables in the existing appdb.
;;     - (The Datahike data are stored opaquely in binary blobs; it's not visible to SQL.)
;; - Big migrations need big upsides!
;;     - I think the remarks above about the power of *real* refs in queries linking to metadata, and how much leverage
;;       that gives for find/replace, is a compelling upside.
;;     - A clear history and the ability to stream updates to the client is very powerful.
;; - From this POV, storing JSON-encoded data like `:dataset_query` opaquely in SQL makes the SQL part pure friction.
;;     - We have to do a lot of expensive, fragile custom logic to reconstruct the references between parts of queries
;;       and metadata. Moving to real, navigable references (even if only in memory) is a huge increase in leverage.
;;
;; I wouldn't go so far as to advocate for making this a Thing We Plan to Do. But I think it's far too powerful -
;; especially when it comes to find/replace - to dismiss it out of hand.

(ns metabase.lib.join
  "Functions related to manipulating EXPLICIT joins in MBQL."
  (:require
   [clojure.string :as str]
   [inflections.core :as inflections]
   [medley.core :as m]
   [metabase.lib.common :as lib.common]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.query :as lib.query]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.filter :as lib.schema.filter]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.util.match :as mbql.u.match]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(def ^:private JoinWithOptionalAlias
  "A Join that may not yet have an `:alias`, which is normally required; [[join]] accepts this and will add a default
  alias if one is not present."
  [:merge
   [:ref ::lib.schema.join/join]
   [:map
    [:alias {:optional true} [:ref ::lib.schema.join/alias]]]])

(def ^:private PartialJoin
  "A join that may not yet have an `:alias` or `:conditions`."
  [:merge
   JoinWithOptionalAlias
   [:map
    [:conditions {:optional true} [:ref ::lib.schema.join/conditions]]]])

(def ^:private FieldOrPartialJoin
  [:or
   lib.metadata/ColumnMetadata
   [:ref :mbql.clause/field]
   PartialJoin])

(mu/defn with-join-alias :- FieldOrPartialJoin
  "Add OR REMOVE a specific `join-alias` to `field-or-joinable`, which is either a `:field`/Field metadata, or something
  'joinable' like a join map or Table metadata. Does not recursively update other references (yet; we can add this in
  the future)."
  {:style/indent [:form]}
  [field-or-joinable :- FieldOrPartialJoin
   join-alias        :- [:maybe ::lib.schema.common/non-blank-string]]
  (case (lib.dispatch/dispatch-value field-or-joinable)
    :field
    (lib.options/update-options field-or-joinable u/assoc-dissoc :join-alias join-alias)

    :metadata/column
    (u/assoc-dissoc field-or-joinable ::join-alias join-alias)

    :mbql/join
    (u/assoc-dissoc field-or-joinable :alias join-alias)))

(mu/defn current-join-alias :- [:maybe ::lib.schema.common/non-blank-string]
  "Get the current join alias associated with something, if it has one."
  [field-or-joinable :- FieldOrPartialJoin]
  (case (lib.dispatch/dispatch-value field-or-joinable)
    :field          (:join-alias (lib.options/options field-or-joinable))
    :metadata/column (::join-alias field-or-joinable)
    :mbql/join      (:alias field-or-joinable)))

(mu/defn resolve-join :- ::lib.schema.join/join
  "Resolve a join with a specific `join-alias`."
  [query        :- ::lib.schema/query
   stage-number :- :int
   join-alias   :- ::lib.schema.common/non-blank-string]
  (let [{:keys [joins]} (lib.util/query-stage query stage-number)]
    (or (m/find-first #(= (:alias %) join-alias)
                      joins)
        (throw (ex-info (i18n/tru "No join named {0}, found: {1}"
                                  (pr-str join-alias)
                                  (pr-str (mapv :alias joins)))
                        {:join-alias   join-alias
                         :query        query
                         :stage-number stage-number})))))

(defmethod lib.metadata.calculation/display-name-method :mbql/join
  [query _stage-number {[{:keys [source-table source-card], :as _first-stage}] :stages, :as _join} _style]
  (or
   (when source-table
     (:display-name (lib.metadata/table query source-table)))
   (when source-card
     (i18n/tru "Question {0}" source-card))
   (i18n/tru "Native Query")))

(defmethod lib.metadata.calculation/display-info-method :mbql/join
  [query stage-number join]
  (let [display-name (lib.metadata.calculation/display-name query stage-number join)]
    {:name (or (:alias join) display-name), :display-name display-name}))

(mu/defn ^:private column-from-join-fields :- lib.metadata.calculation/ColumnMetadataWithSource
  "For a column that comes from a join `:fields` list, add or update metadata as needed, e.g. include join name in the
  display name."
  [query           :- ::lib.schema/query
   stage-number    :- :int
   column-metadata :- lib.metadata/ColumnMetadata
   join-alias      :- ::lib.schema.common/non-blank-string]
  (let [column-metadata (assoc column-metadata :source-alias join-alias)
        col             (-> (assoc column-metadata
                                   :display-name (lib.metadata.calculation/display-name query stage-number column-metadata)
                                   :lib/source   :source/joins)
                            (with-join-alias join-alias))]
    (assert (= (current-join-alias col) join-alias))
    col))

(defmethod lib.metadata.calculation/metadata-method :mbql/join
  [query stage-number {:keys [fields stages], join-alias :alias, :or {fields :none}, :as _join}]
  (when-not (= fields :none)
    (let [ensure-previous-stages-have-metadata (resolve 'metabase.lib.stage/ensure-previous-stages-have-metadata)
          join-query (cond-> (assoc query :stages stages)
                       ensure-previous-stages-have-metadata
                       (ensure-previous-stages-have-metadata -1))
          field-metadatas (if (= fields :all)
                            (lib.metadata.calculation/metadata join-query -1 (peek stages))
                            (for [field-ref fields
                                  :let [join-field (lib.options/update-options field-ref dissoc :join-alias)]]
                              (lib.metadata.calculation/metadata join-query -1 join-field)))]
      (mapv (fn [field-metadata]
              (column-from-join-fields query stage-number field-metadata join-alias))
            field-metadatas))))

(mu/defn joined-field-desired-alias :- ::lib.schema.common/non-blank-string
  "Desired alias for a Field that comes from a join, e.g.

    MyJoin__my_field

  You should pass the results thru a unique name function."
  [join-alias :- ::lib.schema.common/non-blank-string
   field-name :- ::lib.schema.common/non-blank-string]
  (lib.util/format "%s__%s" join-alias field-name))

(defn- add-source-and-desired-aliases
  [join unique-name-fn col]
  ;; should be dev-facing-only so don't need to i18n
  (assert (:alias join) "Join must have an alias to determine column aliases!")
  (assoc col
         :lib/source-column-alias  (:name col)
         :lib/desired-column-alias (unique-name-fn (joined-field-desired-alias (:alias join) (:name col)))))

(defmethod lib.metadata.calculation/visible-columns-method :mbql/join
  [query stage-number join {:keys [unique-name-fn], :as _options}]
  (mapv (partial add-source-and-desired-aliases join unique-name-fn)
        (lib.metadata.calculation/metadata query stage-number (assoc join :fields :all))))

(mu/defn all-joins-visible-columns :- lib.metadata.calculation/ColumnsWithUniqueAliases
  "Convenience for calling [[lib.metadata.calculation/visible-columns]] on all of the joins in a query stage."
  [query          :- ::lib.schema/query
   stage-number   :- :int
   unique-name-fn :- fn?]
  (into []
        (mapcat (fn [join]
                  (lib.metadata.calculation/visible-columns query
                                                            stage-number
                                                            join
                                                            {:unique-name-fn               unique-name-fn
                                                             :include-implicitly-joinable? false})))
        (:joins (lib.util/query-stage query stage-number))))

(mu/defn all-joins-metadata :- lib.metadata.calculation/ColumnsWithUniqueAliases
  "Convenience for calling [[lib.metadata.calculation/metadata]] on all the joins in a query stage."
  [query          :- ::lib.schema/query
   stage-number   :- :int
   unique-name-fn :- fn?]
  (into []
        (mapcat (fn [join]
                  (map (partial add-source-and-desired-aliases join unique-name-fn)
                       (lib.metadata.calculation/metadata query stage-number join))))
        (:joins (lib.util/query-stage query stage-number))))

(defmulti join-clause-method
  "Convert something to a join clause."
  {:arglists '([joinable])}
  lib.dispatch/dispatch-value
  :hierarchy lib.hierarchy/hierarchy)

;; TODO -- should the default implementation call [[metabase.lib.query/query]]? That way if we implement a method to
;; create an MBQL query from a `Table`, then we'd also get [[join]] support for free?

(defmethod join-clause-method :mbql/join
  [a-join-clause]
  a-join-clause)

;;; TODO -- this probably ought to live in [[metabase.lib.query]]
(defmethod join-clause-method :mbql/query
  [another-query]
  (-> {:lib/type :mbql/join
       :stages   (:stages (lib.util/pipeline another-query))}
      lib.options/ensure-uuid))

;;; TODO -- this probably ought to live in [[metabase.lib.stage]]
(defmethod join-clause-method :mbql.stage/mbql
  [mbql-stage]
  (-> {:lib/type :mbql/join
       :stages   [mbql-stage]}
      lib.options/ensure-uuid))

(mu/defn with-join-conditions :- PartialJoin
  "Update the `:conditions` (filters) for a Join clause."
  {:style/indent [:form]}
  [a-join     :- PartialJoin
   conditions :- [:maybe [:sequential [:or ::lib.schema.expression/boolean ::lib.schema.common/external-op]]]]
  (u/assoc-dissoc a-join :conditions (not-empty (mapv lib.common/->op-arg conditions))))

(mu/defn join-clause :- PartialJoin
  "Create an MBQL join map from something that can conceptually be joined against. A `Table`? An MBQL or native query? A
  Saved Question? You should be able to join anything, and this should return a sensible MBQL join map."
  ([joinable]
   (join-clause-method joinable))

  ([joinable conditions]
   (with-join-conditions (join-clause-method joinable) conditions)))

(mu/defn with-join-fields :- PartialJoin
  "Update a join (or a function that will return a join) to include `:fields`, either `:all`, `:none`, or a sequence of
  references."
  [joinable :- PartialJoin
   fields   :- [:maybe [:or [:enum :all :none] [:sequential some?]]]]
  (u/assoc-dissoc joinable :fields (if (keyword? fields)
                                     fields
                                     (not-empty (mapv lib.ref/ref fields)))))

(defn- select-home-column
  [home-cols cond-fields]
  (let [cond->home (into {}
                         (keep  (fn [home-col]
                                  (when-let [cond-field (lib.equality/find-closest-matching-ref
                                                         (lib.ref/ref home-col)
                                                         cond-fields)]
                                    [cond-field home-col])))
                         home-cols)
        cond-home-cols (map cond->home cond-fields)]
    ;; first choice: the leftmost FK or PK in the condition referring to a home column
    (or (m/find-first (some-fn lib.types.isa/foreign-key? lib.types.isa/primary-key?) cond-home-cols)
        ;; otherwise the leftmost home column in the condition
        (first cond-home-cols)
        ;; otherwise the first FK home column
        (m/find-first lib.types.isa/foreign-key? home-cols)
        ;; otherwise the first PK home column
        (m/find-first lib.types.isa/primary-key? home-cols)
        ;; otherwise the first home column
        (first home-cols))))

(defn- strip-id [s]
  (when (string? s)
    (str/trim (str/replace s #"(?i) id$" ""))))

(defn- similar-names?
  "Checks if `name0` and `name1` are similar.
  Two names are considered similar if they are the same, one is the plural of the other,
  or their plurals are equal.
  This is used to avoid repeating ourselves in situations like when we have a table called
  PRODUCTS and a field (presumably referring to that table) called PRODUCT."
  [name0 name1]
  (and (string? name0) (string? name1)
       (let [plural1 (delay (inflections/plural name1))
             plural0 (delay (inflections/plural name0))]
         (or (= name0 name1)
             (= name0 @plural1)
             (= @plural0 name1)
             (= @plural0 @plural1)))))

(defn- calculate-join-alias [query joined home-col]
  (let [joined-name (lib.metadata.calculation/display-name
                     (if (= (:lib/type joined) :mbql/query) joined query)
                     joined)
        home-name   (when home-col (strip-id (lib.metadata.calculation/display-name query home-col)))
        similar     (similar-names? joined-name home-name)
        join-alias  (or (and joined-name
                             home-name
                             (not (re-matches #"(?i)id" home-name))
                             (not similar)
                             (str joined-name " - " home-name))
                        joined-name
                        home-name
                        "source")]
    join-alias))

(defn- field-clause? [field-clause]
  (and (lib.util/clause? field-clause)
       (= (first field-clause) :field)))

(defn- add-alias-to-join-refs [metadata-providerable form join-alias join-refs]
  (mbql.u.match/replace form
    (field :guard (fn [field-clause]
                    (and (field-clause? field-clause)
                         (boolean (lib.equality/find-closest-matching-ref
                                   metadata-providerable field-clause join-refs)))))
    (with-join-alias field join-alias)))

(defn- add-alias-to-condition
  [metadata-providerable condition join-alias home-refs join-refs]
  (let [condition (add-alias-to-join-refs metadata-providerable condition join-alias join-refs)]
    ;; Sometimes conditions have field references which cannot be unambigously
    ;; assigned to one of the sides. The following code tries to deal with
    ;; these cases, but only for conditions that look like the ones generated
    ;; generated by the FE. These have the form home-field op join-field,
    ;; so we break ties by looking at the poisition of the field reference.
    (mbql.u.match/replace condition
      [op op-opts (lhs :guard field-clause?) (rhs :guard field-clause?)]
      (let [lhs-aliased (contains? (lib.options/options lhs) :join-alias)
            rhs-aliased (contains? (lib.options/options rhs) :join-alias)]
        (cond
          ;; no sides obviously belong to joined
          (not (or lhs-aliased rhs-aliased))
          (if (lib.equality/find-closest-matching-ref metadata-providerable rhs home-refs)
            [op op-opts (with-join-alias lhs join-alias) rhs]
            [op op-opts lhs (with-join-alias rhs join-alias)])

          ;; both sides seem to belong to joined assuming this resulted from
          ;; overly fuzzy matching, we remove the join alias from the LHS
          ;; unless the RHS seems to belong to home too while the LHS doen't
          (and lhs-aliased rhs-aliased)
          (let [bare-lhs (lib.options/update-options lhs dissoc :join-alias)
                bare-rhs (lib.options/update-options rhs dissoc :join-alias)]
            (if (and (nil? (lib.equality/find-closest-matching-ref metadata-providerable bare-lhs home-refs))
                     (lib.equality/find-closest-matching-ref metadata-providerable bare-rhs home-refs))
              [op op-opts lhs bare-rhs]
              [op op-opts bare-lhs rhs]))

          ;; we leave alone the condition otherwise
          :else &match)))))

(defn- generate-unique-name [base-name taken-names]
  (let [generator (lib.util/unique-name-generator)]
    (run! generator taken-names)
    (generator base-name)))

(mu/defn ^:private add-default-alias :- ::lib.schema.join/join
  "Add a default generated `:alias` to a join clause that does not already have one."
  [query        :- ::lib.schema/query
   stage-number :- :int
   a-join       :- JoinWithOptionalAlias]
  (let [stage       (lib.util/query-stage query stage-number)
        home-cols   (lib.metadata.calculation/visible-columns query stage-number stage)
        cond-fields (mbql.u.match/match (:conditions a-join) :field)
        home-col    (select-home-column home-cols cond-fields)
        join-alias  (-> (calculate-join-alias query a-join home-col)
                        (generate-unique-name (map :alias (:joins stage))))
        home-refs   (mapv lib.ref/ref home-cols)
        join-refs   (mapv lib.ref/ref
                          (lib.metadata.calculation/metadata
                           (lib.query/query-with-stages query (:stages a-join))))]
    (-> a-join
        (update :conditions
                (fn [conditions]
                  (mapv #(add-alias-to-condition query % join-alias home-refs join-refs)
                        conditions)))
        (with-join-alias join-alias))))

(mu/defn join :- ::lib.schema/query
  "Add a join clause to a `query`."
  ([query a-join]
   (join query -1 a-join))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    a-join       :- PartialJoin]
   (let [a-join (if (contains? a-join :alias)
                  ;; if the join clause comes with an alias, keep it and assume that the
                  ;; condition fields have the right join-aliases too
                  a-join
                  (add-default-alias query stage-number a-join))]
     (lib.util/update-query-stage query stage-number update :joins (fn [joins]
                                                                     (conj (vec joins) a-join))))))

(mu/defn joins :- [:maybe ::lib.schema.join/joins]
  "Get all joins in a specific `stage` of a `query`. If `stage` is unspecified, returns joins in the final stage of the
  query."
  ([query]
   (joins query -1))
  ([query        :- ::lib.schema/query
    stage-number :- :int]
   (not-empty (get (lib.util/query-stage query stage-number) :joins))))

(mu/defn implicit-join-name :- ::lib.schema.common/non-blank-string
  "Name for an implicit join against `table-name` via an FK field, e.g.

    CATEGORIES__via__CATEGORY_ID

  You should make sure this gets ran thru a unique-name fn."
  [table-name           :- ::lib.schema.common/non-blank-string
   source-field-id-name :- ::lib.schema.common/non-blank-string]
  (lib.util/format "%s__via__%s" table-name source-field-id-name))

(mu/defn join-conditions :- ::lib.schema.join/conditions
  "Get all join conditions for the given join"
  [j :- ::lib.schema.join/join]
  (:conditions j))

(mu/defn join-fields :- [:maybe ::lib.schema/fields]
  "Get all join conditions for the given join"
  [j :- ::lib.schema.join/join]
  (:fields j))

(mu/defn join-strategy :- ::lib.schema.join/strategy
  "Get the raw keyword strategy (type) of a given join, e.g. `:left-join` or `:right-join`. This is either the value
  of the optional `:strategy` key or the default, `:left-join`, if `:strategy` is not specified."
  [a-join :- ::lib.schema.join/join]
  (get a-join :strategy :left-join))

(mu/defn with-join-strategy :- PartialJoin
  "Return a copy of `a-join` with its `:strategy` set to `strategy`."
  [a-join   :- PartialJoin
   strategy :- ::lib.schema.join/strategy]
  (assoc a-join :strategy strategy))

(mu/defn available-join-strategies :- [:sequential ::lib.schema.join/strategy]
  "Get available join strategies for the current Database (based on the Database's
  supported [[metabase.driver/driver-features]]) as raw keywords like `:left-join`."
  ([query]
   (available-join-strategies query -1))

  ;; stage number is not currently used, but it is taken as a parameter for consistency with the rest of MLv2
  ([query         :- ::lib.schema/query
    _stage-number :- :int]
   (let [database (lib.metadata/database query)
         features (:features database)]
     (filterv (partial contains? features)
              [:left-join
               :right-join
               :inner-join
               :full-join]))))

;;; Building join conditions:
;;;
;;; The QB GUI needs to build a join condition before the join itself is attached to the query. There are three parts
;;; to a join condition. Suppose we're building a query like
;;;
;;;    SELECT * FROM order JOIN user ON order.user_id = user.id
;;;
;;; The condition is
;;;
;;;    order.user_id  =  user.id
;;;    ^^^^^^^^^^^^^  ^  ^^^^^^^
;;;          1        2     3
;;;
;;; and the three parts are:
;;;
;;; 1. LHS/source column: the column in the left-hand side of the condition, e.g. the `order.user_id` in the example
;;;    above. Either comes from the source Table, or a previous stage of the query, or a previously-joined
;;;    Table/Model/Saved Question. `order.user_id` presumably is an FK to `user.id`, and while this is typical, is not
;;;    required.
;;;
;;; 2. The operator: `=` in the example above. Corresponds to an `:=` MBQL clause. `=` is selected by default.
;;;
;;; 3. RHS/destination/target column: the column in the right-hand side of the condition e.g. `user.id` in the example
;;;    above. `user.id` is a column in the Table/Model/Saved Question we are joining against.
;;;
;;; The Query Builder allows selecting any of these three parts in any order. The functions below return possible
;;; options for each respective part. At the time of this writing, selecting one does not filter out incompatible
;;; options for the other parts, but hopefully we can implement this in the future -- see #31174

(mu/defn ^:private sort-join-condition-columns :- [:sequential lib.metadata/ColumnMetadata]
  "Sort potential join condition columns as returned by [[join-condition-lhs-columns]]
  or [[join-condition-rhs-columns]]. PK columns are returned first, followed by FK columns, followed by other columns.
  Otherwise original order is maintained."
  [columns :- [:sequential lib.metadata/ColumnMetadata]]
  (let [{:keys [pk fk other]} (group-by (fn [column]
                                          (cond
                                            (lib.types.isa/primary-key? column) :pk
                                            (lib.types.isa/foreign-key? column) :fk
                                            :else                               :other))
                                        columns)]
    (concat pk fk other)))

(mu/defn join-condition-lhs-columns :- [:sequential lib.metadata/ColumnMetadata]
  "Get a sequence of columns that can be used as the left-hand-side (source column) in a join condition. This column
  is the one that comes from the source Table/Card/previous stage of the query or a previous join.

  If the right-hand-side column has already been chosen (they can be chosen in any order in the Query Builder UI),
  pass in the chosen RHS column. In the future, this may be used to restrict results to compatible columns. (See #31174)

  Results will be returned in a 'somewhat smart' order with PKs and FKs returned before other columns.

  Unlike most other things that return columns, implicitly-joinable columns ARE NOT returned here."
  ([query rhs-column-or-nil]
   (join-condition-lhs-columns query -1 rhs-column-or-nil))

  ([query              :- ::lib.schema/query
    stage-number       :- :int
    ;; not yet used, hopefully we will use in the future when present for filtering incompatible columns out.
    _rhs-column-or-nil :- [:maybe lib.metadata/ColumnMetadata]]
   (sort-join-condition-columns
    (lib.metadata.calculation/visible-columns query
                                              stage-number
                                              (lib.util/query-stage query stage-number)
                                              {:include-implicitly-joinable? false}))))

(mu/defn join-condition-rhs-columns :- [:sequential lib.metadata/ColumnMetadata]
  "Get a sequence of columns that can be used as the right-hand-side (target column) in a join condition. This column
  is the one that belongs to the thing being joined, `joinable`, which can be something like a
  Table ([[metabase.lib.metadata/TableMetadata]]), Saved Question/Model ([[metabase.lib.metadata/CardMetadata]]),
  another query, etc. -- anything you can pass to [[join-clause]].

  If the lhs-hand-side column has already been chosen (they can be chosen in any order in the Query Builder UI),
  pass in the chosen LHS column. In the future, this may be used to restrict results to compatible columns. (See #31174)

  Results will be returned in a 'somewhat smart' order with PKs and FKs returned before other columns."
  ([query joinable lhs-column-or-nil]
   (join-condition-rhs-columns query -1 joinable lhs-column-or-nil))

  ([query              :- ::lib.schema/query
    stage-number       :- :int
    joinable
    ;; not yet used, hopefully we will use in the future when present for filtering incompatible columns out.
    _lhs-column-or-nil :- [:maybe lib.metadata/ColumnMetadata]]
   ;; I was on the fence about whether these should get `:lib/source :source/joins` or not -- it seems like based on
   ;; the QB UI they shouldn't. See screenshots in #31174
   (sort-join-condition-columns
    (lib.metadata.calculation/visible-columns query stage-number joinable {:include-implicitly-joinable? false}))))

;;; TODO -- definitions duplicated with code in [[metabase.lib.filter]]

(defn- equals-join-condition-operator-definition []
  {:lib/type :mbql.filter/operator, :short :=, :display-name  (i18n/tru "Equal to")})

(defn- join-condition-operator-definitions []
  [(equals-join-condition-operator-definition)
   {:lib/type :mbql.filter/operator, :short :>, :display-name  (i18n/tru "Greater than")}
   {:lib/type :mbql.filter/operator, :short :<, :display-name  (i18n/tru "Less than")}
   {:lib/type :mbql.filter/operator, :short :>=, :display-name (i18n/tru "Greater than or equal to")}
   {:lib/type :mbql.filter/operator, :short :<=, :display-name (i18n/tru "Less than or equal to")}
   {:lib/type :mbql.filter/operator, :short :!=, :display-name (i18n/tru "Not equal to")}])

(mu/defn join-condition-operators :- [:sequential ::lib.schema.filter/operator]
  "Return a sequence of valid filter clause operators that can be used to build a join condition. In the Query Builder
  UI, this can be chosen at any point before or after choosing the LHS and RHS. Invalid options are not currently
  filtered out based on values of the LHS or RHS, but in the future we can add this -- see #31174."
  ([query lhs-column-or-nil rhs-column-or-nil]
   (join-condition-operators query -1 lhs-column-or-nil rhs-column-or-nil))

  ([_query             :- ::lib.schema/query
    _stage-number      :- :int
    ;; not yet used, hopefully we will use in the future when present for filtering incompatible options out.
    _lhs-column-or-nil :- [:maybe lib.metadata/ColumnMetadata]
    _rhs-column-or-nil :- [:maybe lib.metadata/ColumnMetadata]]
   ;; currently hardcoded to these six operators regardless of LHS and RHS.
   (join-condition-operator-definitions)))

(mu/defn ^:private pk-column :- [:maybe lib.metadata/ColumnMetadata]
  "Given something `x` (e.g. a Table metadata) find the PK column."
  [query        :- ::lib.schema/query
   stage-number :- :int
   x]
  (m/find-first lib.types.isa/primary-key?
                (lib.metadata.calculation/visible-columns query stage-number x)))

(mu/defn ^:private fk-column-for :- [:maybe lib.metadata/ColumnMetadata]
  "Given a query stage find an FK column that points to the PK `pk-col`."
  [query        :- ::lib.schema/query
   stage-number :- :int
   pk-col       :- [:maybe lib.metadata/ColumnMetadata]]
  (when-let [pk-id (:id pk-col)]
    (m/find-first (fn [{:keys [fk-target-field-id], :as col}]
                    (and (lib.types.isa/foreign-key? col)
                         (= fk-target-field-id pk-id)))
                  (lib.metadata.calculation/visible-columns query stage-number (lib.util/query-stage query stage-number)))))

(mu/defn suggested-join-condition :- [:maybe ::lib.schema.expression/boolean] ; i.e., a filter clause
  "Return a suggested default join condition when constructing a join against `joinable`, e.g. a Table, Saved
  Question, or another query. A suggested condition will be returned if the query stage has a foreign key to the
  primary key of the thing we're joining (see #31175 for more info); otherwise this will return `nil` if no default
  condition is suggested."
  ([query joinable]
   (suggested-join-condition query -1 joinable))

  ([query         :- ::lib.schema/query
    stage-number  :- :int
    joinable]
   (when-let [pk-col (pk-column query stage-number joinable)]
     (when-let [fk-col (fk-column-for query stage-number pk-col)]
       (lib.common/->op-arg
        (lib.filter/filter-clause (equals-join-condition-operator-definition) fk-col pk-col))))))

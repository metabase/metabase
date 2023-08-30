(ns metabase.lib.join
  "Functions related to manipulating EXPLICIT joins in MBQL."
  (:require
   [clojure.string :as str]
   [inflections.core :as inflections]
   [medley.core :as m]
   [metabase.lib.card :as lib.card]
   [metabase.lib.common :as lib.common]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.filter.operator :as lib.filter.operator]
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
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.util.match :as mbql.u.match]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.log :as log]
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

(def ^:private Field
  [:or
   lib.metadata/ColumnMetadata
   [:ref :mbql.clause/field]])

(def ^:private FieldOrPartialJoin
  [:or Field PartialJoin])

(defn- join? [x]
  (= (lib.dispatch/dispatch-value x) :mbql/join))

(def ^:private Joinable
  [:or lib.metadata/TableMetadata lib.metadata/CardMetadata])

(def ^:private JoinOrJoinable
  [:or
   [:ref ::lib.schema.join/join]
   Joinable])

(mu/defn current-join-alias :- [:maybe ::lib.schema.common/non-blank-string]
  "Get the current join alias associated with something, if it has one."
  [field-or-join :- [:maybe FieldOrPartialJoin]]
  (case (lib.dispatch/dispatch-value field-or-join)
    :dispatch-type/nil nil
    :field             (:join-alias (lib.options/options field-or-join))
    :metadata/column   (::join-alias field-or-join)
    :mbql/join         (:alias field-or-join)))

(declare with-join-alias)

(defn- with-join-alias-update-join-fields
  "Impl for [[with-join-alias]] for a join: recursively update the `:join-alias` for the `:field` refs inside `:fields`
  as needed."
  [join new-alias]
  (cond-> join
    (:fields join) (update :fields (fn [fields]
                                     (if-not (sequential? fields)
                                       fields
                                       (mapv (fn [field-ref]
                                               (with-join-alias field-ref new-alias))
                                             fields))))))

(mu/defn ^:private standard-join-condition? :- :boolean
  "Whether this join condition is a binary condition with two `:field` references (a LHS and a RHS), as you'd produce
  in the frontend using functions like [[join-condition-operators]], [[join-condition-lhs-columns]],
  and [[join-condition-rhs-columns]]."
  [condition  :- [:maybe ::lib.schema.expression/boolean]]
  (when condition
    (mbql.u.match/match-one condition
      [(_operator :guard keyword?)
       _opts
       [:field _lhs-opts _lhs-id-or-name]
       [:field _rhs-opts _rhs-id-or-name]]
      true
      _
      false)))

(defn- standard-join-condition-lhs
  "If `condition` is a [[standard-join-condition?]], return the LHS."
  [condition]
  (when (standard-join-condition? condition)
    (let [[_operator _opts lhs _rhs] condition]
      lhs)))

(defn- standard-join-condition-rhs
  "If `condition` is a [[standard-join-condition?]], return the RHS."
  [condition]
  (when (standard-join-condition? condition)
    (let [[_operator _opts _lhs rhs] condition]
      rhs)))

(defn- standard-join-condition-update-rhs
  "If `condition` is a [[standard-join-condition?]], update the RHS with `f` like

    (apply f rhs args)"
  [condition f & args]
  (if-not (standard-join-condition? condition)
    condition
    (let [[operator opts lhs rhs] condition]
      [operator opts lhs (apply f rhs args)])))

(mu/defn ^:private with-join-alias-update-join-conditions :- PartialJoin
  "Impl for [[with-join-alias]] for a join: recursively update the `:join-alias` for inside the `:conditions` of the
  join.

  If `old-alias` is specified, uses [[metabase.mbql.util.match]] to update all the `:field` references using the old
  alias.

  If `old-alias` is `nil`, updates the RHS of all 'standard' conditions (binary filter clauses with two `:field` refs as
  args, e.g. the kind you'd get if you were using [[join-condition-operators]] and the like to create them). This
  currently doesn't handle more complex filter clauses that were created without the 'normal' MLv2 functions used by
  the frontend; we can add this in the future if we need it."
  [join      :- PartialJoin
   old-alias :- [:maybe ::lib.schema.common/non-blank-string]
   new-alias :- [:maybe ::lib.schema.common/non-blank-string]]
  (cond
    (empty? (:conditions join))
    join

    ;; if we've specified `old-alias`, then update ANY `:field` clause using it to `new-alias` instead.
    old-alias
    (mbql.u.match/replace-in join [:conditions]
      [:field {:join-alias old-alias} _id-or-name]
      (with-join-alias &match new-alias))

    ;; otherwise if `old-alias` is `nil`, then add (or remove!) `new-alias` to the RHS of any binary
    ;; filter clauses that don't already have a `:join-alias`.
    :else
    (update join :conditions (fn [conditions]
                               (mapv (fn [condition]
                                       (standard-join-condition-update-rhs condition with-join-alias new-alias))
                                     conditions)))))

(defn- with-join-alias-update-join
  "Impl for [[with-join-alias]] for a join."
  [join new-alias]
  (let [old-alias (current-join-alias join)]
    (-> join
        (u/assoc-dissoc :alias new-alias)
        (with-join-alias-update-join-fields new-alias)
        (with-join-alias-update-join-conditions old-alias new-alias))))

(mu/defn with-join-alias :- FieldOrPartialJoin
  "Add OR REMOVE a specific `join-alias` to `field-or-join`, which is either a `:field`/Field metadata, or a join map.
  Does not recursively update other references (yet; we can add this in the future)."
  {:style/indent [:form]}
  [field-or-join :- FieldOrPartialJoin
   join-alias    :- [:maybe ::lib.schema.common/non-blank-string]]
  (case (lib.dispatch/dispatch-value field-or-join)
    :field
    (lib.options/update-options field-or-join u/assoc-dissoc :join-alias join-alias)

    :metadata/column
    (u/assoc-dissoc field-or-join ::join-alias join-alias)

    :mbql/join
    (with-join-alias-update-join field-or-join join-alias)

    ;; this should not happen (and cannot happen in CLJ land)
    ;; but it does seem to happen in JS land with broken MLv1 queries
    (do (log/error "with-join-value should not be called with" (pr-str field-or-join))
        field-or-join)))

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
     (lib.card/fallback-display-name source-card))
   (i18n/tru "Native Query")))

(defmethod lib.metadata.calculation/display-info-method :mbql/join
  [query stage-number join]
  (let [display-name (lib.metadata.calculation/display-name query stage-number join)]
    {:name (or (:alias join) display-name), :display-name display-name}))

(defmethod lib.metadata.calculation/metadata-method :mbql/join
  [_query _stage-number _query]
  ;; not i18n'ed because this shouldn't be developer-facing.
  (throw (ex-info "You can't calculate a metadata map for a join! Use lib.metadata.calculation/returned-columns-method instead."
                  {})))

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

(defmethod lib.metadata.calculation/display-name-method :option/join.strategy
  [_query _stage-number {:keys [strategy]} _style]
  (case strategy
    :left-join  (i18n/tru "Left outer join")
    :right-join (i18n/tru "Right outer join")
    :inner-join (i18n/tru "Inner join")
    :full-join  (i18n/tru "Full outer join")))

(defmethod lib.metadata.calculation/display-info-method :option/join.strategy
  [query stage-number {:keys [strategy default], :as option}]
  (cond-> {:short-name   (u/qualified-name strategy)
           :display-name (lib.metadata.calculation/display-name query stage-number option)}
    default (assoc :default true)))

(mu/defn joined-field-desired-alias :- ::lib.schema.common/non-blank-string
  "Desired alias for a Field that comes from a join, e.g.

    MyJoin__my_field

  You should pass the results thru a unique name function."
  [join-alias :- ::lib.schema.common/non-blank-string
   field-name :- ::lib.schema.common/non-blank-string]
  (lib.util/format "%s__%s" join-alias field-name))

(mu/defn ^:private add-source-and-desired-aliases :- :map
  [join           :- [:map
                      [:alias
                       {:error/message "Join must have an alias to determine column aliases!"}
                       ::lib.schema.common/non-blank-string]]
   unique-name-fn :- fn?
   col            :- :map]
  (assoc col
         :lib/source-column-alias  ((some-fn :lib/source-column-alias :name) col)
         :lib/desired-column-alias (unique-name-fn (joined-field-desired-alias
                                                    (:alias join)
                                                    ((some-fn :lib/source-column-alias :name) col)))))

(defmethod lib.metadata.calculation/returned-columns-method :mbql/join
  [query
   stage-number
   {:keys [fields stages], join-alias :alias, :or {fields :none}, :as join}
   {:keys [unique-name-fn], :as options}]
  (when-not (= fields :none)
    (let [ensure-previous-stages-have-metadata (resolve 'metabase.lib.stage/ensure-previous-stages-have-metadata)
          join-query (cond-> (assoc query :stages stages)
                       ensure-previous-stages-have-metadata
                       (ensure-previous-stages-have-metadata -1))
          field-metadatas (if (= fields :all)
                            (lib.metadata.calculation/returned-columns join-query -1 (peek stages) options)
                            (for [field-ref fields
                                  :let [join-field (lib.options/update-options field-ref dissoc :join-alias)]]
                              (lib.metadata.calculation/metadata join-query -1 join-field)))]
      (mapv (fn [field-metadata]
              (->> (column-from-join-fields query stage-number field-metadata join-alias)
                   (add-source-and-desired-aliases join unique-name-fn)))
            field-metadatas))))

(defmethod lib.metadata.calculation/visible-columns-method :mbql/join
  [query stage-number join options]
  (lib.metadata.calculation/returned-columns query stage-number (assoc join :fields :all) options))

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

(mu/defn all-joins-expected-columns :- lib.metadata.calculation/ColumnsWithUniqueAliases
  "Convenience for calling [[lib.metadata.calculation/returned-columns-method]] on all the joins in a query stage."
  [query        :- ::lib.schema/query
   stage-number :- :int
   options      :- lib.metadata.calculation/ReturnedColumnsOptions]
  (into []
        (mapcat (fn [join]
                  (lib.metadata.calculation/returned-columns query stage-number join options)))
        (:joins (lib.util/query-stage query stage-number))))

(defmulti ^:private join-clause-method
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

(defmethod join-clause-method :metadata/card
  [card]
  (-> {:lib/type :mbql/join
       :stages [{:source-card (:id card)
                 :lib/type :mbql.stage/mbql}]}
      lib.options/ensure-uuid))

(declare with-join-fields)

(defmethod join-clause-method :metadata/table
  [{::keys [join-alias join-fields], :as table-metadata}]
  (cond-> (join-clause-method {:lib/type     :mbql.stage/mbql
                               :lib/options  {:lib/uuid (str (random-uuid))}
                               :source-table (:id table-metadata)})
    join-alias  (with-join-alias join-alias)
    join-fields (with-join-fields join-fields)))

(defn- with-join-conditions-add-alias-to-rhses
  "Add `join-alias` to the RHS of all [[standard-join-condition?]] `conditions` that don't already have a `:join-alias`.
  If an RHS already has a `:join-alias`, don't second guess what was already explicitly specified."
  [conditions join-alias]
  (if-not join-alias
    conditions
    (mapv (fn [condition]
            (or (when-let [rhs (standard-join-condition-rhs condition)]
                  (when-not (current-join-alias rhs)
                    (standard-join-condition-update-rhs condition with-join-alias join-alias)))
                condition))
          conditions)))

(mu/defn with-join-conditions :- PartialJoin
  "Update the `:conditions` (filters) for a Join clause."
  {:style/indent [:form]}
  [a-join     :- PartialJoin
   conditions :- [:maybe [:sequential [:or ::lib.schema.expression/boolean ::lib.schema.common/external-op]]]]
  (let [conditions (-> (mapv lib.common/->op-arg conditions)
                       (with-join-conditions-add-alias-to-rhses (current-join-alias a-join)))]
    (u/assoc-dissoc a-join :conditions (not-empty conditions))))

(mu/defn join-clause :- PartialJoin
  "Create an MBQL join map from something that can conceptually be joined against. A `Table`? An MBQL or native query? A
  Saved Question? You should be able to join anything, and this should return a sensible MBQL join map."
  ([joinable]
   (-> (join-clause-method joinable)
       (u/assoc-default :fields :all)))

  ([joinable conditions]
   (-> (join-clause joinable)
       (with-join-conditions conditions))))

(mu/defn with-join-fields :- PartialJoin
  "Update a join (or a function that will return a join) to include `:fields`, either `:all`, `:none`, or a sequence of
  references."
  [joinable :- PartialJoin
   fields   :- [:maybe [:or [:enum :all :none] [:sequential some?]]]]
  (let [fields (cond
                 (keyword? fields) fields
                 (= fields [])     :none
                 :else             (not-empty
                                    (into []
                                          (comp (map lib.ref/ref)
                                                (if-let [current-alias (current-join-alias joinable)]
                                                  (map #(with-join-alias % current-alias))
                                                  identity))
                                          fields)))]
    (u/assoc-dissoc joinable :fields fields)))

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

(defn- add-alias-to-join-refs [form join-alias join-cols]
  (mbql.u.match/replace form
    (field :guard (fn [field-clause]
                    (and (lib.util/field-clause? field-clause)
                         (boolean (lib.equality/closest-matching-metadata field-clause join-cols)))))
    (with-join-alias field join-alias)))

(defn- add-alias-to-condition
  [condition join-alias home-cols join-cols]
  (let [condition (add-alias-to-join-refs condition join-alias join-cols)]
    ;; Sometimes conditions have field references which cannot be unambigously
    ;; assigned to one of the sides. The following code tries to deal with
    ;; these cases, but only for conditions that look like the ones generated
    ;; generated by the FE. These have the form home-field op join-field,
    ;; so we break ties by looking at the poisition of the field reference.
    (mbql.u.match/replace condition
      [op op-opts (lhs :guard lib.util/field-clause?) (rhs :guard lib.util/field-clause?)]
      (let [lhs-alias (current-join-alias lhs)
            rhs-alias (current-join-alias rhs)]
        (cond
          ;; no sides obviously belong to joined
          (not (or lhs-alias rhs-alias))
          (if (lib.equality/closest-matching-metadata rhs home-cols)
            [op op-opts (with-join-alias lhs join-alias) rhs]
            [op op-opts lhs (with-join-alias rhs join-alias)])

          ;; both sides seem to belong to joined assuming this resulted from
          ;; overly fuzzy matching, we remove the join alias from the LHS
          ;; unless the RHS seems to belong to home too while the LHS doesn't
          (and (= lhs-alias join-alias) (= rhs-alias join-alias))
          (let [bare-lhs (lib.options/update-options lhs dissoc :join-alias)
                bare-rhs (lib.options/update-options rhs dissoc :join-alias)]
            (if (and (nil? (lib.equality/closest-matching-metadata bare-lhs home-cols))
                     (lib.equality/index-of-closest-matching-metadata bare-rhs home-cols))
              [op op-opts lhs bare-rhs]
              [op op-opts bare-lhs rhs]))

          ;; we leave alone the condition otherwise
          :else &match)))))

(defn- generate-unique-name [base-name taken-names]
  (let [generator (lib.util/unique-name-generator)]
    (run! generator taken-names)
    (generator base-name)))

(mu/defn add-default-alias :- ::lib.schema.join/join
  "Add a default generated `:alias` to a join clause that does not already have one."
  [query        :- ::lib.schema/query
   stage-number :- :int
   a-join       :- JoinWithOptionalAlias]
  (if (contains? a-join :alias)
    ;; if the join clause comes with an alias, keep it and assume that the
    ;; condition fields have the right join-aliases too
    a-join
    (let [stage       (lib.util/query-stage query stage-number)
          home-cols   (lib.metadata.calculation/visible-columns query stage-number stage)
          cond-fields (mbql.u.match/match (:conditions a-join) :field)
          home-col    (select-home-column home-cols cond-fields)
          join-alias  (-> (calculate-join-alias query a-join home-col)
                          (generate-unique-name (keep :alias (:joins stage))))
          join-cols   (lib.metadata.calculation/returned-columns
                       (lib.query/query-with-stages query (:stages a-join)))]
      (-> a-join
          (update :conditions
                  (fn [conditions]
                    (mapv #(add-alias-to-condition % join-alias home-cols join-cols)
                          conditions)))
          (with-join-alias join-alias)))))

(declare join-conditions
         joined-thing
         suggested-join-condition)

(mu/defn join :- ::lib.schema/query
  "Add a join clause to a `query`."
  ([query a-join]
   (join query -1 a-join))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    a-join       :- [:or PartialJoin Joinable]]
   (let [a-join              (join-clause a-join)
         suggested-condition (when (empty? (join-conditions a-join))
                               (suggested-join-condition query stage-number (joined-thing query a-join)))
         a-join              (cond-> a-join
                               suggested-condition (with-join-conditions [suggested-condition]))
         a-join              (add-default-alias query stage-number a-join)]
     (lib.util/update-query-stage query stage-number update :joins (fn [existing-joins]
                                                                     (conj (vec existing-joins) a-join))))))

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

(mu/defn join-conditions :- [:maybe ::lib.schema.join/conditions]
  "Get all join conditions for the given join"
  [a-join :- PartialJoin]
  (:conditions a-join))

(mu/defn join-fields :- [:maybe ::lib.schema.join/fields]
  "Get all join conditions for the given join"
  [a-join :- PartialJoin]
  (:fields a-join))

(defn- raw-join-strategy->strategy-option [raw-strategy]
  (merge
   {:lib/type :option/join.strategy
    :strategy raw-strategy}
   (when (= raw-strategy :left-join)
     {:default true})))

(mu/defn raw-join-strategy :- ::lib.schema.join/strategy
  "Get the raw keyword strategy (type) of a given join, e.g. `:left-join` or `:right-join`. This is either the value
  of the optional `:strategy` key or the default, `:left-join`, if `:strategy` is not specified."
  [a-join :- PartialJoin]
  (get a-join :strategy :left-join))

(mu/defn join-strategy :- ::lib.schema.join/strategy.option
  "Get the strategy (type) of a given join, as a `:option/join.strategy` map. If `:stategy` is unspecified, returns
  the default, left join."
  [a-join :- PartialJoin]
  (raw-join-strategy->strategy-option (raw-join-strategy a-join)))

(mu/defn with-join-strategy :- PartialJoin
  "Return a copy of `a-join` with its `:strategy` set to `strategy`."
  [a-join   :- PartialJoin
   strategy :- [:or ::lib.schema.join/strategy ::lib.schema.join/strategy.option]]
  ;; unwrap the strategy to a raw keyword if needed.
  (assoc a-join :strategy (cond-> strategy
                            (= (lib.dispatch/dispatch-value strategy) :option/join.strategy)
                            :strategy)))

(mu/defn available-join-strategies :- [:sequential ::lib.schema.join/strategy.option]
  "Get available join strategies for the current Database (based on the Database's
  supported [[metabase.driver/driver-features]]) as raw keywords like `:left-join`."
  ([query]
   (available-join-strategies query -1))

  ;; stage number is not currently used, but it is taken as a parameter for consistency with the rest of MLv2
  ([query         :- ::lib.schema/query
    _stage-number :- :int]
   (let [database (lib.metadata/database query)
         features (:features database)]
     (into []
           (comp (filter (partial contains? features))
                 (map raw-join-strategy->strategy-option))
           [:left-join :right-join :inner-join :full-join]))))

(mu/defn joined-thing :- [:maybe Joinable]
  "Return metadata about the origin of `a-join` using `metadata-providerable` as the source of information."
  [metadata-providerable :- lib.metadata/MetadataProviderable
   a-join                :- PartialJoin]
  (let [origin (-> a-join :stages first)]
    (cond
      (:source-card origin)  (lib.metadata/card metadata-providerable (:source-card origin))
      (:source-table origin) (lib.metadata/table metadata-providerable (:source-table origin)))))

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

(defn- mark-selected-column [existing-column-or-nil columns]
  (if-not existing-column-or-nil
    columns
    (mapv (fn [column]
            (if (:selected? column)
              (lib.temporal-bucket/with-temporal-bucket
                column
                (lib.temporal-bucket/temporal-bucket existing-column-or-nil))
              column))
          (lib.equality/mark-selected-columns columns [existing-column-or-nil]))))

(mu/defn join-condition-lhs-columns :- [:sequential lib.metadata/ColumnMetadata]
  "Get a sequence of columns that can be used as the left-hand-side (source column) in a join condition. This column
  is the one that comes from the source Table/Card/previous stage of the query or a previous join.

  If you are changing the LHS of a condition for an existing join, pass in that existing join as `join-or-joinable` so
  we can filter out the columns added by it (it doesn't make sense to present the columns added by a join as options
  for its own LHS) or added by later joins (joins can only depend on things from previous joins). Otherwise you can
  either pass in `nil` or the [[Joinable]] (Table or Card metadata) we're joining against when building a new
  join. (Things other than joins are ignored, but this argument is flexible for consistency with the signature
  of [[join-condition-rhs-columns]].) See #32005 for more info.

  If the left-hand-side column has already been chosen and we're UPDATING it, pass in `lhs-column-or-nil` so we can
  mark the current column as `:selected` in the metadata/display info.

  If the right-hand-side column has already been chosen (they can be chosen in any order in the Query Builder UI),
  pass in the chosen RHS column. In the future, this may be used to restrict results to compatible columns. (See #31174)

  Results will be returned in a 'somewhat smart' order with PKs and FKs returned before other columns.

  Unlike most other things that return columns, implicitly-joinable columns ARE NOT returned here."
  ([query joinable lhs-column-or-nil rhs-column-or-nil]
   (join-condition-lhs-columns query -1 joinable lhs-column-or-nil rhs-column-or-nil))

  ([query              :- ::lib.schema/query
    stage-number       :- :int
    join-or-joinable   :- [:maybe JoinOrJoinable]
    lhs-column-or-nil  :- [:maybe Field]
    ;; not yet used, hopefully we will use in the future when present for filtering incompatible columns out.
    _rhs-column-or-nil :- [:maybe Field]]
   ;; calculate all the visible columns including the existing join; then filter out any columns that come from the
   ;; existing join and any subsequent joins. The reason for doing things this way rather than removing the joins
   ;; before calculating visible columns is that we don't want to either create possibly-invalid queries, or have to
   ;; rely on the logic in [[metabase.lib.remove-replace/remove-join]] which would cause circular references; this is
   ;; simpler as well.
   ;;
   ;; e.g. if we have joins [J1 J2 J3 J4] and current join = J2, then we want to ignore the visible columns from J2,
   ;; J3, and J4.
   (let [existing-join-alias    (when (join? join-or-joinable)
                                  (current-join-alias join-or-joinable))
         join-aliases-to-ignore (into #{}
                                      (comp (map current-join-alias)
                                            (drop-while #(not= % existing-join-alias)))
                                      (joins query stage-number))
         lhs-column-or-nil      (or lhs-column-or-nil
                                    (when (join? join-or-joinable)
                                      (standard-join-condition-lhs (first (join-conditions join-or-joinable)))))]
     (->> (lib.metadata.calculation/visible-columns query stage-number
                                                    (lib.util/query-stage query stage-number)
                                                    {:include-implicitly-joinable? false})
          (remove (fn [col]
                    (when-let [col-join-alias (current-join-alias col)]
                      (contains? join-aliases-to-ignore col-join-alias))))
          (mark-selected-column lhs-column-or-nil)
          sort-join-condition-columns))))

(mu/defn join-condition-rhs-columns :- [:sequential lib.metadata/ColumnMetadata]
  "Get a sequence of columns that can be used as the right-hand-side (target column) in a join condition. This column
  is the one that belongs to the thing being joined, `join-or-joinable`, which can be something like a
  Table ([[metabase.lib.metadata/TableMetadata]]), Saved Question/Model ([[metabase.lib.metadata/CardMetadata]]),
  another query, etc. -- anything you can pass to [[join-clause]]. You can also pass in an existing join.

  If the left-hand-side column has already been chosen (they can be chosen in any order in the Query Builder UI),
  pass in the chosen LHS column. In the future, this may be used to restrict results to compatible columns. (See #31174)

  If the right-hand-side column has already been chosen and we're UPDATING it, pass in `rhs-column-or-nil` so we can
  mark the current column as `:selected` in the metadata/display info.

  Results will be returned in a 'somewhat smart' order with PKs and FKs returned before other columns."
  ([query joinable lhs-column-or-nil rhs-column-or-nil]
   (join-condition-rhs-columns query -1 joinable lhs-column-or-nil rhs-column-or-nil))

  ([query              :- ::lib.schema/query
    stage-number       :- :int
    join-or-joinable   :- JoinOrJoinable
    ;; not yet used, hopefully we will use in the future when present for filtering incompatible columns out.
    _lhs-column-or-nil :- [:maybe Field]
    rhs-column-or-nil  :- [:maybe Field]]
   ;; I was on the fence about whether these should get `:lib/source :source/joins` or not -- it seems like based on
   ;; the QB UI they shouldn't. See screenshots in #31174
   (let [joinable          (if (join? join-or-joinable)
                             (joined-thing query join-or-joinable)
                             join-or-joinable)
         join-alias        (when (join? join-or-joinable)
                             (current-join-alias join-or-joinable))
         rhs-column-or-nil (or rhs-column-or-nil
                               (when (join? join-or-joinable)
                                 (standard-join-condition-rhs (first (join-conditions join-or-joinable)))))]
     (->> (lib.metadata.calculation/visible-columns query stage-number joinable {:include-implicitly-joinable? false})
          (map (fn [col]
                 (cond-> (assoc col :lib/source :source/joins)
                   join-alias (with-join-alias join-alias))))
          (mark-selected-column rhs-column-or-nil)
          sort-join-condition-columns))))

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
   lib.filter.operator/join-operators))

(mu/defn ^:private pk-column :- [:maybe lib.metadata/ColumnMetadata]
  "Given something `x` (e.g. a Table metadata) find the PK column."
  [query        :- ::lib.schema/query
   stage-number :- :int
   x]
  (m/find-first lib.types.isa/primary-key?
                (lib.metadata.calculation/visible-columns query stage-number x)))

(mu/defn ^:private fk-column-for-pk-in :- [:maybe lib.metadata/ColumnMetadata]
  [pk-col          :- [:maybe lib.metadata/ColumnMetadata]
   visible-columns :- [:maybe [:sequential lib.metadata/ColumnMetadata]]]
  (when-let [pk-id (:id pk-col)]
    (m/find-first (fn [{:keys [fk-target-field-id], :as col}]
                    (and (lib.types.isa/foreign-key? col)
                         (= fk-target-field-id pk-id)))
                  visible-columns)))

(mu/defn ^:private fk-column-for :- [:maybe lib.metadata/ColumnMetadata]
  "Given a query stage find an FK column that points to the PK `pk-col`."
  [query        :- ::lib.schema/query
   stage-number :- :int
   pk-col       :- [:maybe lib.metadata/ColumnMetadata]]
  (when pk-col
    (let [visible-columns (lib.metadata.calculation/visible-columns query stage-number (lib.util/query-stage query stage-number))]
      (fk-column-for-pk-in pk-col visible-columns))))

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
   (letfn [(filter-clause [x y]
             (lib.filter/filter-clause (lib.filter.operator/operator-def :=) x y))]
     (or (when-let [pk-col (pk-column query stage-number joinable)]
           (when-let [fk-col (fk-column-for query stage-number pk-col)]
             (filter-clause fk-col pk-col)))
         (when-let [pk-col (pk-column query stage-number (lib.util/query-stage query stage-number))]
           (when-let [fk-col (fk-column-for-pk-in pk-col (lib.metadata.calculation/visible-columns query stage-number joinable))]
             (filter-clause pk-col fk-col)))))))

(defn- add-join-alias-to-joinable-columns [cols a-join]
  (let [join-alias     (current-join-alias a-join)
        unique-name-fn (lib.util/unique-name-generator)]
    (mapv (fn [col]
            (as-> col col
              (with-join-alias col join-alias)
              (add-source-and-desired-aliases a-join unique-name-fn col)))
          cols)))

(defn- mark-selected-joinable-columns
  "Mark the column metadatas in `cols` as `:selected` if they appear in `a-join`'s `:fields`."
  [cols a-join]
  (let [j-fields (join-fields a-join)]
    (case j-fields
      :all        (mapv #(assoc % :selected? true)
                        cols)
      (:none nil) (mapv #(assoc % :selected? false)
                        cols)
      (lib.equality/mark-selected-columns cols j-fields))))

(mu/defn joinable-columns :- [:sequential lib.metadata/ColumnMetadata]
  "Return information about the fields that you can pass to [[with-join-fields]] when constructing a join against
  something [[Joinable]] (i.e., a Table or Card) or manipulating an existing join. When passing in a join, currently
  selected columns (those in the join's `:fields`) will include `:selected true` information."
  [query            :- ::lib.schema/query
   stage-number     :- :int
   join-or-joinable :- JoinOrJoinable]
  (let [a-join   (when (join? join-or-joinable)
                   join-or-joinable)
        source (if a-join
                 (joined-thing query join-or-joinable)
                 join-or-joinable)
        cols   (lib.metadata.calculation/returned-columns query stage-number source)]
    (cond-> cols
      a-join (add-join-alias-to-joinable-columns a-join)
      a-join (mark-selected-joinable-columns a-join))))

(defn- join-lhs-display-name-from-condition-lhs
  [query stage-number join-or-joinable condition-lhs-column-or-nil]
  (when-let [condition-lhs-column (or condition-lhs-column-or-nil
                                      (when (join? join-or-joinable)
                                        (standard-join-condition-lhs (first (join-conditions join-or-joinable)))))]
    (let [display-info (lib.metadata.calculation/display-info query stage-number condition-lhs-column)]
      (get-in display-info [:table :display-name]))))

(defn- first-join?
  "Whether a `join-or-joinable` is (or will be) the first join in a stage of a query.

  If a join is passed, we need to check whether it's the first join in the first stage of a source-table query or
  not.

  New joins get appended after any existing ones, so it would be safe to assume that if there are any other joins in
  the current stage, this **will not** be the first join in the stage."
  [query stage-number join-or-joinable]
  (let [existing-joins (joins query stage-number)]
    (or
     ;; if there are no existing joins, then this will be the first join regardless of what is passed in.
     (empty? existing-joins)
     ;; otherwise there ARE existing joins, so this is only the first join if it is the same thing as the first join
     ;; in `existing-joins`.
     (when (join? join-or-joinable)
       (= (:alias join-or-joinable)
          (:alias (first existing-joins)))))))

(defn- join-lhs-display-name-for-first-join-in-first-stage
  [query stage-number join-or-joinable]
  (when (and (zero? (lib.util/canonical-stage-index query stage-number)) ; first stage?
             (first-join? query stage-number join-or-joinable)           ; first join?
             (lib.util/source-table-id query))                           ; query ultimately uses source Table?
    (let [table-id (lib.util/source-table-id query)
          table    (lib.metadata/table query table-id)]
      ;; I think `:default` display name style is okay here, there shouldn't be a difference between `:default` and
      ;; `:long` for a Table anyway
      (lib.metadata.calculation/display-name query stage-number table))))

(mu/defn join-lhs-display-name :- ::lib.schema.common/non-blank-string
  "Get the display name for whatever we are joining. See #32015 and #32764 for screenshot examples.

  The rules, copied from MLv1, are as follows:

  1. If we have the LHS column for the first join condition, we should use display name for wherever it comes from. E.g.
     if the join is

     ```
     JOIN whatever ON orders.whatever_id = whatever.id
     ```

     then we should display the join like this:

    ```
    +--------+   +----------+    +-------------+    +----------+
    | Orders | + | Whatever | on | Orders      | =  | Whatever |
    |        |   |          |    | Whatever ID |    | ID       |
    +--------+   +----------+    +-------------+    +----------+
    ```

    1a. If `join-or-joinable` is a join, we can take the condition LHS column from the join itself, since a join will
        always have a condition. This should only apply to [[standard-join-condition?]] conditions.

    1b. When building a join, you can optionally pass in `condition-lhs-column-or-nil` yourself.

  2. If the condition LHS column is unknown, and this is the first join in the first stage of a query, and the query
     uses a `:source-table`, then use the display name for the source Table.

  3. Otherwise use `Previous results`.

  This function needs to be usable while we are in the process of constructing a join in the context of a given stage,
  but also needs to work for rendering existing joins. Pass a join in for existing joins, or something [[Joinable]]
  for ones we are currently building."
  ([query join-or-joinable]
   (join-lhs-display-name query join-or-joinable nil))

  ([query join-or-joinable condition-lhs-column-or-nil]
   (join-lhs-display-name query -1 join-or-joinable condition-lhs-column-or-nil))

  ([query                       :- ::lib.schema/query
    stage-number                :- :int
    join-or-joinable            :- [:maybe JoinOrJoinable]
    condition-lhs-column-or-nil :- [:maybe [:or lib.metadata/ColumnMetadata :mbql.clause/field]]]
   (or
    (join-lhs-display-name-from-condition-lhs query stage-number join-or-joinable condition-lhs-column-or-nil)
    (join-lhs-display-name-for-first-join-in-first-stage query stage-number join-or-joinable)
    (i18n/tru "Previous results"))))

(mu/defn join-condition-update-temporal-bucketing :- ::lib.schema.expression/boolean
  "Updates the provided join-condition's fields' temporal-bucketing option, returns the updated join-condition.
   Must be called on a standard join condition as per [[standard-join-condition?]].
   This will sync both the lhs and rhs fields, and the fields that support the provided option will be updated.
   Fields that do not support the provided option will be ignored."
  ([query :- ::lib.schema/query
    join-condition :- [:or ::lib.schema.expression/boolean ::lib.schema.common/external-op]
    option-or-unit :- [:maybe [:or
                               ::lib.schema.temporal-bucketing/option
                               ::lib.schema.temporal-bucketing/unit]]]
   (join-condition-update-temporal-bucketing query -1 join-condition option-or-unit))
  ([query :- ::lib.schema/query
    stage-number :- :int
    join-condition :- [:or ::lib.schema.expression/boolean ::lib.schema.common/external-op]
    option-or-unit :- [:maybe [:or
                               ::lib.schema.temporal-bucketing/option
                               ::lib.schema.temporal-bucketing/unit]]]
   (let [[_ _ lhs rhs :as join-condition] (lib.common/->op-arg join-condition)]
     (assert (standard-join-condition? join-condition)
             (i18n/tru "Non-standard join condition. {0}" (pr-str join-condition)))
     (let [unit (cond-> option-or-unit
                  (not (keyword? option-or-unit)) :unit)
           stage-number (lib.util/canonical-stage-index query stage-number)
           available-lhs (lib.temporal-bucket/available-temporal-buckets query stage-number lhs)
           available-rhs (lib.temporal-bucket/available-temporal-buckets query stage-number rhs)
           sync-lhs? (or (nil? unit) (contains? (set (map :unit available-lhs)) unit))
           sync-rhs? (or (nil? unit) (contains? (set (map :unit available-rhs)) unit))]
       (cond-> join-condition
         sync-lhs? (update 2 lib.temporal-bucket/with-temporal-bucket unit)
         sync-rhs? (update 3 lib.temporal-bucket/with-temporal-bucket unit))))))

(defmethod lib.metadata.calculation/describe-top-level-key-method :joins
  [query stage-number _key]
  (some->> (not-empty (joins query stage-number))
           (map #(lib.metadata.calculation/display-name query stage-number %))
           (str/join " + " )))

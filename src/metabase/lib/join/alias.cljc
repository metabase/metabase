(ns metabase.lib.join.alias
  (:require
   [clojure.string :as str]
   [inflections.core :as inflections]
   [medley.core :as m]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.join.common :as lib.join.common]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.query :as lib.query]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.util.match :as mbql.u.match]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(defn- standard-join-condition-update-rhs [condition with-join-alias new-alias]
  (let [f (#?(:clj requiring-resolve :cljs resolve) 'metabase.lib.join.conditions/standard-join-condition-update-rhs)]
    (f condition with-join-alias new-alias)))

(defn- suggested-join-condition [query stage-number joinable]
  (let [f (#?(:clj requiring-resolve :cljs resolve) 'metabase.lib.join.conditions/suggested-join-condition)]
    (f query stage-number joinable)))

(mu/defn current-join-alias :- [:maybe ::lib.schema.common/non-blank-string]
  "Get the current join alias associated with something, if it has one."
  [field-or-join :- [:maybe lib.join.common/FieldOrPartialJoin]]
  (case (lib.dispatch/dispatch-value field-or-join)
    :dispatch-type/nil nil
    :field             (:join-alias (lib.options/options field-or-join))
    :metadata/column   (:metabase.lib.join/join-alias field-or-join)
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

(mu/defn ^:private with-join-alias-update-conditions :- lib.join.common/PartialJoin
  "Impl for [[with-join-alias]] for a join: recursively update the `:join-alias` for inside
  the `:conditions` of the join.

  If `old-alias` is specified, uses [[metabase.mbql.util.match]] to update all the `:field` references using the old
  alias.

  If `old-alias` is `nil`, updates the RHS of all 'standard' conditions (binary filter clauses with two `:field` refs as
  args, e.g. the kind you'd get if you were using [[join-condition-operators]] and the like to create them). This
  currently doesn't handle more complex filter clauses that were created without the 'normal' MLv2 functions used by
  the frontend; we can add this in the future if we need it."
  [join      :- lib.join.common/PartialJoin
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
        (with-join-alias-update-conditions old-alias new-alias))))

(mu/defn with-join-alias :- lib.join.common/FieldOrPartialJoin
  "Add OR REMOVE a specific `join-alias` to `field-or-join`, which is either a `:field`/Field metadata, or a join map.
  Does not recursively update other references (yet; we can add this in the future)."
  {:style/indent [:form]}
  [field-or-join :- lib.join.common/FieldOrPartialJoin
   join-alias    :- [:maybe ::lib.schema.common/non-blank-string]]
  (case (lib.dispatch/dispatch-value field-or-join)
    :field
    (lib.options/update-options field-or-join u/assoc-dissoc :join-alias join-alias)

    :metadata/column
    (u/assoc-dissoc field-or-join :metabase.lib.join/join-alias join-alias)

    :mbql/join
    (with-join-alias-update-join field-or-join join-alias)))

(mu/defn joined-field-desired-alias :- ::lib.schema.common/non-blank-string
  "Desired alias for a Field that comes from a join, e.g.

    MyJoin__my_field

  You should pass the results thru a unique name function."
  [join-alias :- ::lib.schema.common/non-blank-string
   field-name :- ::lib.schema.common/non-blank-string]
  (lib.util/format "%s__%s" join-alias field-name))

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

(defn- add-alias-to-join-refs [metadata-providerable form join-alias join-refs]
  (mbql.u.match/replace form
    (field :guard (fn [field-clause]
                    (and (lib.util/field-clause? field-clause)
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
      [op op-opts (lhs :guard lib.util/field-clause?) (rhs :guard lib.util/field-clause?)]
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

(mu/defn add-default-alias :- lib.join.common/PartialJoin
  "Add a default generated `:alias` to a join clause that does not already have one."
  [query        :- ::lib.schema/query
   stage-number :- :int
   a-join       :- lib.join.common/PartialJoin]
  (if (contains? a-join :alias)
    ;; if the join clause comes with an alias, keep it and assume that the
    ;; condition fields have the right join-aliases too
    a-join
    (let [stage       (lib.util/query-stage query stage-number)
          home-cols   (lib.metadata.calculation/visible-columns query stage-number stage)
          conditions  (or (:conditions a-join)
                          (suggested-join-condition query stage-number (lib.join.common/joined-thing query a-join)))
          cond-fields (mbql.u.match/match conditions :field)
          home-col    (select-home-column home-cols cond-fields)
          join-alias  (-> (calculate-join-alias query a-join home-col)
                          (generate-unique-name (keep :alias (:joins stage))))
          home-refs   (mapv lib.ref/ref home-cols)
          join-refs   (mapv lib.ref/ref
                            (lib.metadata.calculation/returned-columns
                             (lib.query/query-with-stages query (:stages a-join))))]
      (-> a-join
          (m/update-existing :conditions
                             (fn [conditions]
                               (mapv #(add-alias-to-condition query % join-alias home-refs join-refs)
                                     conditions)))
          (with-join-alias join-alias)))))

(mu/defn implicit-join-name :- ::lib.schema.common/non-blank-string
  "Name for an implicit join against `table-name` via an FK field, e.g.

    CATEGORIES__via__CATEGORY_ID

  You should make sure this gets ran thru a unique-name fn."
  [table-name           :- ::lib.schema.common/non-blank-string
   source-field-id-name :- ::lib.schema.common/non-blank-string]
  (lib.util/format "%s__via__%s" table-name source-field-id-name))

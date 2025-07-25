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
   [metabase.lib.field.util :as lib.field.util]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.filter.operator :as lib.filter.operator]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.join.util :as lib.join.util]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.query :as lib.query]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defn- join? [x]
  (= (lib.dispatch/dispatch-value x) :mbql/join))

(def ^:private Joinable
  [:or ::lib.schema.metadata/table ::lib.schema.metadata/card])

(def ^:private JoinOrJoinable
  [:or
   [:ref ::lib.schema.join/join]
   Joinable])

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

(mu/defn- standard-join-condition? :- :boolean
  "Whether this join condition is a binary condition with two expressions (LHS and RHS), as you'd produce in the
  frontend using functions like [[join-condition-operators]], [[join-condition-lhs-columns]], and
  [[join-condition-rhs-columns]].

  LHS and RHS expressions can be aribtrary and not only `:field` references. The LHS expression will normally contain
  columns from [[join-condition-lhs-columns]], and the RHS expression from [[join-condition-rhs-columns]]."
  [condition  :- [:maybe ::lib.schema.expression/boolean]]
  (when condition
    (lib.util.match/match-lite condition
      [(_operator :guard lib.schema.join/condition-operators)
       _opts
       (_lhs :guard lib.util/clause?)
       (_rhs :guard lib.util/clause?)]
      true
      _
      false)))

(defn- standard-join-condition-lhs
  "If `condition` is a [[standard-join-condition?]], return the LHS expression. The LHS expression can be arbitrary and
  not only a `:field` reference. The frontend will only use columns from [[join-condition-lhs-columns]] here."
  [condition]
  (when (standard-join-condition? condition)
    (let [[_operator _opts lhs _rhs] condition]
      lhs)))

(defn- standard-join-condition-rhs
  "If `condition` is a [[standard-join-condition?]], return the RHS.  The RHS expression can be arbitrary and
  not only a `:field` reference. The frontend will only use columns from [[join-condition-rhs-columns]] here."
  [condition]
  (when (standard-join-condition? condition)
    (let [[_operator _opts _lhs rhs] condition]
      rhs)))

(defn- standard-join-condition-update-rhs
  "If `condition` is a [[standard-join-condition?]], update the RHS with `f` like `(apply f rhs args)`. Note that the
  RHS expression can be arbitrary and not only a `:field` reference."
  [condition f & args]
  (if-not (standard-join-condition? condition)
    condition
    (let [[operator opts lhs rhs] condition]
      [operator opts lhs (apply f rhs args)])))

(mu/defn- with-join-alias-update-join-conditions :- lib.join.util/PartialJoin
  "Impl for [[with-join-alias]] for a join: recursively update the `:join-alias` for inside the `:conditions` of the
  join.

  If `old-alias` is specified, uses [[metabase.legacy-mbql.util.match]] to update all the `:field` references using the old
  alias.

  If `old-alias` is `nil`, updates the RHS of all 'standard' conditions (binary filter clauses with the operator from
  [[join-condition-operators]], the LHS expression with columns from [[join-condition-lhs-columns]], the RHS expression
  with columns from [[join-condition-rhs-columns]]). This currently doesn't handle more complex filter clauses that
  were created without the 'normal' MLv2 functions used by the frontend; we can add this in the future if we need it."
  [join      :- lib.join.util/PartialJoin
   old-alias :- [:maybe ::lib.schema.join/alias]
   new-alias :- [:maybe ::lib.schema.join/alias]]
  (cond
    (empty? (:conditions join))
    join

    ;; if we've specified `old-alias`, then update ANY `:field` clause using it to `new-alias` instead.
    old-alias
    (lib.util.match/replace-in join [:conditions]
      (field :guard #(and (lib.util/field-clause? %) (= (lib.join.util/current-join-alias %) old-alias)))
      (with-join-alias field new-alias))

    ;; otherwise if `old-alias` is `nil`, then add (or remove!) `new-alias` to the RHS of any binary
    ;; filter clauses that don't already have a `:join-alias`.
    :else
    (update join :conditions (fn [conditions]
                               (mapv (fn [condition]
                                       (standard-join-condition-update-rhs condition
                                                                           (fn [rhs]
                                                                             (lib.util.match/replace rhs
                                                                               (field :guard lib.util/field-clause?)
                                                                               (with-join-alias field new-alias)))))
                                     conditions)))))

(defn- with-join-alias-update-join
  "Impl for [[with-join-alias]] for a join."
  [join new-alias]
  (let [old-alias (lib.join.util/current-join-alias join)]
    (-> join
        (u/assoc-dissoc :alias new-alias)
        (with-join-alias-update-join-fields new-alias)
        (with-join-alias-update-join-conditions old-alias new-alias))))

(mu/defn with-join-alias :- lib.join.util/FieldOrPartialJoin
  "Add OR REMOVE a specific `join-alias` to `field-or-join`, which is either a `:field`/Field metadata, or a join map.
  Does not recursively update other references (yet; we can add this in the future)."
  {:style/indent [:form]}
  [field-or-join :- lib.join.util/FieldOrPartialJoin
   join-alias    :- [:maybe ::lib.schema.common/non-blank-string]]
  (case (lib.dispatch/dispatch-value field-or-join)
    :field
    (lib.options/update-options field-or-join u/assoc-dissoc :join-alias join-alias)

    :metadata/column
    (if join-alias
      (assoc field-or-join ::join-alias join-alias, :lib/source :source/joins)
      (-> field-or-join
          (dissoc ::join-alias)
          (cond-> (= (:lib/source field-or-join) :source/joins) (dissoc :lib/source))))

    :mbql/join
    (with-join-alias-update-join field-or-join join-alias)

    ;; this should not happen (and cannot happen in CLJ land)
    ;; but it does seem to happen in JS land with broken MLv1 queries
    (do (log/error "with-join-value should not be called with" (pr-str field-or-join))
        field-or-join)))

(mu/defn maybe-resolve-join :- [:maybe ::lib.schema.join/join]
  "Resolve a join with a specific `join-alias`. Returns nil if there's no such join."
  [query        :- ::lib.schema/query
   stage-number :- :int
   join-alias   :- ::lib.schema.common/non-blank-string]
  (let [{:keys [joins]} (lib.util/query-stage query stage-number)]
    (m/find-first #(= (:alias %) join-alias)
                  joins)))

(defn- join-not-found-error [query stage-number join-alias]
  (ex-info (i18n/tru "No join named {0}, found: {1}"
                     (pr-str join-alias)
                     (pr-str (mapv :alias (:joins (lib.util/query-stage query stage-number)))))
           {:join-alias   join-alias
            :query        query
            :stage-number stage-number}))

(mu/defn resolve-join :- ::lib.schema.join/join
  "Resolve a join with a specific `join-alias`."
  [query        :- ::lib.schema/query
   stage-number :- :int
   join-alias   :- ::lib.schema.common/non-blank-string]
  (or (maybe-resolve-join query stage-number join-alias)
      (throw (join-not-found-error query stage-number join-alias))))

;; HACK: This is only necessary to handle broken legacy refs that refer to a :join-alias from another stage.
;; If such refs can be excluded, this can be dropped. The best approach is likely for conversion from legacy to heal
;; such a bad ref in advance.
(mu/defn maybe-resolve-join-across-stages :- [:maybe ::lib.schema.join/join]
  "Resolves a join with a specific `join-alias`, in the specified stage **and** earlier stages.

  This can heal some bad legacy references which use a `join-alias` for a previous stage even when they should not."
  [query        :- ::lib.schema/query
   stage-number :- :int
   join-alias   :- ::lib.schema.common/non-blank-string]
  (let [stage-index (lib.util/canonical-stage-index query stage-number)]
    (some #(maybe-resolve-join query % join-alias)
          ;; Every stage from the input `stage-number` down to 0.
          (range stage-index -1 -1))))

(defmethod lib.metadata.calculation/display-name-method :mbql/join
  [query _stage-number {[{:keys [source-table source-card], :as _first-stage}] :stages, :as _join} _style]
  (or
   (when source-table
     (:display-name (lib.metadata/table query source-table)))
   (when source-card
     (if-let [card-metadata (lib.metadata/card query source-card)]
       (lib.metadata.calculation/display-name query 0 card-metadata)
       (lib.card/fallback-display-name source-card)))
   (i18n/tru "Native Query")))

(defmethod lib.metadata.calculation/display-info-method :mbql/join
  [query stage-number join]
  (let [display-name (lib.metadata.calculation/display-name query stage-number join)]
    {:name (or (:alias join) display-name), :display-name display-name}))

(defmethod lib.metadata.calculation/metadata-method :mbql/join
  [_query _stage-number _join-query]
  ;; not i18n'ed because this shouldn't be developer-facing.
  (throw (ex-info "You can't calculate a metadata map for a join! Use lib.metadata.calculation/returned-columns-method instead."
                  {})))

(mu/defn- column-from-join :- ::lib.metadata.calculation/column-metadata-with-source
  "For a column that comes from a join, add or update metadata as needed, e.g. include join name in the display name."
  [query           :- ::lib.schema/query
   stage-number    :- :int
   column-metadata :- ::lib.schema.metadata/column
   join-alias      :- ::lib.schema.common/non-blank-string]
  ;; TODO (Cam 6/19/25) -- we need to get rid of `:source-alias` it's just causing confusion; don't need two keys for
  ;; join aliases.
  (let [column-metadata (assoc column-metadata
                               :source-alias            join-alias
                               :lib/original-join-alias join-alias)
        col             (-> (assoc column-metadata
                                   :display-name (lib.metadata.calculation/display-name query stage-number column-metadata)
                                   :lib/source   :source/joins)
                            (with-join-alias join-alias))]
    (assert (= (lib.join.util/current-join-alias col) join-alias))
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

;;; this returns ALL the columns 'visible' within the join, regardless of `:fields` ! `:fields` is only the list of
;;; things to get added to the parent stage `:fields`! See QUE-1380
;;;
;;; If you want just the stuff in `:fields`, use [[join-fields-to-add-to-parent-stage]] instead.
(mu/defmethod lib.metadata.calculation/returned-columns-method :mbql/join :- [:maybe ::lib.metadata.calculation/returned-columns]
  [query                                          :- ::lib.schema/query
   stage-number                                   :- :int
   {:keys [stages], join-alias :alias, :as _join} :- ::lib.schema.join/join
   options                                        :- [:maybe ::lib.metadata.calculation/returned-columns.options]]
  (let [join-query (assoc query :stages stages)
        cols       (lib.metadata.calculation/returned-columns
                    join-query -1 (lib.util/query-stage join-query -1)
                    options)]
    (into []
          (comp (map #(column-from-join query stage-number % join-alias))
                (lib.field.util/add-source-and-desired-aliases-xform query))
          cols)))

(mu/defn join-fields-to-add-to-parent-stage :- [:maybe [:sequential ::lib.metadata.calculation/column-metadata-with-source]]
  "The resolved `:fields` from a join, which we automatically append to the parent stage's `:fields`."
  [query
   stage-number
   {:keys [fields stages], join-alias :alias, :or {fields :none}, :as join}
   options :- [:maybe ::lib.metadata.calculation/returned-columns.options]]
  (when-not (= fields :none)
    (let [cols   (lib.metadata.calculation/returned-columns query stage-number join options)
          cols'  (if (= fields :all)
                   cols
                   (for [field-ref fields
                         :let      [match (or (lib.equality/find-matching-column field-ref cols)
                                              (log/warnf "Failed to find matching column in join %s for ref %s, found:\n%s"
                                                         (pr-str join-alias)
                                                         (pr-str field-ref)
                                                         (u/pprint-to-str cols)))]
                         :when     match]
                     (assoc match :lib/source-uuid (lib.options/uuid field-ref))))
          ;; If there was a `:fields` clause but none of them matched the `join-cols` then pretend it was `:fields :all`
          ;; instead. That can happen if a model gets reworked and an old join clause remembers the old fields.
          cols'  (if (empty? cols') cols cols')
          ;; add any remaps for the fields as needed.
          cols'' (concat
                  cols'
                  (lib.metadata.calculation/remapped-columns
                   (assoc query :stages stages)
                   0
                   cols'
                   options))]
      (mapv #(column-from-join query stage-number % join-alias)
            cols''))))

(defmethod lib.metadata.calculation/visible-columns-method :mbql/join
  [query stage-number join options]
  (lib.metadata.calculation/returned-columns query stage-number (assoc join :fields :all) options))

(mu/defn all-joins-visible-columns :- ::lib.metadata.calculation/visible-columns
  "Convenience for calling [[lib.metadata.calculation/visible-columns]] on all of the joins in a query stage."
  [query          :- ::lib.schema/query
   stage-number   :- :int
   options        :- ::lib.metadata.calculation/visible-columns.options]
  (into []
        (mapcat (fn [join]
                  (lib.metadata.calculation/visible-columns
                   query stage-number join
                   (-> options
                       (select-keys [:include-remaps?]) ; WHY
                       (assoc :include-implicitly-joinable? false)))))
        (:joins (lib.util/query-stage query stage-number))))

(mu/defn all-joins-fields-to-add-to-parent-stage :- ::lib.metadata.calculation/returned-columns
  "Convenience for calling [[lib.metadata.calculation/returned-columns-method]] on all the joins in a query stage."
  [query        :- ::lib.schema/query
   stage-number :- :int
   options      :- [:maybe ::lib.metadata.calculation/returned-columns.options]]
  (into []
        (mapcat (fn [join]
                  (join-fields-to-add-to-parent-stage query stage-number join options)))
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
            (standard-join-condition-update-rhs condition (fn [rhs]
                                                            (lib.util.match/replace rhs
                                                              (field :guard #(and (lib.util/field-clause? %) (not (lib.join.util/current-join-alias %))))
                                                              (with-join-alias field join-alias)))))
          conditions)))

(mu/defn with-join-conditions :- lib.join.util/PartialJoin
  "Update the `:conditions` (filters) for a Join clause."
  {:style/indent [:form]}
  [a-join     :- lib.join.util/PartialJoin
   conditions :- [:maybe [:sequential [:or ::lib.schema.expression/boolean ::lib.schema.common/external-op]]]]
  (let [conditions (-> (mapv lib.common/->op-arg conditions)
                       (with-join-conditions-add-alias-to-rhses (lib.join.util/current-join-alias a-join)))]
    (u/assoc-dissoc a-join :conditions (not-empty conditions))))

(mu/defn with-join-fields :- lib.join.util/PartialJoin
  "Update a join (or a function that will return a join) to include `:fields`, either `:all`, `:none`, or a sequence of
  references."
  [joinable :- lib.join.util/PartialJoin
   fields   :- [:maybe [:or [:enum :all :none] [:sequential some?]]]]
  (let [fields (cond
                 (keyword? fields) fields
                 (= fields [])     :none
                 :else             (not-empty
                                    (into []
                                          (comp (map lib.ref/ref)
                                                (if-let [current-alias (lib.join.util/current-join-alias joinable)]
                                                  (map #(with-join-alias % current-alias))
                                                  identity))
                                          fields)))]
    (u/assoc-dissoc joinable :fields fields)))

(defn- select-home-column
  [home-cols cond-fields]
  (when (seq cond-fields)
    (let [cond-home-cols (keep #(lib.equality/find-matching-column % home-cols) cond-fields)]
          ;; first choice: the leftmost FK or PK in the condition referring to a home column
      (or (m/find-first (some-fn lib.types.isa/foreign-key? lib.types.isa/primary-key?) cond-home-cols)
          ;; otherwise the leftmost home column in the condition
          (first cond-home-cols)
          ;; otherwise the first FK home column
          (m/find-first lib.types.isa/foreign-key? home-cols)
          ;; otherwise the first PK home column
          (m/find-first lib.types.isa/primary-key? home-cols)
          ;; otherwise the first home column
          (first home-cols)))))

(defn- strip-id [s]
  (when (and (string? s)
             (not (re-find #"(?i) → id$" s)))
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

(defn- add-alias-to-join-refs [query stage-number form join-alias join-cols]
  (lib.util.match/replace form
    (field :guard (fn [field-clause]
                    (and (lib.util/field-clause? field-clause)
                         (boolean (lib.equality/find-matching-column query stage-number field-clause join-cols)))))
    (with-join-alias field join-alias)))

(defn- add-alias-to-condition
  [query stage-number condition join-alias home-cols join-cols]
  (let [condition (add-alias-to-join-refs query stage-number condition join-alias join-cols)]
    ;; Sometimes conditions have field references which cannot be unambigously
    ;; assigned to one of the sides. The following code tries to deal with
    ;; these cases, but only for conditions that look like the ones generated
    ;; generated by the FE. These have the form home-field op join-field,
    ;; so we break ties by looking at the poisition of the field reference.
    (lib.util.match/replace condition
      [op op-opts (lhs :guard lib.util/field-clause?) (rhs :guard lib.util/field-clause?)]
      (let [lhs-alias (lib.join.util/current-join-alias lhs)
            rhs-alias (lib.join.util/current-join-alias rhs)]
        (cond
          ;; no sides obviously belong to joined
          (not (or lhs-alias rhs-alias))
          (if (lib.equality/find-matching-column query stage-number rhs home-cols)
            [op op-opts (with-join-alias lhs join-alias) rhs]
            [op op-opts lhs (with-join-alias rhs join-alias)])

          ;; both sides seem to belong to joined assuming this resulted from
          ;; overly fuzzy matching, we remove the join alias from the LHS
          ;; unless the RHS seems to belong to home too while the LHS doesn't
          (and (= lhs-alias join-alias) (= rhs-alias join-alias))
          (let [bare-lhs (lib.options/update-options lhs dissoc :join-alias)
                bare-rhs (lib.options/update-options rhs dissoc :join-alias)]
            (if (and (nil? (lib.equality/find-matching-column query stage-number bare-lhs home-cols))
                     (lib.equality/find-matching-column query stage-number bare-rhs home-cols))
              [op op-opts lhs bare-rhs]
              [op op-opts bare-lhs rhs]))

          ;; we leave alone the condition otherwise
          :else &match))
    ;; do not replace inner references as there can be a custom join expression
      _
      condition)))

(defn- generate-unique-name [base-name taken-names]
  (let [generator (lib.util/unique-name-generator)]
    (run! generator taken-names)
    (generator base-name)))

(defn default-alias
  "Generate a default `:alias` for a join clause. home-cols should be visible columns for the stage"
  ([query stage-number a-join]
   (let [stage (lib.util/query-stage query stage-number)
         home-cols (lib.metadata.calculation/visible-columns query stage-number stage)]
     (default-alias query stage-number a-join stage home-cols)))
  ([query _stage-number a-join stage home-cols]
   (let [home-cols   home-cols
         cond-fields (into []
                           (mapcat (fn [condition]
                                     (let [lhs (standard-join-condition-lhs condition)
                                           rhs (standard-join-condition-rhs condition)]
                                       (when (and (lib.util/field-clause? lhs) (lib.util/field-clause? rhs))
                                         [lhs rhs]))))
                           (:conditions a-join))
         home-col   (select-home-column home-cols cond-fields)]
     (-> (calculate-join-alias query a-join home-col)
         (generate-unique-name (keep :alias (:joins stage)))))))

(mu/defn add-default-alias :- ::lib.schema.join/join
  "Add a default generated `:alias` to a join clause that does not already have one or that specifically requests a
  new one."
  [query        :- ::lib.schema/query
   stage-number :- :int
   a-join       :- lib.join.util/JoinWithOptionalAlias]
  (if (and (contains? a-join :alias) (not (contains? a-join ::replace-alias)))
    ;; if the join clause comes with an alias and doesn't need a new one, keep it and assume that the condition fields
    ;; have the right join-aliases too
    a-join
    (let [old-alias   (:alias a-join)
          stage       (cond-> (lib.util/query-stage query stage-number)
                        old-alias (update :joins (fn [joins]
                                                   (mapv #(if (= (:alias %) old-alias)
                                                            (dissoc % :alias)
                                                            %)
                                                         joins))))
          home-cols   (lib.metadata.calculation/visible-columns query stage-number stage)
          join-alias  (default-alias query stage-number a-join stage home-cols)
          join-cols   (lib.metadata.calculation/returned-columns
                       (lib.query/query-with-stages query (:stages a-join)))]
      (cond-> a-join
        true (dissoc ::replace-alias)
        (not old-alias) (update :conditions
                                (fn [conditions]
                                  (mapv #(add-alias-to-condition query stage-number % join-alias home-cols join-cols)
                                        conditions)))
        true (with-join-alias join-alias)))))

(declare join-conditions
         joined-thing
         suggested-join-conditions)

(mu/defn joins :- [:maybe ::lib.schema.join/joins]
  "Get all joins in a specific `stage` of a `query`. If `stage` is unspecified, returns joins in the final stage of the
  query."
  ([query]
   (joins query -1))
  ([query        :- ::lib.schema/query
    stage-number :- :int]
   (not-empty (get (lib.util/query-stage query stage-number) :joins))))

(mu/defn join-conditions :- [:maybe ::lib.schema.join/conditions]
  "Get all join conditions for the given join"
  [a-join :- lib.join.util/PartialJoin]
  (:conditions a-join))

(mu/defn join-fields :- [:maybe ::lib.schema.join/fields]
  "Get all join conditions for the given join"
  [a-join :- lib.join.util/PartialJoin]
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
  [a-join :- lib.join.util/PartialJoin]
  (get a-join :strategy :left-join))

(mu/defn join-strategy :- ::lib.schema.join/strategy.option
  "Get the strategy (type) of a given join, as a `:option/join.strategy` map. If `:stategy` is unspecified, returns
  the default, left join."
  [a-join :- lib.join.util/PartialJoin]
  (raw-join-strategy->strategy-option (raw-join-strategy a-join)))

(mu/defn with-join-strategy :- lib.join.util/PartialJoin
  "Return a copy of `a-join` with its `:strategy` set to `strategy`."
  [a-join   :- lib.join.util/PartialJoin
   strategy :- [:or ::lib.schema.join/strategy ::lib.schema.join/strategy.option]]
  ;; unwrap the strategy to a raw keyword if needed.
  (assoc a-join :strategy (cond-> strategy
                            (= (lib.dispatch/dispatch-value strategy) :option/join.strategy)
                            :strategy)))

(mu/defn available-join-strategies :- [:sequential ::lib.schema.join/strategy.option]
  "Get available join strategies for the current Database (based on the Database's
  supported [[metabase.driver/features]]) as raw keywords like `:left-join`."
  ([query]
   (available-join-strategies query -1))

  ;; stage number is not currently used, but it is taken as a parameter for consistency with the rest of MLv2
  ([query         :- ::lib.schema/query
    _stage-number :- :int]
   (into []
         (comp (filter (partial lib.metadata/database-supports? query))
               (map raw-join-strategy->strategy-option))
         [:left-join :right-join :inner-join :full-join])))

(mu/defn join-clause :- lib.join.util/PartialJoin
  "Create an MBQL join map from something that can conceptually be joined against. A `Table`? An MBQL or native query? A
  Saved Question? You should be able to join anything, and this should return a sensible MBQL join map. Uses a left join
  by default."
  ([joinable]
   (-> (join-clause-method joinable)
       (u/assoc-default :fields :all)))

  ([joinable conditions]
   (join-clause joinable conditions :left-join))

  ([joinable conditions strategy]
   (-> (join-clause joinable)
       (with-join-conditions conditions)
       (with-join-strategy strategy))))

(defn- has-summaries? [query stage-number]
  (let [stage (lib.util/query-stage query stage-number)]
    (boolean (or (seq (:aggregation stage))
                 (seq (:breakout stage))))))

(mu/defn join :- ::lib.schema/query
  "Add a join clause to a `query`."
  ([query a-join]
   (join query -1 a-join))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    a-join       :- [:or lib.join.util/PartialJoin Joinable]]
   (let [a-join              (join-clause a-join)
         suggested-conditions (when (empty? (join-conditions a-join))
                                (suggested-join-conditions query stage-number (joined-thing query a-join)))
         summaries?          (has-summaries? query stage-number)
         a-join              (cond-> a-join
                               (seq suggested-conditions) (with-join-conditions suggested-conditions)
                               ;; If there are aggregations or breakouts on this stage, drop the `:fields`.
                               summaries?                 (with-join-fields nil))
         a-join              (add-default-alias query stage-number a-join)]
     (lib.util/update-query-stage query stage-number update :joins (fn [existing-joins]
                                                                     (conj (vec existing-joins) a-join))))))

(mu/defn joined-thing :- [:maybe Joinable]
  "Return metadata about the origin of `a-join` using `metadata-providerable` as the source of information."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   a-join                :- lib.join.util/PartialJoin]
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

(mu/defn- sort-join-condition-columns :- [:sequential ::lib.schema.metadata/column]
  "Sort potential join condition columns as returned by [[join-condition-lhs-columns]]
  or [[join-condition-rhs-columns]]. PK columns are returned first, followed by FK columns, followed by other columns.
  Otherwise original order is maintained."
  [columns :- [:sequential ::lib.schema.metadata/column]]
  (let [{:keys [pk fk other]} (group-by (fn [column]
                                          (cond
                                            (lib.types.isa/primary-key? column) :pk
                                            (lib.types.isa/foreign-key? column) :fk
                                            :else                               :other))
                                        columns)]
    (concat pk fk other)))

(defn- mark-selected-column [query stage-number existing-column-or-nil columns]
  (if-not existing-column-or-nil
    columns
    (mapv (fn [column]
            (if (:selected? column)
              (lib.temporal-bucket/with-temporal-bucket
                column
                (lib.temporal-bucket/temporal-bucket existing-column-or-nil))
              column))
          (lib.equality/mark-selected-columns query stage-number columns [existing-column-or-nil]))))

(mu/defn join-condition-lhs-columns :- [:sequential ::lib.schema.metadata/column]
  "Get a sequence of columns that can be used as the left-hand-side (source column) in a join condition. This column
  is the one that comes from the source Table/Card/previous stage of the query or a previous join.

  If you are changing the LHS of a condition for an existing join, pass in that existing join as `join-or-joinable` so
  we can filter out the columns added by it (it doesn't make sense to present the columns added by a join as options
  for its own LHS) or added by later joins (joins can only depend on things from previous joins). Otherwise you can
  either pass in `nil` or the [[Joinable]] (Table or Card metadata) we're joining against when building a new
  join. (Things other than joins are ignored, but this argument is flexible for consistency with the signature
  of [[join-condition-rhs-columns]].) See #32005 for more info.

  If the left-hand-side column has already been chosen and we're UPDATING it, pass in `lhs-expression-or-nil` so we can
  mark the current column as `:selected` in the metadata/display info.

  If the right-hand-side column has already been chosen (they can be chosen in any order in the Query Builder UI),
  pass in the chosen RHS column. In the future, this may be used to restrict results to compatible columns. (See #31174)

  Results will be returned in a 'somewhat smart' order with PKs and FKs returned before other columns.

  Unlike most other things that return columns, implicitly-joinable columns ARE NOT returned here."
  ([query joinable lhs-expression-or-nil rhs-expression-or-nil]
   (join-condition-lhs-columns query -1 joinable lhs-expression-or-nil rhs-expression-or-nil))

  ([query                  :- ::lib.schema/query
    stage-number           :- :int
    join-or-joinable       :- [:maybe JoinOrJoinable]
    lhs-expression-or-nil  :- [:maybe ::lib.schema.expression/expression]
    ;; not yet used, hopefully we will use in the future when present for filtering incompatible columns out.
    _rhs-expression-or-nil :- [:maybe ::lib.schema.expression/expression]]
   ;; calculate all the visible columns including the existing join; then filter out any columns that come from the
   ;; existing join and any subsequent joins. The reason for doing things this way rather than removing the joins
   ;; before calculating visible columns is that we don't want to either create possibly-invalid queries, or have to
   ;; rely on the logic in [[metabase.lib.remove-replace/remove-join]] which would cause circular references; this is
   ;; simpler as well.
   ;;
   ;; e.g. if we have joins [J1 J2 J3 J4] and current join = J2, then we want to ignore the visible columns from J2,
   ;; J3, and J4.
   (let [existing-join-alias    (when (join? join-or-joinable)
                                  (lib.join.util/current-join-alias join-or-joinable))
         join-aliases-to-ignore (into #{}
                                      (comp (map lib.join.util/current-join-alias)
                                            (drop-while #(not= % existing-join-alias)))
                                      (joins query stage-number))]
     (->> (lib.metadata.calculation/visible-columns query stage-number
                                                    (lib.util/query-stage query stage-number)
                                                    {:include-expressions?         false
                                                     :include-implicitly-joinable? false})
          (remove (fn [col]
                    (when-let [col-join-alias (lib.join.util/current-join-alias col)]
                      (contains? join-aliases-to-ignore col-join-alias))))
          (mark-selected-column query
                                stage-number
                                (when (lib.util/field-clause? lhs-expression-or-nil)
                                  lhs-expression-or-nil))
          sort-join-condition-columns))))

(mu/defn join-condition-rhs-columns :- [:sequential ::lib.schema.metadata/column]
  "Get a sequence of columns that can be used as the right-hand-side (target column) in a join condition. This column
  is the one that belongs to the thing being joined, `join-or-joinable`, which can be something like a
  Table ([[metabase.lib.metadata/TableMetadata]]), Saved Question/Model ([[metabase.lib.metadata/CardMetadata]]),
  another query, etc. -- anything you can pass to [[join-clause]]. You can also pass in an existing join.

  If the left-hand-side column has already been chosen (they can be chosen in any order in the Query Builder UI),
  pass in the chosen LHS column. In the future, this may be used to restrict results to compatible columns. (See #31174)

  If the right-hand-side column has already been chosen and we're UPDATING it, pass in `rhs-expression-or-nil` so we can
  mark the current column as `:selected` in the metadata/display info.

  Results will be returned in a 'somewhat smart' order with PKs and FKs returned before other columns."
  ([query joinable lhs-expression-or-nil rhs-expression-or-nil]
   (join-condition-rhs-columns query -1 joinable lhs-expression-or-nil rhs-expression-or-nil))

  ([query                  :- ::lib.schema/query
    stage-number           :- :int
    join-or-joinable       :- JoinOrJoinable
    ;; not yet used, hopefully we will use in the future when present for filtering incompatible columns out.
    _lhs-expression-or-nil :- [:maybe ::lib.schema.expression/expression]
    rhs-expression-or-nil  :- [:maybe ::lib.schema.expression/expression]]
   ;; I was on the fence about whether these should get `:lib/source :source/joins` or not -- it seems like based on
   ;; the QB UI they shouldn't. See screenshots in #31174
   (let [joinable          (if (join? join-or-joinable)
                             (joined-thing query join-or-joinable)
                             join-or-joinable)
         join-alias        (when (join? join-or-joinable)
                             (lib.join.util/current-join-alias join-or-joinable))
         rhs-column-or-nil (when (lib.util/field-clause? rhs-expression-or-nil)
                             (cond-> rhs-expression-or-nil
                               ;; Drop the :join-alias from the RHS if the joinable doesn't have one either.
                               (not join-alias) (lib.options/update-options dissoc :join-alias)))]
     (->> (lib.metadata.calculation/visible-columns query stage-number joinable {:include-implicitly-joinable? false})
          (map (fn [col]
                 (cond-> (assoc col :lib/source :source/joins)
                   join-alias (with-join-alias join-alias))))
          (mark-selected-column query stage-number rhs-column-or-nil)
          sort-join-condition-columns))))

(mu/defn join-condition-operators :- [:sequential ::lib.schema.join/condition.operator]
  "Return a sequence of valid filter clause operators that can be used to build a join condition. In the Query Builder
  UI, this can be chosen at any point before or after choosing the LHS and RHS. Invalid options are not currently
  filtered out based on values of the LHS or RHS, but in the future we can add this -- see #31174."
  ([query lhs-expression-or-nil rhs-expression-or-nil]
   (join-condition-operators query -1 lhs-expression-or-nil rhs-expression-or-nil))

  ([_query                 :- ::lib.schema/query
    _stage-number          :- :int
    ;; not yet used, hopefully we will use in the future when present for filtering incompatible options out.
    _lhs-expression-or-nil :- [:maybe ::lib.schema.expression/expression]
    _rhs-expression-or-nil :- [:maybe ::lib.schema.expression/expression]]
   ;; currently hardcoded to these six operators regardless of LHS and RHS.
   lib.schema.join/ordered-condition-operators))

(mu/defn- fk-columns-to :- [:maybe [:sequential
                                    {:min 1}
                                    [:and
                                     ::lib.schema.metadata/column
                                     [:map
                                      [::target ::lib.schema.metadata/column]]]]]
  "Find FK columns in `source` pointing at a column in `target`. Includes the target column under the `::target` key."
  [query        :- ::lib.schema/query
   stage-number :- :int
   source
   target]
  (let [target-columns (delay
                         (lib.metadata.calculation/visible-columns
                          query stage-number target
                          {:include-implicitly-joinable?                 false
                           :include-implicitly-joinable-for-source-card? false}))]
    (not-empty
     (into []
           (keep (fn [{:keys [fk-target-field-id], :as col}]
                   (when (and (lib.types.isa/foreign-key? col)
                              fk-target-field-id)
                     (when-let [target-column (m/find-first (fn [target-column]
                                                              (= fk-target-field-id
                                                                 (:id target-column)))
                                                            @target-columns)]
                       (assoc col ::target target-column)))))
           (lib.metadata.calculation/visible-columns query stage-number source
                                                     {:include-implicitly-joinable?                 false
                                                      :include-implicitly-joinable-for-source-card? false})))))

(mu/defn suggested-join-conditions :- [:maybe [:sequential {:min 1} ::lib.schema.expression/boolean]] ; i.e., a filter clause
  "Return suggested default join conditions when constructing a join against `joinable`, e.g. a Table, Saved
  Question, or another query. Suggested conditions will be returned if the source Table has a foreign key to the
  primary key of the thing we're joining (see #31175 for more info); otherwise this will return `nil` if no default
  conditions are suggested."
  ([query joinable]
   (suggested-join-conditions query -1 joinable nil))

  ([query stage-number joinable]
   (suggested-join-conditions query stage-number joinable nil))

  ([query         :- ::lib.schema/query
    stage-number  :- :int
    joinable
    position      :- [:maybe :int]]
   (let [unjoined (if position
                    ;; Drop this join and any later ones so they won't be used as suggestions.
                    (let [new-joins (-> (lib.util/query-stage query stage-number)
                                        :joins
                                        (subvec 0 position)
                                        not-empty)]
                      (lib.util/update-query-stage query stage-number
                                                   u/assoc-dissoc :joins new-joins))
                    ;; If this is a new joinable, use the entire current query.
                    query)
         stage    (lib.util/query-stage unjoined stage-number)]
     (letfn [;; only keep one FK to each target column e.g. for
             ;;
             ;;    messages (sender_id REFERENCES user(id),  recipient_id REFERENCES user(id))
             ;;
             ;; we only want join on one or the other, not both, because that makes no sense. However with a composite
             ;; FK -> composite PK suggest multiple conditions. See #34184
             (fks [source target]
               (->> (fk-columns-to unjoined stage-number source target)
                    (m/distinct-by #(-> % ::target :id))
                    not-empty))
             (filter-clause [x y]
               (lib.filter/filter-clause (lib.filter.operator/operator-def :=) x y))]
       (or
        ;; find cases where we have FK(s) pointing to joinable. Our column goes on the LHS.
        (when-let [fks (fks stage joinable)]
          (mapv (fn [fk]
                  (filter-clause fk (::target fk)))
                fks))
        ;; find cases where the `joinable` has FK(s) pointing to us. Note our column is the target this time around --
        ;; keep in on the LHS.
        (when-let [fks (fks joinable stage)]
          (mapv (fn [fk]
                  (filter-clause (::target fk) fk))
                fks)))))))

(defn- xform-add-join-alias [a-join]
  (let [join-alias (lib.join.util/current-join-alias a-join)]
    (map (fn [col]
           (-> col
               (with-join-alias join-alias)
               ;; TODO (Cam 6/25/25) -- remove `:source-alias` since it is busted
               (assoc :source-alias join-alias))))))

(defn- xform-mark-selected-joinable-columns
  "Mark the column metadatas in `cols` as `:selected` if they appear in `a-join`'s `:fields`."
  [a-join]
  (let [j-fields (join-fields a-join)]
    (case j-fields
      :all        (map #(assoc % :selected? true))
      (:none nil) (map #(assoc % :selected? false))
      (mapcat #(lib.equality/mark-selected-columns [%] j-fields)))))

(def ^:private xform-fix-source-for-joinable-columns
  (map #(assoc % :lib/source :source/joins)))

;;; TODO (Cam 7/8/25) -- this is a confusing name. `join-fieldable-columns` would be consistent
;;; with [[metabase.lib.field/fieldable-columns]] and be less confusing
(mu/defn joinable-columns :- ::lib.metadata.calculation/visible-columns
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
    (into []
          (if a-join
            (comp xform-fix-source-for-joinable-columns
                  (xform-add-join-alias a-join)
                  (xform-mark-selected-joinable-columns a-join))
            identity)
          cols)))

(defn- join-lhs-display-name-from-condition-lhs
  [query stage-number join-or-joinable condition-lhs-or-nil]
  (when-let [lhs-column-ref (or condition-lhs-or-nil
                                (when (join? join-or-joinable)
                                  (when-let [lhs (standard-join-condition-lhs (first (join-conditions join-or-joinable)))]
                                    (when (lib.util/field-clause? lhs)
                                      lhs))))]
    (let [display-info (lib.metadata.calculation/display-info query stage-number lhs-column-ref)]
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

    1b. When building a join, you can optionally pass in `condition-lhs-expression-or-nil` yourself.

  2. If the condition LHS column is unknown, and this is the first join in the first stage of a query, and the query
     uses a `:source-table`, then use the display name for the source Table.

  3. Otherwise use `Previous results`.

  This function needs to be usable while we are in the process of constructing a join in the context of a given stage,
  but also needs to work for rendering existing joins. Pass a join in for existing joins, or something [[Joinable]]
  for ones we are currently building."
  ([query join-or-joinable]
   (join-lhs-display-name query join-or-joinable nil))

  ([query join-or-joinable condition-lhs-expression-or-nil]
   (join-lhs-display-name query -1 join-or-joinable condition-lhs-expression-or-nil))

  ([query                           :- ::lib.schema/query
    stage-number                    :- :int
    join-or-joinable                :- [:maybe JoinOrJoinable]
    condition-lhs-expression-or-nil :- [:maybe [:or ::lib.schema.metadata/column :mbql.clause/field]]]
   (or
    (join-lhs-display-name-from-condition-lhs query stage-number join-or-joinable condition-lhs-expression-or-nil)
    (join-lhs-display-name-for-first-join-in-first-stage query stage-number join-or-joinable)
    (i18n/tru "Previous results"))))

(mu/defn join-condition-update-temporal-bucketing :- ::lib.schema.expression/boolean
  "Updates the provided join-condition's fields' temporal-bucketing option, returns the updated join-condition.
   Must be called on a standard join condition with just columns used for both LHS and RHS expressions, otherwise the
   join condition will NOT be updated.
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
   (if-not (standard-join-condition? join-condition)
     join-condition
     (let [[_ _ lhs rhs :as join-condition] (lib.common/->op-arg join-condition)]
       (if-not (and (lib.util/field-clause? lhs) (lib.util/field-clause? rhs))
         join-condition
         (let [unit (cond-> option-or-unit
                      (not (keyword? option-or-unit)) :unit)
               stage-number (lib.util/canonical-stage-index query stage-number)
               available-lhs (lib.temporal-bucket/available-temporal-buckets query stage-number lhs)
               available-rhs (lib.temporal-bucket/available-temporal-buckets query stage-number rhs)
               sync-lhs? (or (nil? unit) (contains? (set (map :unit available-lhs)) unit))
               sync-rhs? (or (nil? unit) (contains? (set (map :unit available-rhs)) unit))]
           (cond-> join-condition
             sync-lhs? (update 2 lib.temporal-bucket/with-temporal-bucket unit)
             sync-rhs? (update 3 lib.temporal-bucket/with-temporal-bucket unit))))))))

(defmethod lib.metadata.calculation/describe-top-level-key-method :joins
  [query stage-number _key]
  (some->> (not-empty (joins query stage-number))
           (map #(lib.metadata.calculation/display-name query stage-number %))
           (str/join " + ")))

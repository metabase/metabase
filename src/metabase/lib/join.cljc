(ns metabase.lib.join
  (:require
   [clojure.string :as str]
   [inflections.core :as inflections]
   [medley.core :as m]
   [metabase.lib.common :as lib.common]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.filter :as lib.schema.filter]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.util :as mbql.u]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(defmulti with-join-alias-method
  "Implementation for [[with-join-alias]]."
  {:arglists '([x join-alias])}
  (fn [x _join-alias]
    (lib.dispatch/dispatch-value x)))

(defmethod with-join-alias-method :dispatch-type/fn
  [f join-alias]
  (fn [query stage-number]
    (let [x (f query stage-number)]
      (with-join-alias-method x join-alias))))

(defmethod with-join-alias-method :mbql/join
  [join join-alias]
  (assoc join :alias join-alias))

(mu/defn with-join-alias
  "Add a specific `join-alias` to something `x`, either a `:field` or join map. Does not recursively update other
  references (yet; we can add this in the future)."
  [x join-alias :- ::lib.schema.common/non-blank-string]
  (with-join-alias-method x join-alias))

(defmulti current-join-alias-method
  "Impl for [[current-join-alias]]."
  {:arglists '([x])}
  lib.dispatch/dispatch-value)

(defmethod current-join-alias-method :default
  [_x]
  nil)

(mu/defn current-join-alias :- [:maybe ::lib.schema.common/non-blank-string]
  "Get the current join alias associated with something, if it has one."
  [x]
  (current-join-alias-method x))

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
  [query _stage-number {[first-stage] :stages, :as _join} _style]
  (if-let [source-table (:source-table first-stage)]
    (if (integer? source-table)
      (:display-name (lib.metadata/table query source-table))
      ;; handle card__<id> source tables.
      (let [card-id (lib.util/string-table-id->card-id source-table)]
        (i18n/tru "Saved Question #{0}" card-id)))
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

(mu/defn ^:private default-join-alias :- ::lib.schema.common/non-blank-string
  "Generate an alias for a join that doesn't already have one."
  [query        :- ::lib.schema/query
   stage-number :- :int
   join         :- ::lib.schema.join/join]
  ;; TODO -- this logic is a little goofy, we should update it to match what MLv1 does. See
  ;; https://github.com/metabase/metabase/issues/30048
  (lib.metadata.calculation/display-name query stage-number join))

(defmethod lib.metadata.calculation/metadata-method :mbql/join
  [query stage-number {:keys [fields stages], join-alias :alias, :or {fields :none}, :as _join}]
  (when-not (= fields :none)
    (let [join-query (assoc query :stages stages)
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

(def ^:private JoinsWithAliases
  "Schema for a sequence of joins that all have aliases."
  [:and
   ::lib.schema.join/joins
   [:sequential
    [:map
     [:alias ::lib.schema.common/non-blank-string]]]])

(mu/defn ^:private  ensure-all-joins-have-aliases :- JoinsWithAliases
  "Make sure all the joins in a query have an `:alias` if they don't already have one."
  [query        :- ::lib.schema/query
   stage-number :- :int
   joins        :- ::lib.schema.join/joins]
  (let [unique-name-fn (lib.util/unique-name-generator)]
    (mapv (fn [join]
            (cond-> join
              (not (:alias join)) (assoc :alias (unique-name-fn (default-join-alias query stage-number join)))))
          joins)))

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
        (when-let [joins (:joins (lib.util/query-stage query stage-number))]
          (ensure-all-joins-have-aliases query stage-number joins))))

(mu/defn all-joins-metadata :- lib.metadata.calculation/ColumnsWithUniqueAliases
  "Convenience for calling [[lib.metadata.calculation/metadata]] on all the joins in a query stage."
  [query          :- ::lib.schema/query
   stage-number   :- :int
   unique-name-fn :- fn?]
  (into []
        (mapcat (fn [join]
                  (map (partial add-source-and-desired-aliases join unique-name-fn)
                       (lib.metadata.calculation/metadata query stage-number join))))
        (when-let [joins (:joins (lib.util/query-stage query stage-number))]
          (ensure-all-joins-have-aliases query stage-number joins))))

(defmulti join-clause-method
  "Convert something to a join clause."
  {:arglists '([query stage-number x])}
  (fn [_query _stage-number x]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

;; TODO -- should the default implementation call [[metabase.lib.query/query]]? That way if we implement a method to
;; create an MBQL query from a `Table`, then we'd also get [[join]] support for free?

(defmethod join-clause-method :mbql/join
  [_query _stage-number a-join-clause]
  a-join-clause)

;;; TODO -- this probably ought to live in [[metabase.lib.query]]
(defmethod join-clause-method :mbql/query
  [_query _stage-number another-query]
  (-> {:lib/type :mbql/join
       :stages   (:stages (lib.util/pipeline another-query))}
      lib.options/ensure-uuid))

;;; TODO -- this probably ought to live in [[metabase.lib.stage]]
(defmethod join-clause-method :mbql.stage/mbql
  [_query _stage-number mbql-stage]
  (-> {:lib/type :mbql/join
       :stages   [mbql-stage]}
      lib.options/ensure-uuid))

(defmethod join-clause-method :dispatch-type/fn
  [query stage-number f]
  (join-clause-method query
                      stage-number
                      (or (f query stage-number)
                          (throw (ex-info "Error creating join clause: (f query stage-number) returned nil"
                                          {:query        query
                                           :stage-number stage-number
                                           :f            f})))))

(defn join-clause
  "Create an MBQL join map from something that can conceptually be joined against. A `Table`? An MBQL or native query? A
  Saved Question? You should be able to join anything, and this should return a sensible MBQL join map."
  ([x]
   (fn [query stage-number]
     (join-clause query stage-number x)))

  ([x conditions]
   (fn [query stage-number]
     (join-clause query stage-number x conditions)))

  ([query stage-number x]
   (join-clause-method query stage-number x))

  ([query stage-number x conditions]
   (cond-> (join-clause query stage-number x)
     conditions (assoc :conditions (mapv #(lib.common/->op-arg query stage-number %) conditions)))))

(defmulti with-join-fields-method
  "Impl for [[with-join-fields]]."
  {:arglists '([x fields])}
  (fn [x _fields]
    (lib.dispatch/dispatch-value x))
  :hierarchy lib.hierarchy/hierarchy)

(defmethod with-join-fields-method :dispatch-type/fn
  [f fields]
  (fn [query stage-number]
    (with-join-fields-method (f query stage-number) (if (keyword? fields)
                                                      fields
                                                      (mapv #(lib.common/->op-arg query stage-number %) fields)))))

(defmethod with-join-fields-method :mbql/join
  [join fields]
  (assoc join :fields fields))

(mu/defn with-join-fields
  "Update a join (or a function that will return a join) to include `:fields`, either `:all`, `:none`, or a sequence of
  references."
  [x fields]
  (with-join-fields-method x fields))

(defn- strip-id [s]
  (when (string? s)
    (str/trim (str/replace s #"(?i) id$" ""))))

(defn- similar-names [name0 name1]
  (and (string? name0) (string? name1)
       (let [plural1 (delay (inflections/plural name1))
             plural0 (delay (inflections/plural name0))]
         (or (= name0 name1)
             (= name0 @plural1)
             (= @plural0 name1)
             (= @plural0 @plural1)))))

(comment
  (similar-names "jellow" "yellow")
  (similar-names "yellow" "yellow")
  (similar-names "yellow" "yellows")
  (similar-names "yellow" "yellows")
  (similar-names "yellows" "yellows")
  (similar-names "cactus" "cacti")
  (similar-names "cactus" "cactuses")
  (similar-names "emacs" "emacsen")
  nil)

(defn- calculate-join-alias [query stage joined home-col]
  (let [joined-name (lib.metadata.calculation/display-name
                     (if (= (:lib/type joined) :mbql/query) joined query)
                     joined)
        home-name   (when home-col (strip-id (lib.metadata.calculation/display-name query home-col)))
        similar     (similar-names joined-name home-name)
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

(defn- add-alias-to-join-refs [form join-alias join-refs]
  (mbql.u/replace form
    (field :guard (fn [field-clause]
                    (and (field-clause? field-clause)
                         (some #(lib.equality/= field-clause %) join-refs))))
    (with-join-alias field join-alias)))

(comment
  (let [sideless-fields (mbql.u/match condition
                          (field :guard (fn [field-clause]
                                          (and (field-clause? field-clause)
                                               (not (contains? (lib.options/options field-clause)
                                                               :join-alias))
                                               (not-any? #(lib.equality/= field-clause %) home-refs)))))])
  nil)

(defn- add-alias-to-condition
  [condition join-alias home-refs join-refs]
  (let [condition (add-alias-to-join-refs condition join-alias join-refs)]
    ;; Sometimes conditions have field references which cannot be unambigously
    ;; assigned to one of the sides. The following code tries to deal with
    ;; these cases, but only for conditions that look like the ones generated
    ;; generated by the FE. These have the form home-field op join-field,
    ;; so we break ties by looking at the poisition of the field reference.
    (mbql.u/replace condition
      [op op-opts (lhs :guard field-clause?) (rhs :guard field-clause?)]
      (let [lhs-aliased (contains? (lib.options/options lhs) :join-alias)
            rhs-aliased (contains? (lib.options/options rhs) :join-alias)]
        (cond
          ;; no sides obviously belong to joined
          (not (or lhs-aliased rhs-aliased))
          (if (not-any? #(lib.equality/= rhs %) home-refs)
            [op op-opts lhs (with-join-alias rhs join-alias)]
            [op op-opts (with-join-alias lhs join-alias) rhs])

          ;; both sides seem to belong to joined assuming this resulted from
          ;; overly fuzzy matching, we remove the join alias from the LHS
          ;; unless the RHS seems to belong to home too while the LHS doen't
          (and lhs-aliased rhs-aliased)
          (let [bare-lhs (lib.options/update-options lhs dissoc :join-alias)
                bare-rhs (lib.options/update-options rhs dissoc :join-alias)]
            (if (and (not-any? #(lib.equality/= bare-lhs %) home-refs)
                     (some #(lib.equality/= bare-rhs %) home-refs))
              [op op-opts lhs bare-rhs]
              [op op-opts bare-lhs rhs]))

          ;; we leave alone the condition otherwise
          :else &match)))))

(defn- fk-or-first [cols]
  (or (m/find-first lib.types.isa/foreign-key? cols)
      (first cols)))

(mu/defn join :- ::lib.schema/query
  "Create a join map as if by [[join-clause]] and add it to a `query`.

  `conditions` is currently required, but in the future I think we should make this smarter and try to infer sensible
  default conditions for things, e.g. when joining a Table B from Table A, if there is an FK relationship between A and
  B, join via that relationship. Not yet implemented!"
  ([query a-join-clause]
   (join query -1 a-join-clause (:conditions a-join-clause)))

  ([query x conditions]
   (join query -1 x conditions))

  ([query stage-number x conditions]
   (let [stage-number (or stage-number -1)
         stage        (lib.util/query-stage query stage-number)
         joined       (if (fn? x) (x query stage) x)
         new-join     (if (seq conditions)
                        (join-clause query stage-number joined conditions)
                        (join-clause query stage-number joined))
         new-join     (if (contains? new-join :alias)
                        ;; if the join clause comes with an alias, keep it and assume that the
                        ;; condition fields have the right join-aliases too
                        new-join
                        (let [home-cols    (lib.metadata.calculation/visible-columns query stage-number stage)
                              home-refs    (mapv lib.ref/ref home-cols)
                              cond-fields  (mbql.u/match conditions :field)
                              home-col     (or (fk-or-first (filter (comp (set cond-fields) lib.ref/ref)
                                                                    home-cols))
                                               (fk-or-first home-cols))
                              join-refs    (mapv lib.ref/ref
                                                 (if (= (:lib/type joined) :mbql/query)
                                                   (lib.metadata.calculation/metadata joined)
                                                   (lib.metadata.calculation/metadata query stage-number joined)))
                              join-alias   (calculate-join-alias query stage joined home-col)]
                          (with-join-alias
                            (update new-join :conditions
                                    (fn [conditions]
                                      (mapv #(add-alias-to-condition % join-alias home-refs join-refs)
                                            conditions)))
                            join-alias)))]
     (lib.util/update-query-stage query stage-number update :joins (fn [joins]
                                                                     (conj (vec joins) new-join))))))

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

(mu/defn with-join-strategy :- [:or ::lib.schema.join/join fn?]
  "Return a copy of `a-join` with its `:strategy` set to `strategy`."
  [a-join   :- [:or
                ::lib.schema.join/join
                fn?]
   strategy :- ::lib.schema.join/strategy]
  (if (fn? a-join)
    (fn [query stage-metadata]
      (with-join-strategy (a-join query stage-metadata) strategy))
    (assoc a-join :strategy strategy)))

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
  is the one that belongs to the thing being joined, `joined-thing`, which can be something like a
  Table ([[metabase.lib.metadata/TableMetadata]]), Saved Question/Model ([[metabase.lib.metadata/CardMetadata]]),
  another query, etc. -- anything you can pass to [[join-clause]].

  If the lhs-hand-side column has already been chosen (they can be chosen in any order in the Query Builder UI),
  pass in the chosen LHS column. In the future, this may be used to restrict results to compatible columns. (See #31174)

  Results will be returned in a 'somewhat smart' order with PKs and FKs returned before other columns."
  ([query joined-thing lhs-column-or-nil]
   (join-condition-rhs-columns query -1 joined-thing lhs-column-or-nil))

  ([query              :- ::lib.schema/query
    stage-number       :- :int
    joined-thing
    ;; not yet used, hopefully we will use in the future when present for filtering incompatible columns out.
    _lhs-column-or-nil :- [:maybe lib.metadata/ColumnMetadata]]
   ;; I was on the fence about whether these should get `:lib/source :source/joins` or not -- it seems like based on
   ;; the QB UI they shouldn't. See screenshots in #31174
   (sort-join-condition-columns
    (lib.metadata.calculation/visible-columns query stage-number joined-thing {:include-implicitly-joinable? false}))))

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
   [{:lib/type :mbql.filter/operator, :short :=, :display-name  (i18n/tru "Equal to")}
    {:lib/type :mbql.filter/operator, :short :>, :display-name  (i18n/tru "Greater than")}
    {:lib/type :mbql.filter/operator, :short :<, :display-name  (i18n/tru "Less than")}
    {:lib/type :mbql.filter/operator, :short :>=, :display-name (i18n/tru "Greater than or equal to")}
    {:lib/type :mbql.filter/operator, :short :<=, :display-name (i18n/tru "Less than or equal to")}
    {:lib/type :mbql.filter/operator, :short :!=, :display-name (i18n/tru "Not equal to")}]))

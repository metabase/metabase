(ns metabase.lib.metadata.calculate
  "Code for calculating metadata for a column in MBQL results. Adapted from code
  in [[metabase.query-processor.middleware.annotate]]."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.util :as mut]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.util :as mbql.u]
   [metabase.mbql.util.match :as mbql.match]
   [metabase.models.humanization.impl :as humanization.impl]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(def ^:private ColumnMetadataWithFieldRef
  (mut/merge
   lib.metadata/ColumnMetadata
   [:map
    [:field_ref ::lib.schema.ref/ref]]))

(defn- field-clause? [x]
  (and (vector? x)
       (= (first x) :field)))

(def ^:private ^{:arglists '([x])} aggregation-clause?
  (mc/validator ::lib.schema.aggregation/aggregation))

(mu/defn ^:private join-with-alias :- [:maybe ::lib.schema.join/join]
  [query        :- ::lib.schema/query
   stage-number :- :int
   join-alias   :- ::lib.schema.common/non-blank-string]
  (let [{:keys [joins]} (lib.util/query-stage query stage-number)]
    (or (some
         (fn [join]
           (when (= (:alias join) join-alias)
             join))
         joins)
        (when-let [previous-stage-number (lib.util/previous-stage-number query stage-number)]
          (recur query previous-stage-number join-alias)))))

(mu/defn ^:private field-metadata :- [:maybe lib.metadata/ColumnMetadata]
  [query        :- ::lib.schema/query
   stage-number :- :int
   field-id-or-name]
  (try
    (or (when (string? field-id-or-name)
          (lib.metadata/stage-column query stage-number field-id-or-name))
        (when (integer? field-id-or-name)
          (lib.metadata/field query field-id-or-name)))
    (catch #?(:clj Throwable :cljs js/Error) e
      (throw (ex-info (i18n/tru "Error calculating metadata for Field {0}: {1}" (pr-str field-id-or-name) (ex-message e))
                      {:query query, :stage-number stage-number, :field field-id-or-name}
                      e)))))

(mu/defn ^:private display-name-for-joined-field :- ::lib.schema.common/non-blank-string
  "Return an appropriate display name for a joined field. For *explicitly* joined Fields, the qualifier is the join
  alias; for implicitly joined fields, it is the display name of the foreign key used to create the join."
  [query                                    :- ::lib.schema/query
   stage-number                             :- :int
   field-display-name                       :- ::lib.schema.common/non-blank-string
   {:keys [fk-field-id], join-alias :alias} :- ::lib.schema.join/join]
  (let [fk-field-metadata (when fk-field-id
                            (field-metadata query stage-number fk-field-id))
        qualifier         (if fk-field-id
                            ;; strip off trailing ` id` from FK display name
                            (str/replace (:display_name fk-field-metadata)
                                         #"(?i)\sid$"
                                         "")
                            join-alias)]
    (str qualifier " → " field-display-name)))

(defn- datetime-arithmetics?
  "Helper for [[infer-expression-type]] query. Returns true if a given clause returns a :type/DateTime type."
  [clause]
  (mbql.match/match-one clause
    #{:datetime-add :datetime-subtract :relative-datetime}
    true

    [:field (_opts :guard :temporal-unit) _id-or-name]
    true

    :+
    (some (partial mbql.u/is-clause? :interval) (rest clause))

    _ false))

(declare col-info-for-field-clause)

(def type-info-columns
  "Columns to select from a field to get its type information without getting information that is specific to that
  column."
  [:base_type :effective_type :coercion_strategy :semantic_type])

(mu/defn infer-expression-type :- [:map
                                   [:base_type ::lib.schema.ref/base-type]]
  "Infer base-type/semantic-type information about an `expression` clause."
  [query        :- ::lib.schema/query
   stage-number :- :int
   expression   :- ::lib.schema.expression/expression]
  (cond
    (mc/validate ::lib.schema.expression/boolean expression)
    {:base_type :type/Boolean}

    (or (mc/validate ::lib.schema.expression/string expression)
        (mbql.u/is-clause? mbql.s/string-functions expression))
    {:base_type :type/Text}

    (mc/validate ::lib.schema.expression/integer expression)
    {:base_type :type/Integer}

    ;; because I was probably on drugs when I came up with the type hierarchy in [[metabase.types]], the root base
    ;; type for any number that has a decimal place is `:type/Float`, regardless of how floating that point is or
    ;; isn't. Rather than try to unpack that whole thing right now, let's just continue using `:type/Float` to mean
    ;; any number with a decimal place.
    (mc/validate ::lib.schema.expression/decimal expression)
    {:base_type :type/Float}

    (mbql.u/is-clause? mbql.s/numeric-functions expression)
    {:base_type :type/Number}

    (mc/validate ::lib.schema.expression/temporal expression)
    {:base_type :type/Temporal}

    (mbql.u/is-clause? :field expression)
    (col-info-for-field-clause query stage-number expression)

    (mbql.u/is-clause? :coalesce expression)
    (select-keys (infer-expression-type query stage-number (second expression))
                 type-info-columns)

    (mbql.u/is-clause? :case expression)
    (let [[_ clauses] expression]
      (some
       (fn [[_ expression]]
         ;; get the first non-nil val
         (when (and (not= expression nil)
                    (or (not (mbql.u/is-clause? :value expression))
                        (let [[_ value] expression]
                          (not= value nil))))
           (select-keys (infer-expression-type query stage-number expression)
                        type-info-columns)))
       clauses))

    (mbql.u/is-clause? :convert-timezone expression)
    {:converted_timezone (nth expression 2)
     :base_type          :type/DateTime}

    (datetime-arithmetics? expression)
    ;; make sure converted_timezone survived if we do nested datetime operations
    ;; FIXME: this does not preserve converted_timezone for cases nested expressions
    ;; i.e:
    ;; {"expression" {"converted-exp" [:convert-timezone "created-at" "Asia/Ho_Chi_Minh"]
    ;;                "date-add-exp"  [:datetime-add [:expression "converted-exp"] 2 :month]}}
    ;; The converted_timezone metadata added for "converted-exp" will not be brought over
    ;; to ["date-add-exp"].
    ;; maybe this `infer-expression-type query` should takes an `stage` and look up the
    ;; source expresison as well?
    (merge (select-keys (infer-expression-type query stage-number (second expression))
                        [:converted_timezone])
     {:base_type :type/DateTime})
    :else
    {:base_type :type/*}))

(mu/defn ^:private expression-with-name :- ::lib.schema.expression/expression
  [query           :- ::lib.schema/query
   stage-number    :- :int
   expression-name :- ::lib.schema.common/non-blank-string]
  (let [{:keys [expressions]} (lib.util/query-stage query stage-number)]
    (or (get expressions expression-name)
        (when-let [previous-stage-number (lib.util/previous-stage-number query stage-number)]
          (expression-with-name query previous-stage-number expression-name))
        (throw (ex-info (i18n/tru "No expression named {0}" (pr-str expression-name))
                        {:expression-name expression-name
                         :found           (set (keys expressions))})))))

(mu/defn ^:private col-info-for-expression :- ColumnMetadataWithFieldRef
  [query                                :- ::lib.schema/query
   stage-number                         :- :int
   [_ _opts expression-name :as clause] :- ::lib.schema.ref/expression]
  (merge
   (let [expression-definition (expression-with-name query stage-number expression-name)]
     (infer-expression-type query stage-number expression-definition))
   {:lib/type        :metadata/field
    :name            expression-name
    :display_name    expression-name
    ;; provided so the FE can add easily add sorts and the like when someone clicks a column header
    :expression_name expression-name
    :field_ref       (lib.options/ensure-uuid clause)}))

(mu/defn ^:private col-info-for-field-clause* :- ColumnMetadataWithFieldRef
  [query                          :- ::lib.schema/query
   stage-number                   :- :int
   [_ opts id-or-name :as clause] :- ::lib.schema.ref/field]
  (let [join                   (when (:join-alias opts)
                                 (join-with-alias query stage-number (:join-alias opts)))
        join-is-in-this-stage? (some #(= (:alias %) (:join-alias opts))
                                     (:joins (lib.util/query-stage query stage-number)))
        ;; record additional information that may have been added by middleware. Sometimes pre-processing middleware
        ;; needs to add extra info to track things that it did (e.g. the
        ;; [[metabase.query-processor.middleware.add-dimension-projections]] pre-processing middleware adds keys to
        ;; track which Fields it adds or needs to remap, and then the post-processing middleware does the actual
        ;; remapping based on that info)
        namespaced-options     (not-empty (into {}
                                                (filter (fn [[k _v]]
                                                          (and (keyword? k) (namespace k))))
                                                opts))]
    ;; TODO -- I think we actually need two `:field_ref` columns -- one for referring to the Field at the SAME
    ;; level, and one for referring to the Field from the PARENT level.
    (cond-> {:lib/type  :metadata/field
             :field_ref (lib.options/ensure-uuid clause)}
      (:base-type opts)
      (assoc :base_type (:base-type opts))

      namespaced-options
      (assoc :options namespaced-options)

      (string? id-or-name)
      (merge (or (field-metadata query stage-number id-or-name)
                 {:name         id-or-name
                  :display_name (humanization.impl/name->human-readable-name :simple id-or-name)}))

      (integer? id-or-name)
      (merge (let [{parent-id :parent_id, :as field} (field-metadata query stage-number id-or-name)]
               (if-not parent-id
                 field
                 (let [parent (->> [:field {} parent-id]
                                   lib.options/ensure-uuid
                                   (col-info-for-field-clause query stage-number))]
                   (update field :name #(str (:name parent) \. %))))))

      (:binning opts)
      (assoc :binning_info (-> (:binning opts)
                               (set/rename-keys {:strategy :binning-strategy})
                               u/snake-keys))

      (:temporal-unit opts)
      (assoc :unit (:temporal-unit opts))

      (or (:join-alias opts) (:alias join))
      (assoc :source_alias (or (:join-alias opts) (:alias join)))

      join
      (update :display_name (partial display-name-for-joined-field query stage-number) join)

      ;; Join with fk-field-id => IMPLICIT JOIN
      ;; Join w/o fk-field-id  => EXPLICIT JOIN
      (:fk-field-id join)
      (assoc :fk_field_id (:fk-field-id join))

      ;; For IMPLICIT joins, remove `:join-alias` in the resulting Field ref -- it got added there during
      ;; preprocessing by us, and wasn't there originally. Make sure the ref has `:source-field`.
      (:fk-field-id join)
      (update :field_ref (fn [[clause opts x]]
                           (let [opts (-> opts
                                          (dissoc :join-alias)
                                          (assoc :source-field (:fk-field-id join)))]
                             [clause opts x])))

      ;; If source Field (for an IMPLICIT join) is specified in either the field ref or matching join, make sure we
      ;; return it as `fk_field_id`. (Not sure what situations it would actually be present in one but not the other
      ;; -- but it's in the tests :confused:)
      (or (:source-field opts)
          (:fk-field-id join))
      (assoc :fk_field_id (or (:source-field opts)
                              (:fk-field-id join)))

      ;; If the source query is from a saved question, remove the join alias as the caller should not be aware of joins
      ;; happening inside the saved question. The `not join-is-in-this-stage?` check is to ensure that we are not
      ;; removing `:join-alias` from fields from the right side of the join.
      (and (when-let [previous-stage-number (lib.util/previous-stage-number query stage-number)]
             ;; HACK
             (let [previous-stage (lib.util/query-stage query previous-stage-number)]
               (string? (:source-table previous-stage))))
           (not join-is-in-this-stage?))
      (update :field_ref (fn [[clause opts x]]
                           (let [opts (dissoc opts :join-alias)]
                             [clause opts x]))))))

(mu/defn ^:private col-info-for-field-clause :- ColumnMetadataWithFieldRef
  "Return results column metadata for a `:field` or `:expression` clause, in the format that gets returned by QP results"
  [query        :- ::lib.schema/query
   stage-number :- :int
   clause       :- ::lib.schema.ref/ref]
  (mbql.u/match-one clause
    :expression
    (col-info-for-expression query stage-number &match)

    :field
    (col-info-for-field-clause* query stage-number &match)

    ;; we should never reach this if our patterns are written right so this is more to catch code mistakes than
    ;; something the user should expect to see
    _
    (throw (ex-info (i18n/tru "Don''t know how to get information about Field: {0}" &match)
                    {:field &match}))))


;;; ---------------------------------------------- Aggregate Field Info ----------------------------------------------

(defn- expression-arg-display-name
  "Generate an appropriate name for an `arg` in an expression aggregation."
  [recursive-name-fn arg]
  (mbql.u/match-one arg
    ;; if the arg itself is a nested expression, recursively find a name for it, and wrap in parens
    [(_ :guard #{:+ :- :/ :*}) & _]
    (str "(" (recursive-name-fn &match) ")")

    ;; if the arg is another aggregation, recurse to get its name. (Only aggregations, nested expressions, or numbers
    ;; are allowed as args to expression aggregations; thus anything that's an MBQL clause, but not a nested
    ;; expression, is a ag clause.)
    [(_ :guard keyword?) & _]
    (recursive-name-fn &match)

    ;; otherwise for things like numbers just use that directly
    _ &match))

;;; TODO -- used by QP
(mu/defn aggregation-name :- ::lib.schema.common/non-blank-string
  "Return an appropriate aggregation name/alias *used inside a query* for an `:aggregation` subclause (an aggregation
  or expression). Takes an options map as schema won't support passing keypairs directly as a varargs.

  These names are also used directly in queries, e.g. in the equivalent of a SQL `AS` clause."
  [ag-clause :- ::lib.schema.aggregation/aggregation]
  (mbql.u/match-one ag-clause
    [:aggregation-options _ (options :guard :name)]
    (:name options)

    [:aggregation-options ag _]
    #_:clj-kondo/ignore
    (recur ag)

    ;; For unnamed expressions, just compute a name like "sum + count"
    ;; Top level expressions need a name without a leading __ as those are automatically removed from the results
    [(operator :guard #{:+ :- :/ :*}) & args]
    "expression"

    ;; for historic reasons a distinct count clause is still named "count". Don't change this or you might break FE
    ;; stuff that keys off of aggregation names.
    ;;
    ;; `cum-count` and `cum-sum` get the same names as the non-cumulative versions, due to limitations (they are
    ;; written out of the query before we ever see them). For other code that makes use of this function give them
    ;; the correct names to expect.
    [(_ :guard #{:distinct :cum-count}) _]
    "count"

    [:cum-sum _]
    "sum"

    ;; for any other aggregation just use the name of the clause e.g. `sum`.
    [clause-name & _]
    (name clause-name)))

(declare aggregation-display-name)

(mu/defn ^:private aggregation-arg-display-name :- ::lib.schema.common/non-blank-string
  "Name to use for an aggregation clause argument such as a Field when constructing the complete aggregation name."
  [query stage-number ag-arg]
  (or (when (field-clause? ag-arg)
        (when-let [info (col-info-for-field-clause query stage-number ag-arg)]
          (some info [:display_name :name])))
      (aggregation-display-name query stage-number ag-arg)))

(mu/defn aggregation-display-name :- ::lib.schema.common/non-blank-string
  "Return an appropriate user-facing display name for an aggregation clause."
  [query        :- ::lib.schema/query
   stage-number :- :int
   ag-clause    :- ::lib.schema.aggregation/aggregation]
  (mbql.u/match-one ag-clause
    [:aggregation-options _ (options :guard :display-name)]
    (:display-name options)

    [:aggregation-options ag _]
    #_:clj-kondo/ignore
    (recur ag)

    [(operator :guard #{:+ :- :/ :*}) & args]
    (str/join (format " %s " (name operator))
              (for [arg args]
                (expression-arg-display-name (partial aggregation-arg-display-name query stage-number) arg)))

    [:count       _opts]       (i18n/tru "Count")
    [:case        _opts]       (i18n/tru "Case")
    [:distinct    _opts arg]   (i18n/tru "Distinct values of {0}"    (aggregation-arg-display-name query stage-number arg))
    [:count       _opts arg]   (i18n/tru "Count of {0}"              (aggregation-arg-display-name query stage-number arg))
    [:avg         _opts arg]   (i18n/tru "Average of {0}"            (aggregation-arg-display-name query stage-number arg))
    ;; cum-count and cum-sum get names for count and sum, respectively (see explanation in `aggregation-name`)
    [:cum-count   _opts arg]   (i18n/tru "Count of {0}"              (aggregation-arg-display-name query stage-number arg))
    [:cum-sum     _opts arg]   (i18n/tru "Sum of {0}"                (aggregation-arg-display-name query stage-number arg))
    [:stddev      _opts arg]   (i18n/tru "SD of {0}"                 (aggregation-arg-display-name query stage-number arg))
    [:sum         _opts arg]   (i18n/tru "Sum of {0}"                (aggregation-arg-display-name query stage-number arg))
    [:min         _opts arg]   (i18n/tru "Min of {0}"                (aggregation-arg-display-name query stage-number arg))
    [:max         _opts arg]   (i18n/tru "Max of {0}"                (aggregation-arg-display-name query stage-number arg))
    [:var         _opts arg]   (i18n/tru "Variance of {0}"           (aggregation-arg-display-name query stage-number arg))
    [:median      _opts arg]   (i18n/tru "Median of {0}"             (aggregation-arg-display-name query stage-number arg))
    [:percentile  _opts arg p] (i18n/tru "{0}th percentile of {1}" p (aggregation-arg-display-name query stage-number arg))

    ;; until we have a way to generate good names for filters we'll just have to say 'matching condition' for now
    [:sum-where   arg _] (i18n/tru "Sum of {0} matching condition" (aggregation-arg-display-name query stage-number arg))
    [:share       _]     (i18n/tru "Share of rows matching condition")
    [:count-where _]     (i18n/tru "Count of rows matching condition")

    (_ :guard field-clause?)
    (:display_name (col-info-for-field-clause query stage-number ag-clause))

    _
    (aggregation-name ag-clause)))

(mu/defn ^:private ag->name-info
  [query        :- ::lib.schema/query
   stage-number :- :int
   ag           :- ::lib.schema.aggregation/aggregation]
  {:lib/type     :metadata/field
   :name         (aggregation-name ag)
   :display_name (aggregation-display-name query stage-number ag)})

(mu/defn col-info-for-aggregation-clause
  "Return appropriate column metadata for an `:aggregation` clause."
  ;; `clause` is normally an aggregation clause but this function can call itself recursively; see comments by the
  ;; `match` pattern for field clauses below
  [query        :- ::lib.schema/query
   stage-number :- :int
   clause]
  (mbql.u/match-one clause
    ;; ok, if this is a aggregation w/ options recurse so we can get information about the ag it wraps
    [:aggregation-options ag _]
    (merge
     (col-info-for-aggregation-clause query stage-number ag)
     (ag->name-info query stage-number &match))

    ;; Always treat count or distinct count as an integer even if the DB in question returns it as something
    ;; wacky like a BigDecimal or Float
    [(_ :guard #{:count :distinct}) _opts & args]
    (merge
     (col-info-for-aggregation-clause query stage-number args)
     {:base_type     :type/BigInteger
      :semantic_type :type/Quantity}
     (ag->name-info query stage-number &match))

    :count-where
    (merge
     {:base_type     :type/Integer
      :semantic_type :type/Quantity}
     (ag->name-info query stage-number &match))

    :share
    (merge
     {:base_type     :type/Float
      :semantic_type :type/Share}
     (ag->name-info query stage-number &match))

    ;; get info from a Field if we can (theses Fields are matched when ag clauses recursively call
    ;; `col-info-for-ag-clause`, and this info is added into the results)
    (_ :guard field-clause?)
    (select-keys (col-info-for-field-clause query stage-number &match) [:base_type :semantic_type :settings])

    :expression
    (let [[_expression _opts expression-name :as _expression-ref] &match]
      (merge (infer-expression-type query stage-number (expression-with-name query stage-number expression-name))
             {:display_name expression-name}))

    #{:+ :- :/ :*}
    (merge
     (infer-expression-type query stage-number &match)
     (when (aggregation-clause? &match)
       (ag->name-info query stage-number &match)))

    ;; the type returned by a case statement depends on what its expressions are; we'll just return the type info for
    ;; the first expression for the time being. I guess it's possible the expression might return a string for one
    ;; case and a number for another, but I think in post cases it should be the same type for every clause.
    :case
    (merge
     (infer-expression-type query stage-number &match)
     (ag->name-info query stage-number &match))

    ;; get name/display-name of this ag
    [(_ :guard keyword?) _opts arg]
    (merge
     (println "(col-info-for-aggregation-clause query stage-number arg):" (col-info-for-aggregation-clause query stage-number arg)) ; NOCOMMIT
     (col-info-for-aggregation-clause query stage-number arg)
     (println "(ag->name-info query stage-number &match):" (ag->name-info query stage-number &match)) ; NOCOMMIT
     (ag->name-info query stage-number &match))))

(mu/defn ^:private cols-for-fields :- [:sequential lib.metadata/ColumnMetadata]
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (let [{:keys [fields], :as _stage} (lib.util/query-stage query stage-number)]
    (for [field fields]
      (assoc (col-info-for-field-clause query stage-number field)
             :source :fields))))

(mu/defn ^:private cols-for-ags-and-breakouts :- [:sequential lib.metadata/ColumnMetadata]
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (let [{aggregations :aggregation, breakouts :breakout, :as _stage} (lib.util/query-stage query stage-number)]
    (into []
          cat
          [(for [breakout breakouts]
             (assoc (col-info-for-field-clause query stage-number breakout)
                    :source :breakout))
           (map-indexed (fn [i aggregation]
                          (assoc (col-info-for-aggregation-clause query stage-number aggregation)
                                 :source    :aggregation
                                 :field_ref (lib.options/ensure-uuid [:aggregation i])))
                        aggregations)])))

(defn- remove-hidden-default-fields
  "Remove Fields that shouldn't be visible from the default Fields for a source Table.
  See [[metabase.query-processor.middleware.add-implicit-clauses/table->sorted-fields*]]."
  [field-metadatas]
  (remove (fn [{visibility-type :visibility_type, active? :active, :as _field-metadata}]
            (or (false? active?)
                (#{:sensitive :retired} (some-> visibility-type keyword))))
          field-metadatas))

(defn- sort-default-fields
  "Sort default Fields for a source Table. See [[metabase.models.table/field-order-rule]]."
  [field-metadatas]
  (sort-by (fn [{field-name :name, :keys [position], :as _field-metadata}]
             [(or position 0) (u/lower-case-en (or field-name ""))])
           field-metadatas))

(mu/defn ^:private source-table-default-metadata :- [:maybe [:sequential lib.metadata/ColumnMetadata]]
  "Determine the Fields we'd normally return for a source Table.
  See [[metabase.query-processor.middleware.add-implicit-clauses/add-implicit-fields]]."
  [query          :- ::lib.schema/query
   table-metadata :- lib.metadata/TableMetadata]
  (when-let [field-metadatas (not-empty (lib.metadata/fields query (:id table-metadata)))]
    (->> field-metadatas
         remove-hidden-default-fields
         sort-default-fields)))

(defn- fields-from-join
  "Add additional fields from a single `join` to stage metadata."
  [_query _stage-number _join]
  ;; TODO
  [])

(mu/defn ^:private fields-from-joins :- [:sequential lib.metadata/ColumnMetadata]
  "Add additional fields from the `joins` to stage metadata."
  [query stage-number joins]
  (into []
        (mapcat (fn [join]
                  (fields-from-join query stage-number join)))
        joins))

(mu/defn ^:private default-fields :- [:sequential lib.metadata/ColumnMetadata]
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (let [{:keys [source-table joins], :as stage} (lib.util/query-stage query stage-number)]
    (concat (if-let [previous-stage-number (lib.util/previous-stage-number stage stage-number)]
              (let [previous-stage (lib.util/query-stage query previous-stage-number)]
                (some-> previous-stage :lib.metadata/stage :columns))
              (when (integer? source-table)
                (source-table-default-metadata
                 query
                 (lib.metadata/table query source-table))))
            (fields-from-joins query stage-number joins))))

(mu/defn stage-metadata :- lib.metadata/StageMetadata
  "Return results metadata about the expected columns in an MBQL query stage. If the query has
  aggregations/breakouts/fields, then return THOSE. Otherwise return the defaults based on the source Table or
  previous stage."
  ([query :- ::lib.schema/query]
   (stage-metadata query -1))

  ([query        :- ::lib.schema/query
    stage-number :- :int]
   (or (not-empty (into []
                        cat
                        [(cols-for-ags-and-breakouts query stage-number)
                         (cols-for-fields query stage-number)]))
       (default-fields query stage-number))))

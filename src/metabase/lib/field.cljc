(ns metabase.lib.field
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.card :as lib.card]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.remove-replace :as lib.remove-replace]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.schema.temporal-bucketing
    :as lib.schema.temporal-bucketing]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.shared.util.time :as shared.ut]
   [metabase.util :as u]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defn- normalize-binning-options [opts]
  (lib.normalize/normalize-map
   opts
   keyword
   {:strategy keyword}))

(defn- normalize-field-options [opts]
  (lib.normalize/normalize-map
   opts
   keyword
   {:temporal-unit keyword
    :binning       normalize-binning-options}))

(defmethod lib.normalize/normalize :field
  [[tag opts id-or-name]]
  [(keyword tag) (normalize-field-options opts) id-or-name])

(mu/defn ^:private resolve-field-id :- lib.metadata/ColumnMetadata
  "Integer Field ID: get metadata from the metadata provider. If this is the first stage of the query, merge in
  Saved Question metadata if available."
  [query        :- ::lib.schema/query
   stage-number :- :int
   field-id     :- ::lib.schema.id/field]
  (merge
   (when (lib.util/first-stage? query stage-number)
     (when-let [card-id (lib.util/source-card-id query)]
       (when-let [card-metadata (lib.card/saved-question-metadata query card-id)]
         (m/find-first #(= (:id %) field-id)
                       card-metadata))))
   (try
     (lib.metadata/field query field-id)
     (catch #?(:clj Throwable :cljs :default) _
       nil))))

(mu/defn ^:private resolve-column-name-in-metadata :- [:maybe lib.metadata/ColumnMetadata]
  [column-name      :- ::lib.schema.common/non-blank-string
   column-metadatas :- [:sequential lib.metadata/ColumnMetadata]]
  (or (m/find-first #(= (:lib/desired-column-alias %) column-name)
                    column-metadatas)
      (m/find-first #(= (:name %) column-name)
                    column-metadatas)
      (do
        (log/warn (i18n/tru "Invalid :field clause: column {0} does not exist. Found: {1}"
                            (pr-str column-name)
                            (pr-str (mapv :lib/desired-column-alias column-metadatas))))
        nil)))

(def ^:private ^:dynamic *recursive-column-resolution-by-name*
  "Whether we're in a recursive call to [[resolve-column-name]] or not. Prevent infinite recursion (#32063)"
  false)

(mu/defn ^:private resolve-column-name :- [:maybe lib.metadata/ColumnMetadata]
  "String column name: get metadata from the previous stage, if it exists, otherwise if this is the first stage and we
  have a native query or a Saved Question source query or whatever get it from our results metadata."
  [query        :- ::lib.schema/query
   stage-number :- :int
   column-name  :- ::lib.schema.common/non-blank-string]
  (when-not *recursive-column-resolution-by-name*
    (binding [*recursive-column-resolution-by-name* true]
      (let [previous-stage-number (lib.util/previous-stage-number query stage-number)
            stage                 (if previous-stage-number
                                    (lib.util/query-stage query previous-stage-number)
                                    (lib.util/query-stage query stage-number))
            ;; TODO -- it seems a little icky that the existence of `:metabase.lib.stage/cached-metadata` is leaking
            ;; here, we should look in to fixing this if we can.
            stage-columns         (or (:metabase.lib.stage/cached-metadata stage)
                                      (get-in stage [:lib/stage-metadata :columns])
                                      (when (or (:source-card  stage)
                                                (:source-table stage)
                                                (:expressions  stage)
                                                (:fields       stage))
                                        (lib.metadata.calculation/visible-columns query stage-number stage))
                                      (log/warn (i18n/tru "Cannot resolve column {0}: stage has no metadata"
                                                          (pr-str column-name))))]
        (when-let [column (and (seq stage-columns)
                               (resolve-column-name-in-metadata column-name stage-columns))]
          (cond-> column
            previous-stage-number (-> (dissoc :id :table-id
                                              ::binning ::temporal-unit)
                                      (lib.join/with-join-alias nil)
                                      (assoc :name (or (:lib/desired-column-alias column) (:name column)))
                                      (assoc :lib/source :source/previous-stage))))))))

(mu/defn ^:private resolve-field-metadata :- lib.metadata/ColumnMetadata
  "Resolve metadata for a `:field` ref. This is part of the implementation
  for [[lib.metadata.calculation/metadata-method]] a `:field` clause."
  [query                                                                 :- ::lib.schema/query
   stage-number                                                          :- :int
   [_field {:keys [join-alias], :as opts} id-or-name, :as _field-clause] :- :mbql.clause/field]
  (let [metadata (merge
                  (when-let [base-type (:base-type opts)]
                    {:base-type base-type})
                  (when-let [effective-type ((some-fn :effective-type :base-type) opts)]
                    {:effective-type effective-type})
                  ;; TODO -- some of the other stuff in `opts` probably ought to be merged in here as well. Also, if
                  ;; the Field is temporally bucketed, the base-type/effective-type would probably be affected, right?
                  ;; We should probably be taking that into consideration?
                  (when-let [binning (:binning opts)]
                    {::binning binning})
                  (when-let [unit (:temporal-unit opts)]
                    {::temporal-unit unit})
                  (cond
                    (integer? id-or-name) (resolve-field-id query stage-number id-or-name)
                    join-alias            {:lib/type :metadata/column, :name id-or-name}
                    :else                 (or (resolve-column-name query stage-number id-or-name)
                                              {:lib/type :metadata/column
                                               :name     id-or-name})))]
    (cond-> metadata
      join-alias (lib.join/with-join-alias join-alias))))

(mu/defn ^:private add-parent-column-metadata
  "If this is a nested column, add metadata about the parent column."
  [query    :- ::lib.schema/query
   metadata :- lib.metadata/ColumnMetadata]
  (let [parent-metadata     (lib.metadata/field query (:parent-id metadata))
        {parent-name :name} (cond->> parent-metadata
                              (:parent-id parent-metadata) (add-parent-column-metadata query))]
    (update metadata :name (fn [field-name]
                             (str parent-name \. field-name)))))

(defn- column-metadata-effective-type
  "Effective type of a column when taking the `::temporal-unit` into account. If we have a temporal extraction like
  `:month-of-year`, then this actually returns an integer rather than the 'original` effective type of `:type/Date` or
  whatever."
  [{::keys [temporal-unit], :as column-metadata}]
  (if (and temporal-unit
           (contains? lib.schema.temporal-bucketing/datetime-extraction-units temporal-unit))
    :type/Integer
    ((some-fn :effective-type :base-type) column-metadata)))

(defmethod lib.metadata.calculation/type-of-method :metadata/column
  [_query _stage-number column-metadata]
  (column-metadata-effective-type column-metadata))

(defmethod lib.metadata.calculation/type-of-method :field
  [query stage-number [_tag {:keys [temporal-unit], :as _opts} _id-or-name :as field-ref]]
  (let [metadata (cond-> (resolve-field-metadata query stage-number field-ref)
                   temporal-unit (assoc ::temporal-unit temporal-unit))]
    (lib.metadata.calculation/type-of query stage-number metadata)))

(defmethod lib.metadata.calculation/metadata-method :metadata/column
  [_query _stage-number {field-name :name, :as field-metadata}]
  (assoc field-metadata :name field-name))

(defn extend-column-metadata-from-ref
  "Extend column metadata `metadata` with information specific to `field-ref` in `query` at stage `stage-number`.
  `metadata` should be the metadata of a resolved field or a visible column matching `field-ref`."
  [query
   stage-number
   metadata
   [_tag {source-uuid :lib/uuid :keys [base-type binning effective-type join-alias source-field temporal-unit], :as opts} :as field-ref]]
  (let [metadata (merge
                  {:lib/type        :metadata/column
                   :lib/source-uuid source-uuid}
                  metadata
                  {:display-name (or (:display-name opts)
                                     (lib.metadata.calculation/display-name query stage-number field-ref))})]
    (cond-> metadata
      effective-type (assoc :effective-type effective-type)
      base-type      (assoc :base-type base-type)
      temporal-unit  (assoc ::temporal-unit temporal-unit)
      binning        (assoc ::binning binning)
      source-field   (assoc :fk-field-id source-field)
      join-alias     (lib.join/with-join-alias join-alias))))

;;; TODO -- effective type should be affected by `temporal-unit`, right?
(defmethod lib.metadata.calculation/metadata-method :field
  [query stage-number field-ref]
  (let [field-metadata (resolve-field-metadata query stage-number field-ref)
        metadata       (extend-column-metadata-from-ref query stage-number field-metadata field-ref)]
    (cond->> metadata
      (:parent-id metadata) (add-parent-column-metadata query))))

(defn- table-metadata
  "Work around the fact that sometimes columns in results metadata come back with legacy `card__<id>` `:table-id`s.
  TODO: It would probably be nice to have the metadata providers parse these into a `:card-id` or something as they
  come in, sort of like what we do with legacy queries in [[metabase.lib.convert]], but this will have to be good
  enough for now."
  [query table-id]
  (cond
    (string? table-id)  (lib.metadata/card query (lib.util/legacy-string-table-id->card-id table-id))
    (integer? table-id) (lib.metadata/table query table-id)))

;;; this lives here as opposed to [[metabase.lib.metadata]] because that namespace is more of an interface namespace
;;; and moving this there would cause circular references.
(defmethod lib.metadata.calculation/display-name-method :metadata/column
  [query stage-number {field-display-name :display-name
                       field-name         :name
                       temporal-unit      :unit
                       binning            ::binning
                       join-alias         :source-alias
                       fk-field-id        :fk-field-id
                       table-id           :table-id
                       :as                field-metadata} style]
  (let [field-display-name (or field-display-name
                               (u.humanization/name->human-readable-name :simple field-name))
        join-display-name  (when (and (= style :long)
                                      ;; don't prepend a join display name if `:display-name` already contains one!
                                      ;; Legacy result metadata might include it for joined Fields, don't want to add
                                      ;; it twice. Otherwise we'll end up with display names like
                                      ;;
                                      ;;    Products → Products → Category
                                      (not (str/includes? field-display-name " → ")))
                             (or
                              (when fk-field-id
                                 ;; Implicitly joined column pickers don't use the target table's name, they use the FK field's name with
                                 ;; "ID" dropped instead.
                                 ;; This is very intentional: one table might have several FKs to one foreign table, each with different
                                 ;; meaning (eg. ORDERS.customer_id vs. ORDERS.supplier_id both linking to a PEOPLE table).
                                 ;; See #30109 for more details.
                                (if-let [field (lib.metadata/field query fk-field-id)]
                                  (-> (lib.metadata.calculation/display-info query stage-number field)
                                      :display-name
                                      lib.util/strip-id)
                                  (let [table (table-metadata query table-id)]
                                    (lib.metadata.calculation/display-name query stage-number table style))))
                              (or join-alias (lib.join/current-join-alias field-metadata))))
        display-name       (if join-display-name
                             (str join-display-name " → " field-display-name)
                             field-display-name)]
    (cond
      temporal-unit (lib.util/format "%s: %s" display-name (-> (name temporal-unit)
                                                               (str/replace \- \space)
                                                               u/capitalize-en))
      binning       (lib.util/format "%s: %s" display-name (lib.binning/binning-display-name binning field-metadata))
      :else         display-name)))

(defmethod lib.metadata.calculation/display-name-method :field
  [query
   stage-number
   [_tag {:keys [binning join-alias temporal-unit source-field], :as _opts} _id-or-name, :as field-clause]
   style]
  (if-let [field-metadata (cond-> (resolve-field-metadata query stage-number field-clause)
                            join-alias    (assoc :source-alias join-alias)
                            temporal-unit (assoc :unit temporal-unit)
                            binning       (assoc ::binning binning)
                            source-field  (assoc :fk-field-id source-field))]
    (lib.metadata.calculation/display-name query stage-number field-metadata style)
    ;; mostly for the benefit of JS, which does not enforce the Malli schemas.
    (i18n/tru "[Unknown Field]")))

(defmethod lib.metadata.calculation/column-name-method :metadata/column
  [_query _stage-number {field-name :name}]
  field-name)

(defmethod lib.metadata.calculation/column-name-method :field
  [query stage-number [_tag _id-or-name, :as field-clause]]
  (if-let [field-metadata (resolve-field-metadata query stage-number field-clause)]
    (lib.metadata.calculation/column-name query stage-number field-metadata)
    ;; mostly for the benefit of JS, which does not enforce the Malli schemas.
    "unknown_field"))

(defmethod lib.metadata.calculation/display-info-method :metadata/column
  [query stage-number field-metadata]
  (merge
   ((get-method lib.metadata.calculation/display-info-method :default) query stage-number field-metadata)
   ;; if this column comes from a source Card (Saved Question/Model/etc.) use the name of the Card as the 'table' name
   ;; rather than the ACTUAL table name.
   (when (= (:lib/source field-metadata) :source/card)
     (when-let [card-id (:lib/card-id field-metadata)]
       (when-let [card (lib.metadata/card query card-id)]
         {:table {:name (:name card), :display-name (:name card)}})))))

;;; ---------------------------------- Temporal Bucketing ----------------------------------------

;;; TODO -- it's a little silly to make this a multimethod I think since there are exactly two implementations of it,
;;; right? Or can expression and aggregation references potentially be temporally bucketed as well? Think about
;;; whether just making this a plain function like we did for [[metabase.lib.join/with-join-alias]] makes sense or not.

(defmethod lib.temporal-bucket/temporal-bucket-method :field
  [[_tag opts _id-or-name]]
  (:temporal-unit opts))

(defmethod lib.temporal-bucket/temporal-bucket-method :metadata/column
  [metadata]
  (::temporal-unit metadata))

(defmethod lib.temporal-bucket/with-temporal-bucket-method :field
  [[_tag options id-or-name] unit]
  ;; if `unit` is an extraction unit like `:month-of-year`, then the `:effective-type` of the ref changes to
  ;; `:type/Integer` (month of year returns an int). We need to record the ORIGINAL effective type somewhere in case
  ;; we need to refer back to it, e.g. to see what temporal buckets are available if we want to change the unit, or if
  ;; we want to remove it later. We will record this with the key `::original-effective-type`. Note that changing the
  ;; unit multiple times should keep the original first value of `::original-effective-type`.
  (if unit
    (let [extraction-unit?        (contains? lib.schema.temporal-bucketing/datetime-extraction-units unit)
          original-effective-type ((some-fn ::original-effective-type :effective-type :base-type) options)
          new-effective-type      (if extraction-unit?
                                    :type/Integer
                                    original-effective-type)
          options                 (assoc options
                                         :temporal-unit unit
                                         :effective-type new-effective-type
                                         ::original-effective-type original-effective-type)]
      [:field options id-or-name])
    ;; `unit` is `nil`: remove the temporal bucket.
    (let [options (if-let [original-effective-type (::original-effective-type options)]
                    (-> options
                        (assoc :effective-type original-effective-type)
                        (dissoc ::original-effective-type))
                    options)
          options (dissoc options :temporal-unit)]
      [:field options id-or-name])))

(defmethod lib.temporal-bucket/with-temporal-bucket-method :metadata/column
  [metadata unit]
  (if unit
    (assoc metadata ::temporal-unit unit)
    (dissoc metadata ::temporal-unit)))

(defmethod lib.temporal-bucket/available-temporal-buckets-method :field
  [query stage-number field-ref]
  (lib.temporal-bucket/available-temporal-buckets query stage-number (resolve-field-metadata query stage-number field-ref)))

(defn- fingerprint-based-default-unit [fingerprint]
  (u/ignore-exceptions
    (when-let [{:keys [earliest latest]} (-> fingerprint :type :type/DateTime)]
      (let [days (shared.ut/day-diff (shared.ut/coerce-to-timestamp earliest)
                                     (shared.ut/coerce-to-timestamp latest))]
        (when-not (NaN? days)
          (condp > days
            1 :minute
            31 :day
            365 :week
            :month))))))

(defn- mark-unit [options option-key unit]
  (cond->> options
    (some #(= (:unit %) unit) options)
    (mapv (fn [option]
            (cond-> (dissoc option option-key)
              (= (:unit option) unit) (assoc option-key true))))))

(defmethod lib.temporal-bucket/available-temporal-buckets-method :metadata/column
  [_query _stage-number field-metadata]
  (if (not= (:lib/source field-metadata) :source/expressions)
    (let [effective-type ((some-fn :effective-type :base-type) field-metadata)
          fingerprint-default (some-> field-metadata :fingerprint fingerprint-based-default-unit)]
      (cond-> (cond
                (isa? effective-type :type/DateTime) lib.temporal-bucket/datetime-bucket-options
                (isa? effective-type :type/Date)     lib.temporal-bucket/date-bucket-options
                (isa? effective-type :type/Time)     lib.temporal-bucket/time-bucket-options
                :else                                [])
        fingerprint-default              (mark-unit :default fingerprint-default)
        (::temporal-unit field-metadata) (mark-unit :selected (::temporal-unit field-metadata))))
    []))

;;; ---------------------------------------- Binning ---------------------------------------------

(defmethod lib.binning/binning-method :field
  [field-clause]
  (some-> field-clause
          lib.options/options
          :binning
          (assoc :lib/type    ::lib.binning/binning
                 :metadata-fn (fn [query stage-number]
                                (resolve-field-metadata query stage-number field-clause)))))

(defmethod lib.binning/binning-method :metadata/column
  [metadata]
  (some-> metadata
          ::binning
          (assoc :lib/type    ::lib.binning/binning
                 :metadata-fn (constantly metadata))))

(defmethod lib.binning/with-binning-method :field
  [field-clause binning]
  (lib.options/update-options field-clause u/assoc-dissoc :binning binning))

(defmethod lib.binning/with-binning-method :metadata/column
  [metadata binning]
  (u/assoc-dissoc metadata ::binning binning))

(defmethod lib.binning/available-binning-strategies-method :field
  [query stage-number field-ref]
  (lib.binning/available-binning-strategies query stage-number (resolve-field-metadata query stage-number field-ref)))

(defmethod lib.binning/available-binning-strategies-method :metadata/column
  [query _stage-number {:keys [effective-type fingerprint semantic-type] :as field-metadata}]
  (if (not= (:lib/source field-metadata) :source/expressions)
    (let [binning?    (some-> query lib.metadata/database :features (contains? :binning))
          fingerprint (get-in fingerprint [:type :type/Number])
          existing    (lib.binning/binning field-metadata)
          strategies  (cond
                        ;; Abort if the database doesn't support binning, or this column does not have a defined range.
                        (not (and binning?
                                  (:min fingerprint)
                                  (:max fingerprint)))               nil
                        (isa? semantic-type :type/Coordinate)        (lib.binning/coordinate-binning-strategies)
                        (and (isa? effective-type :type/Number)
                             (not (isa? semantic-type :Relation/*))) (lib.binning/numeric-binning-strategies))]
      ;; TODO: Include the time and date binning strategies too; see metabase.api.table/assoc-field-dimension-options.
      (for [strat strategies]
        (cond-> strat
          (lib.binning/strategy= strat existing) (assoc :selected true))))
    []))

(defmethod lib.ref/ref-method :field
  [field-clause]
  field-clause)

(defn- column-metadata->field-ref
  [metadata]
  (let [inherited-column? (when-not (::lib.card/force-broken-id-refs metadata)
                            (#{:source/card :source/native :source/previous-stage} (:lib/source metadata)))
        options           (merge {:lib/uuid       (str (random-uuid))
                                  :base-type      (:base-type metadata)
                                  :effective-type (column-metadata-effective-type metadata)}
                                 (when-let [join-alias (lib.join/current-join-alias metadata)]
                                   {:join-alias join-alias})
                                 (when-let [temporal-unit (::temporal-unit metadata)]
                                   {:temporal-unit temporal-unit})
                                 (when-let [binning (::binning metadata)]
                                   {:binning binning})
                                 (when-let [source-field-id (:fk-field-id metadata)]
                                   {:source-field source-field-id}))
        id-or-name        ((if inherited-column?
                             (some-fn :lib/desired-column-alias :name)
                             (some-fn :id :name))
                           metadata)]
    [:field options id-or-name]))

(defmethod lib.ref/ref-method :metadata/column
  [{source :lib/source, :as metadata}]
  (case source
    :source/aggregations (lib.aggregation/column-metadata->aggregation-ref metadata)
    :source/expressions  (lib.expression/column-metadata->expression-ref metadata)
    ;; :source/breakouts hides the true origin of the column. Since it's impossible to
    ;; break out by aggregation references at the current stage, we only have to check
    ;; if we break out by an expression reference. :expression-name is only set for
    ;; expression references, so if it's set, we have to generate an expression ref,
    ;; otherwise we generate a normal field ref.
    :source/breakouts    (if (contains? metadata :lib/expression-name)
                           (lib.expression/column-metadata->expression-ref metadata)
                           (column-metadata->field-ref metadata))
    (column-metadata->field-ref metadata)))

(defn- implicit-join-name [query {:keys [fk-field-id table-id], :as _field-metadata}]
  (when (and fk-field-id table-id)
    (when-let [table (table-metadata query table-id)]
      (let [table-name           (:name table)
            source-field-id-name (:name (lib.metadata/field query fk-field-id))]
        (lib.join/implicit-join-name table-name source-field-id-name)))))

(mu/defn desired-alias :- ::lib.schema.common/non-blank-string
  "Desired alias for a Field e.g.

    my_field

    OR

    MyJoin__my_field

  You should pass the results thru a unique name function."
  [query          :- ::lib.schema/query
   field-metadata :- lib.metadata/ColumnMetadata]
  (if-let [join-alias (or (lib.join/current-join-alias field-metadata)
                          (implicit-join-name query field-metadata))]
    (lib.join/joined-field-desired-alias join-alias (:name field-metadata))
    (:name field-metadata)))

(defn- expression-refs
  "Create refs for all the expressions in a stage of a query."
  [query stage-number]
  (for [col   (lib.metadata.calculation/visible-columns
               query
               stage-number
               (lib.util/query-stage query stage-number)
               {:include-joined?              false
                :include-expressions?         true
                :include-implicitly-joinable? false})
        :when (= (:lib/source col) :source/expressions)]
    (lib.ref/ref col)))

(mu/defn with-fields :- ::lib.schema/query
  "Specify the `:fields` for a query. Pass `nil` or an empty sequence to remove `:fields`."
  ([xs]
   (fn [query stage-number]
     (with-fields query stage-number xs)))

  ([query xs]
   (with-fields query -1 xs))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    xs]
   (let [xs (not-empty (mapv lib.ref/ref xs))
         ;; if any fields are specified, include all expressions not yet included too
         xs (some-> xs
                    (into (remove #(lib.equality/find-closest-matching-ref % xs))
                          (expression-refs query stage-number)))]
     (lib.util/update-query-stage query stage-number u/assoc-dissoc :fields xs))))

(mu/defn fields :- [:maybe [:ref ::lib.schema/fields]]
  "Fetches the `:fields` for a query. Returns `nil` if there are no `:fields`. `:fields` should never be empty; this is
  enforced by the Malli schema."
  ([query]
   (fields query -1))

  ([query        :- ::lib.schema/query
    stage-number :- :int]
   (:fields (lib.util/query-stage query stage-number))))

(mu/defn fieldable-columns :- [:sequential lib.metadata/ColumnMetadata]
  "Return a sequence of column metadatas for columns that you can specify in the `:fields` of a query. This is
  basically just the columns returned by the source Table/Saved Question/Model or previous query stage.

  Includes a `:selected?` key letting you know this column is already in `:fields` or not; if `:fields` is
  unspecified, all these columns are returned by default, so `:selected?` is true for all columns (this is a little
  strange but it matches the behavior of the QB UI)."
  ([query]
   (fieldable-columns query -1))

  ([query :- ::lib.schema/query
    stage-number :- :int]
   (let [visible-columns (lib.metadata.calculation/visible-columns query
                                                                   stage-number
                                                                   (lib.util/query-stage query stage-number)
                                                                   {:include-joined?              false
                                                                    :include-expressions?         false
                                                                    :include-implicitly-joinable? false})
         selected-fields (fields query stage-number)]
     (if (empty? selected-fields)
       (mapv (fn [col]
               (assoc col :selected? true))
             visible-columns)
       (lib.equality/mark-selected-columns visible-columns selected-fields)))))

(mu/defn field-id :- [:maybe ::lib.schema.common/int-greater-than-or-equal-to-zero]
  "Find the field id for something or nil."
  [field-metadata :- lib.metadata/ColumnMetadata]
  (:id field-metadata))

(defn- populate-fields-for-stage
  "Given a query and stage, sets the `:fields` list to be the fields which would be selected by default.
  This is exactly [[lib.metadata.calculation/returned-columns]] filtered by the `:lib/source`.
  Fields from explicit joins are listed on the join itself; custom expressions are always included and should not be
  listed in `:fields`."
  [query stage-number]
  (lib.util/update-query-stage query stage-number
                               (fn [stage]
                                 (assoc stage :fields
                                        (into [] (comp (remove (comp #{:source/joins :source/expressions}
                                                                     :lib/source))
                                                       (map lib.ref/ref))
                                              (lib.metadata.calculation/returned-columns query stage-number stage))))))

(defn- query-with-fields
  "If the given stage already has a `:fields` clause, do nothing. If it doesn't, populate the `:fields` clause with the
  full set of `returned-columns`. (See [[populate-fields-for-stage]] for the details.)"
  [query stage-number]
  (cond-> query
    (not (:fields (lib.util/query-stage query stage-number))) (populate-fields-for-stage stage-number)))

(defn- include-field [query stage-number column]
  (let [populated  (query-with-fields query stage-number)
        column-ref (lib.ref/ref column)]
    (if (lib.equality/find-closest-matching-ref populated column-ref (fields populated stage-number))
      ;; If the column is already found, do nothing and return the original query.
      query
      (lib.util/update-query-stage populated stage-number update :fields conj column-ref))))

(defn- add-field-to-join [query stage-number column]
  (let [column-ref   (lib.ref/ref column)
        [join field] (first (for [join  (lib.join/joins query stage-number)
                                  field (lib.join/joinable-columns query stage-number join)
                                  :when (lib.equality/closest-matching-metadata column-ref [field])]
                              [join field]))
        join-fields  (lib.join/join-fields join)]

    ;; Nothing to do if it's already selected, or if this join already has :fields :all.
    ;; Otherwise, append it to the list of fields.
    (if (or (and field (:selected? field))
            (= join-fields :all))
      query
      (lib.remove-replace/replace-join query stage-number join
                                       (lib.join/with-join-fields join
                                         (if (= join-fields :none)
                                           [column]
                                           (conj join-fields column)))))))

(defn- native-query-fields-edit-error []
  (i18n/tru "Fields cannot be adjusted on native queries. Either edit the native query, or save this question and edit the fields in a GUI question based on this one."))

(mu/defn add-field :- ::lib.schema/query
  "Adds a given field (`ColumnMetadata`, as returned from eg. [[visible-columns]]) to the fields returned by the query.
  Exactly what this means depends on the source of the field:
  - Source table/card, previous stage of the query, aggregation or breakout:
      - Add it to the `:fields` list
      - If `:fields` is missing, it's implicitly `:all`, so do nothing.
  - Implicit join: add it to the `:fields` list; query processor will do the right thing with it.
  - Explicit join: add it to that join's `:fields` list.
  - Custom expression: Do nothing - expressions are always included."
  [query      :- ::lib.schema/query
   stage-number :- :int
   column       :- lib.metadata.calculation/ColumnMetadataWithSource]
  (let [stage (lib.util/query-stage query stage-number)]
    (case (:lib/source column)
      (:source/table-defaults
       :source/card
       :source/previous-stage
       :source/aggregations
       :source/breakouts)         (cond-> query
                                    (contains? stage :fields) (include-field stage-number column))
      :source/joins               (add-field-to-join query stage-number column)
      :source/implicitly-joinable (include-field query stage-number column)
      :source/native              (throw (ex-info (native-query-fields-edit-error) {:query query :stage stage-number}))
      ;; Default case - for columns from a native query or a custom expression - these are always returned and cannot be
      ;; selected off and on.
      query)))

(defn- exclude-field
  "This is called only for fields that plausibly need removing. If the stage has no `:fields`, this will populate it.
  It shouldn't happen that we can't find the target field, but if that does happen, this will return the original query
  unchanged. (In particular, if `:fields` did not exist before it will still be omitted.)"
  [query stage-number column]
  (let [old-fields (-> query
                       (query-with-fields stage-number)
                       (lib.util/query-stage stage-number)
                       :fields)
        column-ref (lib.ref/ref column)
        index      (first (keep-indexed (fn [index field]
                                          (when (lib.equality/find-closest-matching-ref query column-ref [field])
                                            index))
                                        old-fields))
        new-fields (when index
                     (let [[pre [_ & post]] (split-at index old-fields)]
                       (vec (concat pre post))))]
    ;; If we couldn't find the field, return the original query unchanged too.
    (cond-> query
      new-fields (lib.util/update-query-stage stage-number assoc :fields new-fields))))

(defn- remove-field-from-join [query stage-number column]
  (let [field-ref   (lib.ref/ref column)
        join        (lib.join/resolve-join query stage-number (::lib.join/join-alias column))
        join-fields (lib.join/join-fields join)]
    (if (or (nil? join-fields)
            (= join-fields :none))
      ;; Nothing to do if there's already no join fields.
      query
      (let [resolved-join-fields (if (= join-fields :all)
                                   (lib.metadata.calculation/returned-columns query stage-number join)
                                   join-fields)
            removed              (if (= join-fields :all)
                                   ;; for `:fields :all` use [[lib.equality/closest-matching-metadata]] since we have
                                   ;; actual ColumnMetdatas, since it's more sophisticated
                                   ;; than [[lib.equality/find-closest-matching-ref]]. We will have to use the latter
                                   ;; if we only have refs to work with
                                   (remove #(lib.equality/closest-matching-metadata field-ref [%])
                                           resolved-join-fields)
                                   (remove #(lib.equality/find-closest-matching-ref query field-ref [%])
                                           resolved-join-fields))]
        (cond-> query
          ;; If we actually removed a field, replace the join. Otherwise return the query unchanged.
          (< (count removed) (count resolved-join-fields))
          (lib.remove-replace/replace-join stage-number join (lib.join/with-join-fields join removed)))))))

(mu/defn remove-field :- ::lib.schema/query
  "Removes the field (a `ColumnMetadata`, as returned from eg. [[visible-columns]]) from those fields returned by the
  query. Exactly what this means depends on the source of the field:
  - Source table/card, previous stage, aggregations or breakouts:
      - If `:fields` is missing, it's implicitly `:all` - populate it with all the columns except the removed one.
      - Remove the target column from the `:fields` list
  - Implicit join: remove it from the `:fields` list; do nothing if it's not there.
      - (An implicit join only exists in the `:fields` clause, so if it's not there then it's not anywhere.)
  - Explicit join: remove it from that join's `:fields` list (handle `:fields :all` like for source tables).
  - Custom expression: Throw! Custom expressions are always returned. To remove a custom expression, the expression
    itself should be removed from the query."
  [query      :- ::lib.schema/query
   stage-number :- :int
   column       :- lib.metadata.calculation/ColumnMetadataWithSource]
  (let [stage (lib.util/query-stage query stage-number)]
    (case (:lib/source column)
      (:source/table-defaults
       :source/breakouts
       :source/aggregations
       :source/card
       :source/previous-stage)    (exclude-field query stage-number column)
      :source/implicitly-joinable (cond-> query
                                    ;; If there are fields, exclude this column from it.
                                    ;; If :fields is implied, then there can't be any implicitly joined fields in it.
                                    (:fields stage) (exclude-field stage-number column))
      :source/joins               (remove-field-from-join query stage-number column)
      :source/expressions         (throw (ex-info (i18n/tru "Custom expressions cannot be de-selected. Delete the expression instead.")
                                                  {:query      query
                                                   :stage      stage-number
                                                   :expression column}))
      :source/native              (throw (ex-info (native-query-fields-edit-error) {:query query :stage stage-number}))
      ;; Default case: do nothing and return the query unchaged.
      query)))

(mu/defn find-visible-column-for-ref :- [:maybe lib.metadata/ColumnMetadata]
  "Return the visible column in `query` at `stage-number` referenced by `field-ref`.
  If `stage-number` is omitted, the last stage is used."
  ([query field-ref]
   (find-visible-column-for-ref query -1 field-ref))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    field-ref    :- ::lib.schema.ref/ref]
   (let [stage   (lib.util/query-stage query stage-number)
         columns (lib.metadata.calculation/visible-columns query stage-number stage)]
     (lib.equality/closest-matching-metadata field-ref columns))))

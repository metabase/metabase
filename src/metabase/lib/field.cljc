(ns metabase.lib.field
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.ref]
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

(comment metabase.lib.schema.ref/keep-me)

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
  "Integer Field ID: get metadata from the metadata provider. This is probably not 100% the correct thing to do if
  this isn't the first stage of the query, but we can fix that behavior in a follow-on"
  [query     :- ::lib.schema/query
   field-id  :- ::lib.schema.id/field]
  (lib.metadata/field query field-id))

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

(mu/defn ^:private resolve-column-name :- [:maybe lib.metadata/ColumnMetadata]
  "String column name: get metadata from the previous stage, if it exists, otherwise if this is the first stage and we
  have a native query or a Saved Question source query or whatever get it from our results metadata."
  [query        :- ::lib.schema/query
   stage-number :- :int
   column-name  :- ::lib.schema.common/non-blank-string]
  (let [stage         (if-let [previous-stage-number (lib.util/previous-stage-number query stage-number)]
                        (lib.util/query-stage query previous-stage-number)
                        (lib.util/query-stage query stage-number))
        ;; TODO -- it seems a little icky that the existence of `:metabase.lib.stage/cached-metadata` is leaking here,
        ;; we should look in to fixing this if we can.
        stage-columns (or (:metabase.lib.stage/cached-metadata stage)
                          (get-in stage [:lib/stage-metadata :columns])
                          (log/warn (i18n/tru "Cannot resolve column {0}: stage has no metadata" (pr-str column-name))))]
    (when (seq stage-columns)
      (resolve-column-name-in-metadata column-name stage-columns))))

(mu/defn ^:private resolve-column-name-in-join :- [:maybe lib.metadata/ColumnMetadata]
  [query        :- ::lib.schema/query
   stage-number :- :int
   column-name  :- ::lib.schema.common/non-blank-string
   join-alias   :- [:maybe ::lib.schema.common/non-blank-string]]
  (let [join-metadata (lib.metadata.calculation/metadata query stage-number (lib.join/resolve-join query stage-number join-alias))]
    (resolve-column-name-in-metadata column-name join-metadata)))

(mu/defn ^:private resolve-field-metadata :- lib.metadata/ColumnMetadata
  "Resolve metadata for a `:field` ref. This is part of the implementation
  for [[lib.metadata.calculation/metadata-method]] a `:field` clause."
  [query                                                                 :- ::lib.schema/query
   stage-number                                                          :- :int
   [_field {:keys [join-alias], :as opts} id-or-name, :as _field-clause] :- :mbql.clause/field]
  (merge
   (when-let [base-type (:base-type opts)]
     {:base-type base-type})
   (when-let [effective-type ((some-fn :effective-type :base-type) opts)]
     {:effective-type effective-type})
   ;; TODO -- some of the other stuff in `opts` probably ought to be merged in here as well. Also, if the Field is
   ;; temporally bucketed, the base-type/effective-type would probably be affected, right? We should probably be
   ;; taking that into consideration?
   (cond
     (integer? id-or-name) (resolve-field-id query id-or-name)
     join-alias            (or (resolve-column-name-in-join query stage-number id-or-name join-alias)
                               {:lib/type    :metadata/field
                                :name        id-or-name
                                ::join-alias join-alias})
     :else                 (or (resolve-column-name query stage-number id-or-name)
                               {:lib/type :metadata/field
                                :name     id-or-name}))))

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

(defmethod lib.metadata.calculation/type-of-method :metadata/field
  [_query _stage-number column-metadata]
  (column-metadata-effective-type column-metadata))

(defmethod lib.metadata.calculation/type-of-method :field
  [query stage-number [_tag {:keys [temporal-unit], :as _opts} _id-or-name :as field-ref]]
  (let [metadata (cond-> (resolve-field-metadata query stage-number field-ref)
                   temporal-unit (assoc ::temporal-unit temporal-unit))]
    (lib.metadata.calculation/type-of query stage-number metadata)))

(defmethod lib.metadata.calculation/metadata-method :metadata/field
  [_query _stage-number {field-name :name, :as field-metadata}]
  (assoc field-metadata :name field-name))

;;; TODO -- base type should be affected by `temporal-unit`, right?
(defmethod lib.metadata.calculation/metadata-method :field
  [query
   stage-number
   [_tag {source-uuid :lib/uuid :keys [base-type binning effective-type join-alias source-field temporal-unit], :as opts} :as field-ref]]
  (let [field-metadata (resolve-field-metadata query stage-number field-ref)
        metadata       (merge
                        {:lib/type :metadata/field
                         :lib/source-uuid source-uuid}
                        field-metadata
                        {:display-name (or (:display-name opts)
                                           (lib.metadata.calculation/display-name query stage-number field-ref))}
                        (when effective-type
                          {:effective-type effective-type})
                        (when base-type
                          {:base-type base-type})
                        (when temporal-unit
                          {::temporal-unit temporal-unit})
                        (when binning
                          {::binning binning})
                        (when join-alias
                          {::join-alias join-alias})
                        (when source-field
                          {:fk-field-id source-field}))]
    (cond->> metadata
      (:parent-id metadata) (add-parent-column-metadata query))))

;;; this lives here as opposed to [[metabase.lib.metadata]] because that namespace is more of an interface namespace
;;; and moving this there would cause circular references.
(defmethod lib.metadata.calculation/display-name-method :metadata/field
  [query stage-number {field-display-name :display-name
                       field-name         :name
                       temporal-unit      :unit
                       binning            ::binning
                       join-alias         :source_alias
                       fk-field-id        :fk-field-id
                       table-id           :table-id
                       :as                field-metadata} style]
  (let [field-display-name (or field-display-name
                               (u.humanization/name->human-readable-name :simple field-name))
        join-display-name  (when (= style :long)
                             (or
                              (when fk-field-id
                                (let [table (lib.metadata/table query table-id)]
                                  (lib.metadata.calculation/display-name query stage-number table style)))
                              (when join-alias
                                (let [join (lib.join/resolve-join query stage-number join-alias)]
                                  (lib.metadata.calculation/display-name query stage-number join style)))))
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
                            join-alias    (assoc :source_alias join-alias)
                            temporal-unit (assoc :unit temporal-unit)
                            binning       (assoc ::binning binning)
                            source-field  (assoc :fk-field-id source-field))]
    (lib.metadata.calculation/display-name query stage-number field-metadata style)
    ;; mostly for the benefit of JS, which does not enforce the Malli schemas.
    (i18n/tru "[Unknown Field]")))

(defmethod lib.metadata.calculation/column-name-method :metadata/field
  [_query _stage-number {field-name :name}]
  field-name)

(defmethod lib.metadata.calculation/column-name-method :field
  [query stage-number [_tag _id-or-name, :as field-clause]]
  (if-let [field-metadata (resolve-field-metadata query stage-number field-clause)]
    (lib.metadata.calculation/column-name query stage-number field-metadata)
    ;; mostly for the benefit of JS, which does not enforce the Malli schemas.
    "unknown_field"))

(defmethod lib.metadata.calculation/display-info-method :metadata/field
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
(defmethod lib.temporal-bucket/temporal-bucket-method :field
  [[_tag opts _id-or-name]]
  (:temporal-unit opts))

(defmethod lib.temporal-bucket/temporal-bucket-method :metadata/field
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

(defmethod lib.temporal-bucket/with-temporal-bucket-method :metadata/field
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

(defn- mark-default-unit [options unit]
  (cond->> options
    (some #(= (:unit %) unit) options)
    (mapv (fn [option]
            (cond-> (dissoc option :default)
              (= (:unit option) unit) (assoc :default true))))))

(defmethod lib.temporal-bucket/available-temporal-buckets-method :metadata/field
  [_query _stage-number field-metadata]
  (let [effective-type ((some-fn :effective-type :base-type) field-metadata)
        fingerprint-default (some-> field-metadata :fingerprint fingerprint-based-default-unit)]
    (cond-> (cond
              (isa? effective-type :type/DateTime) lib.temporal-bucket/datetime-bucket-options
              (isa? effective-type :type/Date)     lib.temporal-bucket/date-bucket-options
              (isa? effective-type :type/Time)     lib.temporal-bucket/time-bucket-options
              :else                                [])
      fingerprint-default (mark-default-unit fingerprint-default))))

;;; ---------------------------------------- Binning ---------------------------------------------
(defmethod lib.binning/binning-method :field
  [field-clause]
  (some-> field-clause
          lib.options/options
          :binning
          (assoc :lib/type    ::lib.binning/binning
                 :metadata-fn (fn [query stage-number]
                                (resolve-field-metadata query stage-number field-clause)))))

(defmethod lib.binning/binning-method :metadata/field
  [metadata]
  (some-> metadata
          ::binning
          (assoc :lib/type    ::lib.binning/binning
                 :metadata-fn (constantly metadata))))

(defmethod lib.binning/with-binning-method :field
  [field-clause binning]
  (lib.options/update-options field-clause u/assoc-dissoc :binning binning))

(defmethod lib.binning/with-binning-method :metadata/field
  [metadata binning]
  (u/assoc-dissoc metadata ::binning binning))

(defmethod lib.binning/available-binning-strategies-method :field
  [query stage-number field-ref]
  (lib.binning/available-binning-strategies query stage-number (resolve-field-metadata query stage-number field-ref)))

(defmethod lib.binning/available-binning-strategies-method :metadata/field
  [query _stage-number {:keys [effective-type fingerprint semantic-type] :as _field-metadata}]
  (let [binning?        (some-> query lib.metadata/database :features (contains? :binning))
        {min-value :min max-value :max} (get-in fingerprint [:type :type/Number])]
    (cond
      ;; TODO: Include the time and date binning strategies too; see metabase.api.table/assoc-field-dimension-options.
      (and binning? min-value max-value
           (isa? semantic-type :type/Coordinate))
      (lib.binning/coordinate-binning-strategies)

      (and binning? min-value max-value
           (isa? effective-type :type/Number)
           (not (isa? semantic-type :Relation/*)))
      (lib.binning/numeric-binning-strategies))))

;;; -------------------------------------- Join Alias --------------------------------------------
(defmethod lib.join/current-join-alias-method :field
  [[_tag opts]]
  (get opts :join-alias))

(defmethod lib.join/current-join-alias-method :metadata/field
  [metadata]
  (::join-alias metadata))

(defmethod lib.join/with-join-alias-method :field
  [[_tag opts id-or-name] join-alias]
  (if join-alias
    [:field (assoc opts :join-alias join-alias) id-or-name]
    [:field (dissoc opts :join-alias) id-or-name]))

(defmethod lib.join/with-join-alias-method :metadata/field
  [metadata join-alias]
  (assoc metadata ::join-alias join-alias))

(defmethod lib.ref/ref-method :field
  [field-clause]
  field-clause)

(defmethod lib.ref/ref-method :metadata/field
  [{source :lib/source, :as metadata}]
  (case source
    :source/aggregations (lib.aggregation/column-metadata->aggregation-ref metadata)
    :source/expressions  (lib.expression/column-metadata->expression-ref metadata)
    (let [options          (merge
                            {:lib/uuid       (str (random-uuid))
                             :base-type      (:base-type metadata)
                             :effective-type (column-metadata-effective-type metadata)}
                            (when-let [join-alias (::join-alias metadata)]
                              {:join-alias join-alias})
                            (when-let [temporal-unit (::temporal-unit metadata)]
                              {:temporal-unit temporal-unit})
                            (when-let [binning (::binning metadata)]
                              {:binning binning})
                            (when-let [source-field-id (:fk-field-id metadata)]
                              {:source-field source-field-id}))
          always-use-name? (#{:source/card :source/native :source/previous-stage} (:lib/source metadata))]
      [:field options (if always-use-name?
                        (:name metadata)
                        (or (:id metadata) (:name metadata)))])))

(defn- implicit-join-name [query {:keys [fk-field-id table-id], :as _field-metadata}]
  (when (and fk-field-id table-id)
    (when-let [table-metadata (lib.metadata/table query table-id)]
      (let [table-name           (:name table-metadata)
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

(defn with-fields
  "Specify the `:fields` for a query."
  ([xs]
   (fn [query stage-number]
     (with-fields query stage-number xs)))

  ([query xs]
   (with-fields query -1 xs))

  ([query stage-number xs]
   (let [xs (mapv (fn [x]
                    (lib.ref/ref (if (fn? x)
                                   (x query stage-number)
                                   x)))
                  xs)]
     (lib.util/update-query-stage query stage-number assoc :fields xs))))

(defn fields
  "Fetches the `:fields` for a query."
  ([query]
   (fields query -1))
  ([query stage-number]
   (:fields (lib.util/query-stage query stage-number))))

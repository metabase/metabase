(ns metabase.lib.field
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.ref]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.humanization :as u.humanization]
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
  [query         :- ::lib.schema/query
   _stage-number :- :int
   field-id      :- ::lib.schema.id/field]
  (lib.metadata/field query field-id))

(mu/defn ^:private resolve-field-name :- lib.metadata/ColumnMetadata
  "String column name: get metadata from the previous stage, if it exists, otherwise if this is the first stage and we
  have a native query or a Saved Question source query or whatever get it from our results metadata."
  [query        :- ::lib.schema/query
   stage-number :- :int
   column-name  :- ::lib.schema.common/non-blank-string]
  (or (some (fn [column]
              (when (= (:name column) column-name)
                column))
            (let [stage (if-let [previous-stage-number (lib.util/previous-stage-number query stage-number)]
                          (lib.util/query-stage query previous-stage-number)
                          (lib.util/query-stage query stage-number))]
              (get-in stage [:lib/stage-metadata :columns])))
      (throw (ex-info (i18n/tru "Invalid :field clause: column {0} does not exist" (pr-str column-name))
                      {:name         column-name
                       :query        query
                       :stage-number stage-number}))))

(mu/defn resolve-field-metadata :- lib.metadata/ColumnMetadata
  "Resolve metadata for a `:field` ref."
  [query                                        :- ::lib.schema/query
   stage-number                                 :- :int
   [_field _opts id-or-name, :as _field-clause] :- :mbql.clause/field]
  (if (integer? id-or-name)
    (resolve-field-id query stage-number id-or-name)
    (resolve-field-name query stage-number id-or-name)))

(mu/defn ^:private add-parent-column-metadata
  "If this is a nested column, add metadata about the parent column."
  [query    :- ::lib.schema/query
   metadata :- lib.metadata/ColumnMetadata]
  (let [parent-metadata     (lib.metadata/field query (:parent_id metadata))
        {parent-name :name} (cond->> parent-metadata
                              (:parent_id parent-metadata) (add-parent-column-metadata query))]
    (update metadata :name (fn [field-name]
                             (str parent-name \. field-name)))))

(defmethod lib.metadata.calculation/metadata-method :metadata/field
  [_query _stage-number field-metadata]
  field-metadata)

;;; TODO -- base type should be affected by `temporal-unit`, right?
(defmethod lib.metadata.calculation/metadata-method :field
  [query stage-number [_tag {:keys [source-field effective-type base-type temporal-unit join-alias], :as opts} :as field-ref]]
  (let [field-metadata (resolve-field-metadata query stage-number field-ref)
        metadata       (merge
                        {:lib/type :metadata/field}
                        field-metadata
                        {:display_name (or (:display-name opts)
                                           (lib.metadata.calculation/display-name query stage-number field-ref))}
                        (when effective-type
                          {:effective_type effective-type})
                        (when base-type
                          {:base_type base-type})
                        (when temporal-unit
                          {::temporal-unit temporal-unit})
                        (when join-alias
                          {::join-alias join-alias})
                        (when source-field
                          {:fk_field_id source-field}))]
    (cond->> metadata
      (:parent_id metadata) (add-parent-column-metadata query))))

;;; this lives here as opposed to [[metabase.lib.metadata]] because that namespace is more of an interface namespace
;;; and moving this there would cause circular references.
(defmethod lib.metadata.calculation/display-name-method :metadata/field
  [query stage-number {field-display-name :display_name
                       field-name         :name
                       temporal-unit      :unit
                       join-alias         :source_alias
                       :as                _field-metadata}]
  (let [field-display-name (or field-display-name
                               (u.humanization/name->human-readable-name :simple field-name))
        join-display-name  (when join-alias
                             (let [join (lib.join/resolve-join query stage-number join-alias)]
                               (lib.metadata.calculation/display-name query stage-number join)))
        display-name       (if join-display-name
                             (str join-display-name " → " field-display-name)
                             field-display-name)]
    (if temporal-unit
      (lib.util/format "%s (%s)" display-name (name temporal-unit))
      display-name)))

(defmethod lib.metadata.calculation/display-name-method :field
  [query stage-number [_field {:keys [join-alias temporal-unit], :as _opts} _id-or-name, :as field-clause]]
  (if-let [field-metadata (cond-> (resolve-field-metadata query stage-number field-clause)
                            join-alias    (assoc :source_alias join-alias)
                            temporal-unit (assoc :unit temporal-unit))]
    (lib.metadata.calculation/display-name query stage-number field-metadata)
    ;; mostly for the benefit of JS, which does not enforce the Malli schemas.
    (i18n/tru "[Unknown Field]")))

(defmethod lib.temporal-bucket/current-temporal-bucket-method :field
  [[_tag opts _id-or-name]]
  (:temporal-unit opts))

(defmethod lib.temporal-bucket/current-temporal-bucket-method :metadata/field
  [metadata]
  (::temporal-unit metadata))

(defmethod lib.temporal-bucket/temporal-bucket-method :field
  [[_tag options id-or-name] unit]
  (if unit
    [:field (assoc options :temporal-unit unit) id-or-name]
    [:field (dissoc options :temporal-unit) id-or-name]))

(defmethod lib.temporal-bucket/temporal-bucket-method :metadata/field
  [metadata unit]
  (assoc metadata ::temporal-unit unit))

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
  [metadata]
  (case (:lib/source metadata)
    :source/aggregation (lib.aggregation/column-metadata->aggregation-ref metadata)
    :source/expressions (lib.expression/column-metadata->expression-ref metadata)
    (let [options          (merge
                            {:lib/uuid       (str (random-uuid))
                             :base-type      (:base_type metadata)
                             :effective-type ((some-fn :effective_type :base_type) metadata)}
                            (when-let [join-alias (::join-alias metadata)]
                              {:join-alias join-alias})
                            (when-let [temporal-unit (::temporal-unit metadata)]
                              {:temporal-unit temporal-unit})
                            (when-let [source-field-id (:fk_field_id metadata)]
                              {:source-field source-field-id})
                            ;; TODO -- binning options.
                            )
          always-use-name? (#{:source/card :source/native :source/previous-stage} (:lib/source metadata))]
      [:field options (if always-use-name?
                        (:name metadata)
                        (or (:id metadata) (:name metadata)))])))

(defn fields
  "Specify the `:fields` for a query."
  ([xs]
   (fn [query stage-number]
     (fields query stage-number xs)))

  ([query xs]
   (fields query -1 xs))

  ([query stage-number xs]
   (let [xs (mapv (fn [x]
                    (lib.ref/ref (if (fn? x)
                                   (x query stage-number)
                                   x)))
                  xs)]
     (lib.util/update-query-stage query stage-number assoc :fields xs))))

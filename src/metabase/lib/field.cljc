(ns metabase.lib.field
  (:require
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.options :as lib.options]
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

(defmethod lib.metadata.calculation/metadata :metadata/field
  [_query _stage-number field-metadata]
  field-metadata)

;;; TODO -- base type should be affected by `temporal-unit`, right?
(defmethod lib.metadata.calculation/metadata :field
  [query stage-number [_tag {:keys [base-type temporal-unit], :as opts} :as field-ref]]
  (let [field-metadata (resolve-field-metadata query stage-number field-ref)
        metadata       (merge
                        {:lib/type  :metadata/field
                         :field_ref field-ref}
                        field-metadata
                        {:display_name (or (:display-name opts)
                                           (lib.metadata.calculation/display-name query stage-number field-ref))}
                        (when base-type
                          {:base_type base-type})
                        (when temporal-unit
                          {:unit temporal-unit}))]
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

(defmulti ^:private ->field
  {:arglists '([query stage-number field])}
  (fn [_query _stage-number field]
    (lib.dispatch/dispatch-value field)))

(defmethod ->field :field
  [_query _stage-number field-clause]
  field-clause)

(defmethod ->field :metadata/field
  [_query _stage-number {base-type :base_type, field-id :id, field-name :name, field-ref :field_ref, :as _field-metadata}]
  (cond-> (or (when field-ref
                (lib.convert/->pMBQL field-ref))
              [:field {} (or field-id
                             field-name)])
    base-type (lib.options/update-options assoc :base-type base-type)
    true      lib.options/ensure-uuid))

(defmethod ->field :dispatch-type/integer
  [query _stage-number field-id]
  (lib.metadata/field query field-id))

;;; Pass in a function that takes `query` and `stage-number` to support ad-hoc usage in tests etc
(defmethod ->field :dispatch-type/fn
  [query stage-number f]
  (f query stage-number))

(defmethod lib.temporal-bucket/temporal-bucket* :field
  [[_field options id-or-name] unit]
  [:field (assoc options :temporal-unit unit) id-or-name])

(mu/defn field :- :mbql.clause/field
  "Create a `:field` clause."
  ([query x]
   (->field query -1 x))
  ([query stage-number x]
   (->field query stage-number x)))

(defmethod lib.join/with-join-alias-method :field
  [field-ref join-alias]
  (lib.options/update-options field-ref assoc :join-alias join-alias))

(defn fields
  "Specify the `:fields` for a query."
  ([xs]
   (fn [query stage-number]
     (fields query stage-number xs)))

  ([query xs]
   (fields query -1 xs))

  ([query stage-number xs]
   (let [xs (mapv #(->field query stage-number %)
                  xs)]
     (lib.util/update-query-stage query stage-number assoc :fields xs))))

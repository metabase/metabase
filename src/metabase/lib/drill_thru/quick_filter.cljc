(ns metabase.lib.drill-thru.quick-filter
  (:require
   [medley.core :as m]
   [metabase.lib.drill-thru.column-filter :as lib.drill-thru.column-filter]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.malli :as mu]))

(defn- operator [op & args]
  (lib.options/ensure-uuid (into [op {}] args)))

(mu/defn ^:private operators-for :- [:sequential ::lib.schema.drill-thru/drill-thru.quick-filter.operator]
  [column :- lib.metadata/ColumnMetadata
   value]
  (let [field-ref (lib.ref/ref column)]
    (cond
      (lib.types.isa/structured? column)
      []

      (= value :null)
      [{:name "=" :filter (operator :is-null  field-ref)}
       {:name "≠" :filter (operator :not-null field-ref)}]

      (or (lib.types.isa/numeric? column)
          (lib.types.isa/temporal? column))
      (for [[op label] [[:<  "<"]
                        [:>  ">"]
                        [:=  "="]
                        [:!= "≠"]]]
        {:name   label
         :filter (operator op field-ref value)})

      (lib.types.isa/string? column)
      (for [[op label] [[:=  "="]
                        [:!= "≠"]
                        [:contains "contains"]
                        [:does-not-contain "does-not-contain"]]]
        {:name   label
         :filter (operator op field-ref value)})

      :else
      (for [[op label] [[:=  "="]
                        [:!= "≠"]]]
        {:name   label
         :filter (operator op field-ref value)}))))

(mu/defn quick-filter-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.quick-filter]
  "Filter the current query based on the value clicked.

  The options vary depending on the type of the field:
  - `:is-null` and `:not-null` for a `NULL` value;
  - `:=` and `:!=` for everything else;
  - plus `:<` and `:>` for numeric and date columns.

  Note that this returns a single `::drill-thru` value with 1 or more `:operators`; these are rendered as a set of small
  buttons in a single row of the drop-down."
  [query                                :- ::lib.schema/query
   stage-number                         :- :int
   {:keys [column value], :as _context} :- ::lib.schema.drill-thru/context]
  (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
             column
             (some? value) ; Deliberately allows value :null, only a missing value should fail this test.
             (not (lib.types.isa/primary-key? column))
             (not (lib.types.isa/foreign-key? column)))
    ;; For aggregate columns, we want to introduce a new stage when applying the drill-thru.
    ;; [[lib.drill-thru.column-filter/filter-drill-adjusted-query]] handles this. (#34346)
    (let [adjusted (lib.drill-thru.column-filter/filter-drill-adjusted-query query stage-number column)]
      (merge {:lib/type   :metabase.lib.drill-thru/drill-thru
              :type       :drill-thru/quick-filter
              :operators  (operators-for (:column adjusted) value)
              :value      value}
             adjusted))))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/quick-filter
  [_query _stage-number drill-thru]
  (-> (select-keys drill-thru [:type :operators :value])
      (update :operators (fn [operators]
                           (mapv :name operators)))))

(mu/defmethod lib.drill-thru.common/drill-thru-method :drill-thru/quick-filter :- ::lib.schema/query
  [_query                      :- ::lib.schema/query
   _stage-number               :- :int
   {:keys [query stage-number]
    :as drill}                 :- ::lib.schema.drill-thru/drill-thru.quick-filter
   filter-op                   :- ::lib.schema.common/non-blank-string]
  (let [quick-filter (or (m/find-first #(= (:name %) filter-op) (:operators drill))
                         (throw (ex-info (str "No matching filter for operator " filter-op)
                                         {:drill-thru   drill
                                          :operator     filter-op
                                          :query        query
                                          :stage-number stage-number})))]
    (lib.filter/filter query stage-number (:filter quick-filter))))

(ns metabase.lib.drill-thru.quick-filter
  (:require
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.malli :as mu]))

(defn- operator [op & args]
  (lib.options/ensure-uuid (into [op {}] args)))

(mu/defn ^:private operators-for :- [:sequential [:map [:name string?] [:filter ::lib.schema.expression/boolean]]]
  [column :- lib.metadata/ColumnMetadata
   value]
  (let [field-ref (lib.ref/ref column)]
    (cond
      (lib.types.isa/structured? column)  []
      (= value :null)                     [{:name "=" :filter (operator :is-null  field-ref)}
                                           {:name "≠" :filter (operator :not-null field-ref)}]
      (or (lib.types.isa/numeric? column)
          (lib.types.isa/date? column))   (for [[op label] [[:<  "<"]
                                                            [:>  ">"]
                                                            [:=  "="]
                                                            [:!= "≠"]]]
                                            {:name   label
                                             :filter (operator op field-ref value)})
      :else                               (for [[op label] [[:=  "="]
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
  [query                  :- ::lib.schema/query
   stage-number           :- :int
   {:keys [column value]} :- ::lib.schema.drill-thru/context]
  (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
             ;(editable? query stage-number)
             column
             (some? value)
             (not (lib.types.isa/primary-key? column))
             (not (lib.types.isa/foreign-key? column)))
    {:lib/type  :metabase.lib.drill-thru/drill-thru
     :type      :drill-thru/quick-filter
     :operators (operators-for column value)}))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/quick-filter
  [_query _stage-number drill-thru]
  {:type      (:type drill-thru)
   :operators (map :name (:operators drill-thru))})

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/quick-filter
  [query stage-number drill-thru filter-op & _more]
  (if-let [quick-filter (first (filter #(= (:name %) filter-op) (:operators drill-thru)))]
    (lib.filter/filter query stage-number (:filter quick-filter))
    (throw (ex-info (str "No matching filter for operator " filter-op)
                    {:drill-thru   drill-thru
                     :operator     filter-op
                     :query        query
                     :stage-number stage-number}))))

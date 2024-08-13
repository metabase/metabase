(ns metabase.lib.drill-thru.column-extract
  "Adds an expression clause based on the selected column and temporal unit.

  Entry points:

  - Column header

  Query transformation:

  - Add an expression that extracts the specified value from this column.

  Extra constraints:

  - MBQL stages only
  - Database must support `:regex` feature for the URL and Email extractions to work."
  (:require
   [medley.core :as m]
   [metabase.lib.drill-thru.column-filter :as lib.drill-thru.column-filter]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.extraction :as lib.extraction]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.schema.extraction :as lib.schema.extraction]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli :as mu]))

(defn- column-extract-drill-for-column [query column]
  (when-let [extractions (not-empty (lib.extraction/column-extractions query column))]
    {:extractions  extractions
     :display-name (cond
                     (lib.types.isa/temporal? column) (i18n/tru "Extract day, month…")
                     (lib.types.isa/email? column)    (i18n/tru "Extract domain, host…")
                     (lib.types.isa/URL? column)      (i18n/tru "Extract domain, subdomain…"))}))

(mu/defn column-extract-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.column-extract]
  "Column clicks on temporal columns only.

  Might add a stage, like `:drill-thru/column-filter` does, if the current stage has aggregations."
  [query                       :- ::lib.schema/query
   stage-number                :- :int
   {:keys [column column-ref value]} :- ::lib.schema.drill-thru/context]
  (when (and column
             (nil? value)
             (lib.drill-thru.common/mbql-stage? query stage-number))
    (when-let [drill (column-extract-drill-for-column query column)]
      (merge drill
             {:lib/type :metabase.lib.drill-thru/drill-thru
              :type     :drill-thru/column-extract}
             (lib.drill-thru.column-filter/prepare-query-for-drill-addition
               query stage-number column column-ref :expression)))))

(mu/defn extractions-for-drill :- [:sequential ::lib.schema.extraction/extraction]
  "Returns the extractions from a given drill."
  [drill :- ::lib.schema.drill-thru/drill-thru.column-extract]
  (:extractions drill))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/column-extract
  [query stage-number drill]
  (-> drill
      (select-keys [:display-name :type])
      (assoc :extractions (map #(lib.metadata.calculation/display-info query stage-number %)
                               (:extractions drill)))))

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/column-extract
  [_query _stage-number {:keys [query stage-number column extractions]} & [tag]]
  (let [tag        (keyword tag)
        extraction (m/find-first #(= (:tag %) tag) extractions)]
    (lib.extraction/extract query stage-number
                            ;; Replace the column on the extraction because we added an extra stage.
                            (assoc extraction :column column))))

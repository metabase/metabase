(ns metabase.lib.drill-thru.column-extract
  "Adds an expression clause based on the selected column and temporal unit.

  Entry points:

  - Column header

  Query transformation:

  - Add an expression that extracts the specified value from this column.

  Extra constraints:

  - Database must support `:regex` feature for the URL and Email extractions to work."
  (:require
   [medley.core :as m]
   [metabase.lib.drill-thru.column-filter :as lib.drill-thru.column-filter]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.shared.util.i18n :as i18n]
   [metabase.shared.util.time :as shared.ut]
   [metabase.util.malli :as mu]))

(defn- column-extract-temporal-units [column]
  (let [time-units [:hour-of-day]
        date-units [:day-of-month :day-of-week :month-of-year :quarter-of-year :year]]
    (vec (for [unit (concat (when-not (lib.types.isa/date-without-time? column)
                              time-units)
                            (when-not (lib.types.isa/time? column)
                              date-units))]
           {:key          unit
            :display-name (lib.temporal-bucket/describe-temporal-unit unit)}))))

(defn- regex-available? [metadata-providerable]
  ((:features (lib.metadata/database metadata-providerable)) :regex))

(defn- column-extract-drill-for-column [query column]
  (cond
    (lib.types.isa/temporal? column) {:display-name (i18n/tru "Extract day, month…")
                                      :extractions  (column-extract-temporal-units column)}

    ;; The URL and email extractions are powered by regular expressions, and not every database supports those.
    ;; If the target database doesn't support :regex feature, return nil.
    (not (regex-available? query))   nil
    (lib.types.isa/email? column)    {:display-name (i18n/tru "Extract domain")
                                      :extractions  [{:key          :domain
                                                      :display-name (i18n/tru "Domain")}
                                                     {:key          :host
                                                      :display-name (i18n/tru "Host")}]}
    (lib.types.isa/URL? column)      {:display-name (i18n/tru "Extract domain, subdomain…")
                                      :extractions  [{:key          :domain
                                                      :display-name (i18n/tru "Domain")}
                                                     {:key          :subdomain
                                                      :display-name (i18n/tru "Subdomain")}
                                                     {:key          :host
                                                      :display-name (i18n/tru "Host")}]}))

(mu/defn column-extract-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.column-extract]
  "Column clicks on temporal columns only.

  Might add a stage, like `:drill-thru/column-filter` does, if the current stage has aggregations."
  [query                       :- ::lib.schema/query
   stage-number                :- :int
   {:keys [column column-ref value]} :- ::lib.schema.drill-thru/context]
  (when (and column (nil? value))
    (when-let [drill (column-extract-drill-for-column query column)]
      (merge drill
             {:lib/type :metabase.lib.drill-thru/drill-thru
              :type     :drill-thru/column-extract}
             (lib.drill-thru.column-filter/prepare-query-for-drill-addition
               query stage-number column column-ref :expression)))))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/column-extract
  [_query _stage-number drill]
  (select-keys drill [:display-name :extractions :type]))

(defn- case-expression
  "Creates a case expression with a condition for each value of the unit."
  [expression-fn unit n]
  (lib.expression/case
    (for [raw-value (range 1 (inc n))]
      [(lib.filter/= (expression-fn) raw-value) (shared.ut/format-unit raw-value unit)])
    ""))

(defn- extraction-expression [column tag]
  (case tag
    ;; Temporal extractions
    :hour-of-day     (lib.expression/get-hour column)
    :day-of-month    (lib.expression/get-day column)
    :day-of-week     (case-expression #(lib.expression/get-day-of-week column) tag 7)
    :month-of-year   (case-expression #(lib.expression/get-month column) tag 12)
    :quarter-of-year (case-expression #(lib.expression/get-quarter column) tag 4)
    :year            (lib.expression/get-year column)
    ;; URLs and emails
    :domain          (lib.expression/domain column)
    :subdomain       (lib.expression/subdomain column)
    :host            (lib.expression/host column)))

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/column-extract
  [_query _stage-number {:keys [query stage-number column extractions]} & [tag]]
  (let [tag                    (keyword tag)
        {:keys [display-name]} (m/find-first #(= (:key %) tag) extractions)
        unique-name-fn         (lib.util/unique-name-generator)]
    (doseq [col-name (->> (lib.util/query-stage query stage-number)
                          (lib.metadata.calculation/returned-columns query stage-number)
                          (map :name))]
      (unique-name-fn col-name))
    (lib.expression/expression
      query
      stage-number
      (unique-name-fn display-name)
      (extraction-expression column tag))))

(ns metabase-enterprise.metabot-v3.tools.filters
  (:require
   [clojure.edn :as edn]
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.envelope :as metabot-v3.envelope]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.api.card :as api.card]
   [metabase.api.common :as api]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.options :as lib.options]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]))

(defn- resolve-column
  [{:keys [field_id] :as item} field-id-prefix columns]
  (when-not (str/starts-with? field_id field-id-prefix)
    (throw (ex-info (str "field " field_id " not found") {:expected-prefix field-id-prefix})))
  (let [field-ref (-> field_id (subs (count field-id-prefix)) edn/read-string lib.options/ensure-uuid)
        column (lib/find-matching-column field-ref columns)]
    (assoc item :column column)))

(defn- add-filter
  [query {:keys [column operation value]}]
  (let [filter
        (case (keyword operation)
          :is-null                      (lib/is-null column)
          :is-not-null                  (lib/not-null column)
          :string-is-empty              (lib/is-empty column)
          :string-is-not-empty          (lib/not-empty column)
          :is-true                      (lib/= column true)
          :is-false                     (lib/= column false)
          :year-equals                  (lib/= (lib/get-year column) value)
          :year-not-equals              (lib/!= (lib/get-year column) value)
          :quarter-equals               (lib/= (lib/get-quarter column) value)
          :quarter-not-equals           (lib/!= (lib/get-quarter column) value)
          :month-equals                 (lib/= (lib/get-month column) value)
          :month-not-equals             (lib/!= (lib/get-month column) value)
          :day-of-week-equals           (lib/= (lib/get-day-of-week column :iso) value)
          :day-of-week-not-equals       (lib/!= (lib/get-day-of-week column :iso) value)
          :hour-equals                  (lib/= (lib/get-hour column) value)
          :hour-not-equals              (lib/!= (lib/get-hour column) value)
          :minute-equals                (lib/= (lib/get-minute column) value)
          :minute-not-equals            (lib/!= (lib/get-minute column) value)
          :second-equals                (lib/= (lib/get-second column) value)
          :second-not-equals            (lib/!= (lib/get-second column) value)
          :date-equals                  (lib/= column value)
          :date-not-equals              (lib/!= column value)
          :date-before                  (lib/< column value)
          :date-on-or-before            (lib/<= column value)
          :date-after                   (lib/> column value)
          :date-on-or-after             (lib/>= column value)
          :string-equals                (lib/= column value)
          :string-not-equals            (lib/!= column value)
          :string-contains              (lib/contains column value)
          :string-not-contains          (lib/not (lib/contains column value))
          :string-starts-with           (lib/starts-with column value)
          :string-ends-with             (lib/ends-with column value)
          :number-equals                (lib/= column value)
          :number-not-equals            (lib/!= column value)
          :number-greater-than          (lib/> column value)
          :number-greater-than-or-equal (lib/>= column value)
          :number-less-than             (lib/< column value)
          :number-less-than-or-equal    (lib/<= column value)
          (throw (ex-info (str "unknown filter operation " operation) {})))]
    (lib/filter query filter)))

(defn- add-breakout
  [query {:keys [column field-granularity]}]
  (when (and field-granularity
             (not (lib.types.isa/temporal? column)))
    (throw (ex-info "field_granularity can only be specified for date fields" {})))
  (let [expr (cond-> column
               field-granularity (lib/with-temporal-bucket (keyword field-granularity)))]
    (lib/breakout query expr)))

(defn- query-metric
  [{:keys [metric-id filters group-by] :as _arguments}]
  (if-let [card (api.card/get-card metric-id)]
    (let [mp (lib.metadata.jvm/application-database-metadata-provider (:database_id card))
          base-query (->> (lib/query mp (lib.metadata/card mp metric-id))
                          lib/remove-all-breakouts)
          filterable-cols (lib/filterable-columns base-query)
          breakoutable-cols (lib/breakoutable-columns base-query)
          filter-field-id-prefix (str "field_[card__" metric-id "]_")
          query (as-> base-query $q
                  (reduce add-filter $q (map #(resolve-column % filter-field-id-prefix filterable-cols) filters))
                  (reduce add-breakout $q (map #(resolve-column % filter-field-id-prefix breakoutable-cols) group-by)))
          query-id (u/generate-nano-id)
          query-field-id-prefix (str "field_[query__" query-id "]_")]
      {:type :query
       :query_id query-id
       :query (lib.convert/->legacy-MBQL query)
       :result_columns (mapv #(metabot-v3.tools.u/->result-column % query-field-id-prefix) (lib/returned-columns query))})
    "metric not found"))

(comment
  (binding [api/*current-user-permissions-set* (delay #{"/"})]
    (let [id 135]
      (query-metric {:metric-id id})))
  -)

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/query-metric
  [_tool-name arguments _e]
  {:output (query-metric arguments)})

(comment
  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user-id* 2
            api/*is-superuser?* true]
    (query-metric {:metric-id 135,
                   :filters
                   [{:operation "number-greater-than",
                     :field_id "field_[27]_[:field {:base-type :type/Float, :effective-type :type/Float} 257]",
                     :value 35}],
                   :group-by nil}))
  -)

(defn- base-query
  [data-source e]
  (let [{:keys [table_id query_id report_id]} data-source]
    (cond
      (some? table_id)
      [(str "field_[" table_id "]_")
       (let [table (metabot-v3.tools.u/get-table table_id :db_id)
             mp (lib.metadata.jvm/application-database-metadata-provider (:db_id table))]
         (lib/query mp (lib.metadata/table mp table_id)))]

      (some? report_id)
      [(str "field_[card__" report_id "]_")
       (let [card (api.card/get-card report_id)
             mp (lib.metadata.jvm/application-database-metadata-provider (:database_id card))]
         (lib/query mp (lib.metadata/card mp report_id)))]

      (some? query_id)
      (if-let [query (metabot-v3.envelope/find-query e query_id)]
        [(str "field_[query__" query_id "]_")
         (let [mp (lib.metadata.jvm/application-database-metadata-provider (:database query))]
           (lib/query mp query))]
        (throw (ex-info (str "No query found with id " query_id) {:data_source data-source}))))))

(defn- filter-records
  [{:keys [data-source filters] :as _arguments} e]
  (let [[filter-field-id-prefix base] (base-query data-source e)
        filterable-cols (lib/filterable-columns base)
        query (reduce add-filter base (map #(resolve-column % filter-field-id-prefix filterable-cols) filters))
        query-id (u/generate-nano-id)
        query-field-id-prefix (str "field_[query__" query-id "]_")]
    {:type :query
     :query_id query-id
     :query (lib.convert/->legacy-MBQL query)
     :result_columns (mapv #(metabot-v3.tools.u/->result-column % query-field-id-prefix)
                           (lib/returned-columns query))}))

(comment
  (binding [api/*current-user-permissions-set* (delay #{"/"})
            api/*current-user-id* 2
            api/*is-superuser?* true]
    (filter-records {:data-source {:table_id 27}
                     :filters [{:operation "number-greater-than"
                                :field_id "field_[27]_[:field {:base-type :type/Float, :effective-type :type/Float} 257]"
                                :value 50}]}
                    nil))
  -)

(mu/defmethod metabot-v3.tools.interface/*invoke-tool* :metabot.tool/filter-records
  [_tool-name arguments e]
  {:output (filter-records arguments e)})

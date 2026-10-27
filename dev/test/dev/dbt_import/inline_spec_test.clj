(ns dev.dbt-import.inline-spec-test
  "The converter over a manifest written on the dbt 1.12 inline spec: `parcel_delivery_manifest.json`, the `dbt parse`
  of the small project under `dev/resources/dbt_import/parcel_delivery/` (see [[dev.dbt-import.fixture]]).

  The other tests' fixtures are on the legacy spec, where a semantic model declares `measures` and a metric points
  at one. On the inline spec a semantic model has no measures at all: a simple metric carries its own aggregation, in
  `type_params.metric_aggregation_params` plus `type_params.expr`, and a cumulative metric points at the simple
  metric it runs over, in `cumulative_type_params.metric` and `depends_on`, rather than at a semantic model. The
  entities and dimensions come out the same as on the legacy spec, including the SQL dimensions `derived_semantics`
  adds. These tests pin that shape down, metric by metric, and check that the rest of the pipeline converts the result
  the same way it does legacy-spec metrics."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [dev.dbt-import.emit :as emit]
   [dev.dbt-import.parse :as parse]
   [dev.dbt-import.resolve :as resolve]
   [dev.dbt-import.schemas.ir :as ir]
   [mb.hawk.assert-exprs]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:private manifest-filename
  (.getPath ^java.net.URL (io/resource "dbt_import/parcel_delivery_manifest.json")))

(def ^:private db "The Metabase database the fixture's warehouse database `parcels` maps to." "Parcels")

(def ^:private config
  {:databases     {"parcels" db}
   :driver        :postgres
   :creator-email "admin@example.com"})

(defn- fld
  "The `:field` clause serdes writes for `column` on `public.<table>`."
  [table column base-type]
  [:field {:base-type base-type, :effective-type base-type} [db "public" table column]])

(def ^:private parsed
  (delay (parse/parse-manifest-file manifest-filename)))

(defn- metric-named [metric-name]
  (some #(when (= metric-name (:name %)) %) (:metrics @parsed)))

(def ^:private converted
  "What resolve and emit make of the parsed fixture: `:unsupported` as metric name → reason, and `:metrics` as metric
  name → its entity id, the clauses of its query, and its unsupported dimensions as name → reason."
  (delay
    (let [resolved (resolve/resolve-manifest config @parsed)]
      {:unsupported (into {} (map (juxt :name :reason)) (:unsupported resolved))
       :metrics     (into {}
                          (for [{:keys [metric]} (emit/files config resolved)
                                :when metric
                                :let  [stage (-> (emit/dataset-query metric) :stages first)]]
                            [(-> metric :metric :name)
                             {:entity-id              (:entity-id metric)
                              :aggregation            (first (:aggregation stage))
                              :filters                (:filters stage [])
                              :source-table           (:source-table stage)
                              :unsupported-dimensions (into {} (map (juxt :name :reason)) (:unsupported-dimensions metric))}]))})))

(deftest ^:parallel parse-semantic-models-test
  (let [{:keys [semantic-models] :as manifest} @parsed]
    (is (mr/validate ::ir/manifest manifest))
    (is (= {:tool "dbt", :version "1.12.6", :project "parcel_delivery"}
           (:source manifest)))
    (is (= #{"daily_depot_volume" "delivery_runs" "parcels" "delivery_exceptions"}
           (set (keys semantic-models))))
    (testing "the inline spec declares no measures: every aggregation lives on a metric"
      (is (= {"daily_depot_volume" {}, "delivery_runs" {}, "parcels" {}, "delivery_exceptions" {}}
             (update-vals semantic-models :measures))))
    (testing "the relation comes from the model node, in the profile's database"
      (is (= {:database "parcels", :schema "public", :table "delivery_runs"}
             (get-in semantic-models ["delivery_runs" :relation]))))
    (testing "the model-level agg_time_dimension is the default"
      (is (= {"daily_depot_volume" "volume_date", "delivery_runs" "scheduled_at", "parcels" "created_at", "delivery_exceptions" "opened_at"}
             (update-vals semantic-models :default-agg-time-dimension))))
    (testing "entities declared on columns: a primary entity without a name is named after its column"
      (is (= [{:name "depot_day_id", :type :primary, :expr "depot_day_id"}]
             (map #(select-keys % [:name :type :expr]) (get-in semantic-models ["daily_depot_volume" :entities]))))
      (is (= "depot_day_id" (get-in semantic-models ["daily_depot_volume" :primary-entity])))
      (is (= [{:name "delivery_run", :type :primary, :expr "run_id"}
              {:name "depot", :type :foreign, :expr "depot_id"}
              {:name "driver", :type :foreign, :expr "driver_id"}]
             (map #(select-keys % [:name :type :expr]) (get-in semantic-models ["delivery_runs" :entities]))))
      (is (= "delivery_run" (get-in semantic-models ["delivery_runs" :primary-entity]))))
    (testing "dimensions declared on columns, with the column-level granularity, then the derived_semantics ones with their SQL"
      (is (= [["vehicle_plate" :categorical "vehicle_plate" nil]
              ["departed_at" :time "departed_at" :day]
              ["returned_at" :time "returned_at" :day]
              ["shift_started_at" :time "shift_started_at" :day]
              ["shift_ended_at" :time "shift_ended_at" :day]
              ["scheduled_at" :time "scheduled_at" :day]
              ["route_hours" :categorical "route_hours" nil]
              ["route_type" :categorical "route_type" nil]
              ["has_driver" :categorical "CASE WHEN driver_id IS NOT NULL THEN TRUE ELSE FALSE END" nil]
              ["is_unassigned" :categorical "CASE WHEN driver_id IS NULL THEN TRUE ELSE FALSE END" nil]]
             (map (juxt :name :type :expr :granularity) (get-in semantic-models ["delivery_runs" :dimensions])))))
    (testing "a column with no entity or dimension is still a column, with its declared type"
      (is (= {"created_at" "timestamp", "depot_id" "text", "is_delivered" "boolean", "is_fragile" "boolean"
              "is_insured" "boolean", "is_oversized" "boolean", "is_returned" "boolean", "last_scanned_at" "timestamp"
              "next_scan_due_at" "timestamp", "parcel_id" "text", "requires_signature" "boolean", "revision" "integer"
              "scan_events" "jsonb"}
             (update-vals (get-in semantic-models ["parcels" :columns]) :data-type))))))

(deftest ^:parallel parse-metrics-test
  (let [{:keys [metrics unsupported]} @parsed]
    (testing "all nineteen metrics parse"
      (is (= [] unsupported))
      (is (= 19 (count metrics))))
    (testing "a simple metric's aggregation comes from metric_aggregation_params and its expr from type_params; it names no measure"
      (is (= {"avg_route_hours"     [:simple "delivery_runs" :average "route_hours" "scheduled_at"]
              "depots_with_parcels" [:simple "parcels" :count_distinct "depot_id" "created_at"]
              "disputed_exceptions" [:simple "delivery_exceptions" :count "1" "opened_at"]
              "exception_count"     [:simple "delivery_exceptions" :count "1" "opened_at"]
              "median_route_hours"  [:simple "delivery_runs" :percentile "route_hours" "scheduled_at"]
              "new_parcels"         [:simple "parcels" :sum "CASE WHEN revision = 0 THEN 1 ELSE 0 END" "created_at"]
              "open_exceptions"     [:simple "delivery_exceptions" :count "1" "opened_at"]
              "p90_route_hours"     [:simple "delivery_runs" :percentile "route_hours" "scheduled_at"]
              "parcel_count"        [:simple "parcels" :count_distinct "parcel_id" "created_at"]
              "parcels_damaged"     [:simple "daily_depot_volume" :sum "parcels_damaged" "volume_date"]
              "parcels_delayed"     [:simple "daily_depot_volume" :sum "parcels_delayed" "volume_date"]
              "parcels_received"    [:simple "daily_depot_volume" :sum "parcels_received" "volume_date"]
              "resolved_exceptions" [:simple "delivery_exceptions" :count "1" "opened_at"]
              "run_count"           [:simple "delivery_runs" :count "run_id" "scheduled_at"]
              "total_route_hours"   [:simple "delivery_runs" :sum "route_hours" "scheduled_at"]
              ;; a cumulative metric takes the aggregation of the metric it runs over
              "depots_to_date"      [:cumulative "parcels" :count_distinct "depot_id" "created_at"]
              "parcels_to_date"     [:cumulative "parcels" :count_distinct "parcel_id" "created_at"]}
             (into {}
                   (for [{:keys [type] :as metric} metrics
                         :when (#{:simple :cumulative} type)]
                     [(:name metric) ((juxt :type :semantic-model :agg :expr :agg-time-dimension) metric)]))))
      (is (= #{nil} (into #{} (map :measure) (filter :semantic-model metrics)))))
    (testing "labels and descriptions come through"
      (is (= {:label "90th Percentile Route Hours", :description "The 90th percentile of hours spent on a route."}
             (select-keys (metric-named "p90_route_hours") [:label :description]))))
    (testing "agg_params: dbt writes them for every aggregation, with a percentile only for percentile ones; percentile_type continuous is written as approximate, not discrete"
      (is (= {:percentile nil, :use_discrete_percentile false, :use_approximate_percentile false}
             (:agg-params (metric-named "total_route_hours"))))
      (is (= {:percentile 0.5, :use_discrete_percentile false, :use_approximate_percentile true}
             (:agg-params (metric-named "median_route_hours")))))
    (testing "filters on the metric"
      (is (= {"open_exceptions"     ["{{ Dimension('delivery_exception__status') }} != 'resolved'"]
              "resolved_exceptions" ["{{ Dimension('delivery_exception__status') }} = 'resolved'"]
              "disputed_exceptions" ["{{ Dimension('delivery_exception__status') }} = 'disputed'"]
              "exception_count"     []}
             (into {} (map (juxt :name :filters)) (filter (comp #{"delivery_exceptions"} :semantic-model) metrics)))))
    (testing "ratio and derived metrics have the same shape as on the legacy spec"
      (is (= {:type        :ratio
              :numerator   {:metric "parcels_delayed", :alias nil, :filters []}
              :denominator {:metric "parcels_received", :alias nil, :filters []}}
             (select-keys (metric-named "delay_rate") [:type :numerator :denominator])))
      (is (= {:type   :derived
              :expr   "damaged / NULLIF(received, 0) + 1"
              :inputs [{:metric "parcels_damaged", :alias "damaged", :filters []}
                       {:metric "parcels_received", :alias "received", :filters []}]}
             (select-keys (metric-named "damage_index") [:type :expr :inputs]))))))

(deftest ^:parallel parse-cumulative-input-test
  (let [manifest        (parse/read-manifest manifest-filename)
        semantic-models (update-vals (:semantic_models manifest) #(parse/parse-semantic-model manifest %))
        metrics         (:metrics manifest)
        to-date         (get metrics "metric.parcel_delivery.parcels_to_date")
        parse           (fn [metric] (parse/parse-metric semantic-models metrics metric))]
    (testing "a filter on the input metric, or on the reference to it, applies to the cumulative metric too"
      (is (= ["{{ Dimension('parcel__is_delivered') }}" "{{ Dimension('parcel__is_insured') }}"]
             (:filters (parse/parse-metric semantic-models
                                           (assoc-in metrics ["metric.parcel_delivery.parcel_count" :filter]
                                                     {:where_filters [{:where_sql_template "{{ Dimension('parcel__is_delivered') }}"}]})
                                           (assoc-in to-date [:type_params :cumulative_type_params :metric :filter]
                                                     {:where_filters [{:where_sql_template "{{ Dimension('parcel__is_insured') }}"}]}))))))
    (testing "the input metric has to be in the manifest, and be a simple metric"
      (is (= "input metric \"metric.parcel_delivery.parcel_count\" not found in manifest"
             (:reason (parse/parse-metric semantic-models to-date)))
          "without the manifest's metrics, as the two-arity parse-metric is called")
      (is (= "input metric \"metric.parcel_delivery.nope\" not found in manifest"
             (:reason (parse (assoc-in to-date [:depends_on :nodes] ["metric.parcel_delivery.nope"])))))
      (is (= "a cumulative metric over the ratio metric \"delay_rate\" has no Metabase equivalent: only a simple aggregation can run cumulatively"
             (:reason (parse (assoc-in to-date [:depends_on :nodes] ["metric.parcel_delivery.delay_rate"]))))))
    (testing "a window or grain_to_date is reported before the input is looked at, as on the legacy spec"
      (is (= "a cumulative metric with a window of 7 day has no Metabase equivalent: MBQL has no rolling-window aggregation"
             (:reason (parse (assoc-in to-date [:type_params :cumulative_type_params :window] {:count 7, :granularity "day"}))))))))

(deftest ^:parallel convert-test
  (let [{:keys [metrics unsupported]} @converted
        entity-id                     #(get-in metrics [% :entity-id])]
    (testing "what cannot be converted is reported with the reason: a running count_distinct"
      (is (= {"parcels_to_date" "a running count_distinct has no Metabase equivalent: only a running sum or row count does"
              "depots_to_date"  "a running count_distinct has no Metabase equivalent: only a running sum or row count does"}
             unsupported)))
    (testing "the other seventeen convert to the same clauses the legacy spec does"
      (is (= {"avg_route_hours"     [:avg {} (fld "delivery_runs" "route_hours" :type/Float)]
              "depots_with_parcels" [:distinct {} (fld "parcels" "depot_id" :type/Text)]
              "disputed_exceptions" [:count {}]
              "exception_count"     [:count {}]
              "median_route_hours"  [:percentile {} (fld "delivery_runs" "route_hours" :type/Float) 0.5]
              "new_parcels"         [:sum {} [:case {} [[[:= {} (fld "parcels" "revision" :type/Integer) 0] 1]] 0]]
              "open_exceptions"     [:count {}]
              "p90_route_hours"     [:percentile {} (fld "delivery_runs" "route_hours" :type/Float) 0.9]
              "parcel_count"        [:distinct {} (fld "parcels" "parcel_id" :type/Text)]
              "parcels_damaged"     [:sum {} (fld "daily_depot_volume" "parcels_damaged" :type/Integer)]
              "parcels_delayed"     [:sum {} (fld "daily_depot_volume" "parcels_delayed" :type/Integer)]
              "parcels_received"    [:sum {} (fld "daily_depot_volume" "parcels_received" :type/Integer)]
              "resolved_exceptions" [:count {}]
              "run_count"           [:count-where {} [:not-null {} (fld "delivery_runs" "run_id" :type/Text)]]
              "total_route_hours"   [:sum {} (fld "delivery_runs" "route_hours" :type/Float)]
              "delay_rate"          [:/ {} [:metric {} (entity-id "parcels_delayed")] [:metric {} (entity-id "parcels_received")]]
              "damage_index"        [:+ {} [:/ {} [:metric {} (entity-id "parcels_damaged")] [:metric {} (entity-id "parcels_received")]] 1]}
             (update-vals metrics :aggregation))))
    (testing "the metric filters resolve against the primary entity's dimensions"
      (is (= {"open_exceptions"     [[:!= {} (fld "delivery_exceptions" "status" :type/Text) "resolved"]]
              "resolved_exceptions" [[:= {} (fld "delivery_exceptions" "status" :type/Text) "resolved"]]
              "disputed_exceptions" [[:= {} (fld "delivery_exceptions" "status" :type/Text) "disputed"]]
              "exception_count"     []}
             (into {} (map (juxt key (comp :filters val)))
                   (filter #(= [db "public" "delivery_exceptions"] (:source-table (val %))) metrics)))))
    (testing "the derived_semantics SQL dimensions are reported on every metric of their model, nothing else is"
      (is (= {"has_driver"    "dimension \"has_driver\" is the SQL expression \"CASE WHEN driver_id IS NOT NULL THEN TRUE ELSE FALSE END\"; a dimension mapping targets a column, not SQL"
              "is_unassigned" "dimension \"is_unassigned\" is the SQL expression \"CASE WHEN driver_id IS NULL THEN TRUE ELSE FALSE END\"; a dimension mapping targets a column, not SQL"}
             (get-in metrics ["run_count" :unsupported-dimensions])))
      (is (= #{"avg_route_hours" "median_route_hours" "p90_route_hours" "run_count" "total_route_hours"}
             (into #{} (keep (fn [[metric-name {:keys [unsupported-dimensions]}]]
                               (when (seq unsupported-dimensions) metric-name)))
                   metrics))))))

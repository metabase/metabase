(ns metabase-enterprise.semantic-layer-import.dbt.core-test
  "The dbt entry point, [[dbt-import/convert!]]: a manifest file in, a serdes tree and a report out. The report is
  what a user of the tool reads, so its shape is pinned here: what converted and where it was written, with its notes
  and the dimensions it could not be given; what did not convert, with the reason; and what the import failed on."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.semantic-layer-import.core :as semantic-layer-import]
   [metabase-enterprise.semantic-layer-import.dbt.core :as dbt-import]
   [metabase-enterprise.semantic-layer-import.dbt.test-util :as tu]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private avg-one
  "A measure the resolve stage reports: an average of the literal 1."
  (assoc (tu/base-measure) :name "avg_one" :agg "average" :expr "1"))

(def ^:private with-avg-one-metric
  "A `:edit` fn for [[tu/build-manifest]] that adds a metric over [[avg-one]] next to the fixture's `m`."
  (tu/add-metric "avg_one" #(-> %
                                (assoc :label "Average of one")
                                (tu/over-measure "avg_one"))))

(def ^:private with-cumulative-metric
  "A `:edit` fn for [[tu/build-manifest]] that adds a cumulative metric over the fixture's measure `m`, with
  `period_agg: last` so that it converts, next to the fixture's `m`."
  (tu/add-metric "cum_sales" #(-> %
                                  (assoc :label "Cumulative sales", :type "cumulative")
                                  (assoc-in [:type_params :cumulative_type_params]
                                            {:window nil, :grain_to_date nil, :period_agg "last"}))))

(def ^:private sql-dimensions
  "The fixture's dimensions over SQL, which cannot become curated dimensions of a metric on `fact_sales`."
  [{:name   "next_day"
    :reason (str "dimension \"next_day\" is the SQL expression \"date_day + 1\";"
                 " a dimension mapping targets a column, not SQL")}
   {:name   "is_big_sale"
    :reason (str "dimension \"is_big_sale\" is the SQL expression \"case when"
                 " sales > 100 then 1 else 0 end\"; a dimension mapping targets"
                 " a column, not SQL")}
   {:name   "is_cancelled_order"
    :reason (str "dimension \"is_cancelled_order\" is the SQL expression \"case"
                 " when status = 'Cancelled' then 1 else 0 end\"; a dimension"
                 " mapping targets a column, not SQL")}
   {:name   "is_aviation_order"
    :reason (str "dimension \"is_aviation_order\" is the SQL expression \"case"
                 " when product_category = 'Aviation' then 1 else 0 end\"; a"
                 " dimension mapping targets a column, not SQL")}])

(deftest convert!-report-test
  (mt/with-temp-dir [dir nil]
    (let [manifest-file (io/file dir "manifest.json")
          out-dir       (str (io/file dir "out"))
          _             (spit manifest-file (json/encode (tu/build-manifest {:measures [(tu/base-measure) avg-one]
                                                                             :edit     (comp with-cumulative-metric
                                                                                             with-avg-one-metric)})))
          report        (dbt-import/convert! {:manifest (str manifest-file)
                                              :out-dir  out-dir
                                              :config   (assoc tu/default-config :collection-name "dbt import")})
          read-yaml     (partial tu/read-yaml out-dir)]
      (is (mr/validate ::semantic-layer-import/report report))
      (is (= out-dir (:out-dir report)))
      (testing "the converted metrics, the file each was written to, its notes and the dimensions it could not be given"
        (is (=? [{:kind                   :metric
                  :name                   "cum_sales"
                  :path                   "collections/main/dbt_import/cumulative_sales.yaml"
                  :notes                  [#"^a cumulative metric is a running total.*"]
                  :unsupported-dimensions sql-dimensions}
                 {:kind                   :metric
                  :name                   "m"
                  :path                   "collections/main/dbt_import/m.yaml"
                  :notes                  []
                  :unsupported-dimensions sql-dimensions}]
                (map #(dissoc % :entity-id) (:converted report))))
        (is (mr/validate ms/NanoIdString (-> report :converted first :entity-id))))
      (testing "the metric that did not convert, with the reason"
        (is (= [{:kind   :metric
                 :name   "avg_one"
                 :reason "expr \"1\": avg over the literal 1 has no Metabase equivalent"}]
               (:unsupported report))))
      (testing "nothing the import itself failed on"
        (is (= [] (:errors report))))
      (testing "the files exist where the report says, under the configured collection"
        (let [{:keys [path entity-id]} (second (:converted report))]
          (is (.exists (io/file out-dir path)))
          (is (= {:name "M", :entity_id entity-id, :type "metric"}
                 (select-keys (read-yaml path) [:name :entity_id :type]))))
        (is (= {:name "dbt import", :slug "dbt_import"}
               (select-keys (read-yaml "collections/main/dbt_import.yaml") [:name :slug])))
        (is (= #{"dbt_import.yaml" "dbt_import"}
               (set (.list (io/file out-dir "collections/main"))))
            "nothing is written for the metric that did not convert")
        (is (= #{"cumulative_sales.yaml" "m.yaml"}
               (set (.list (io/file out-dir "collections/main/dbt_import")))))))))

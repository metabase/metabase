(ns dev.dbt-import.core-test
  "The converter's entry point, [[core/convert!]]: a manifest file in, a serdes tree and a report out. The report is
  what a user of the tool reads, so its shape is pinned here: what converted and where it was written, with the
  dimensions it could not be given, and what did not convert, with the reason."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing]]
   [dev.dbt-import.core :as core]
   [dev.dbt-import.test-util :as tu]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

(def ^:private avg-one
  "A measure the resolve stage reports: an average of the literal 1."
  (assoc (tu/base-measure) :name "avg_one" :agg "average" :expr "1"))

(defn- with-avg-one-metric
  "A `:edit` fn for [[tu/build-manifest]] that adds a metric over [[avg-one]] next to the fixture's `m`."
  [manifest]
  (assoc-in manifest [:metrics "metric.p.avg_one"]
            (-> (get-in manifest [:metrics "metric.p.m"])
                (assoc :name "avg_one", :unique_id "metric.p.avg_one", :label "Average of one")
                (assoc-in [:type_params :measure] (tu/input-measure {:name "avg_one"}))
                (assoc-in [:type_params :input_measures] [(tu/input-measure {:name "avg_one"})]))))

(deftest convert!-report-test
  (mt/with-temp-dir [dir nil]
    (let [manifest-file (io/file dir "manifest.json")
          out-dir       (str (io/file dir "out"))
          _             (spit manifest-file (json/encode (tu/build-manifest {:measures [(tu/base-measure) avg-one]
                                                                             :edit     with-avg-one-metric})))
          report        (core/convert! {:manifest (str manifest-file)
                                        :out-dir  out-dir
                                        :config   (assoc tu/default-config :collection-name "dbt import")})
          read-yaml     (fn [path] (yaml/parse-string (slurp (io/file out-dir path))))]
      (is (mr/validate ::core/report report))
      (is (= out-dir (:out-dir report)))
      (testing "the converted metric, the file it was written to and the dimensions it could not be given"
        (is (= [{:name                   "m"
                 :path                   "collections/main/dbt_import/m.yaml"
                 :unsupported-dimensions [{:name   "next_day"
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
                                                        " dimension mapping targets a column, not SQL")}]}]
               (map #(dissoc % :entity-id) (:converted report))))
        (is (mr/validate ms/NanoIdString (-> report :converted first :entity-id))))
      (testing "the metric that did not convert, with the reason"
        (is (= [{:name "avg_one", :reason "expr \"1\": average over the literal 1 has no Metabase equivalent"}]
               (:unsupported report))))
      (testing "the files exist where the report says, under the configured collection"
        (let [{:keys [path entity-id]} (first (:converted report))]
          (is (.exists (io/file out-dir path)))
          (is (= {:name "M", :entity_id entity-id, :type "metric"}
                 (select-keys (read-yaml path) [:name :entity_id :type]))))
        (is (= {:name "dbt import", :slug "dbt_import"}
               (select-keys (read-yaml "collections/main/dbt_import.yaml") [:name :slug])))
        (is (= #{"dbt_import.yaml" "dbt_import"}
               (set (.list (io/file out-dir "collections/main"))))
            "nothing is written for the metric that did not convert")))))

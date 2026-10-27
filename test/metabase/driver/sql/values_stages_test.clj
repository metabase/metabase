(ns metabase.driver.sql.values-stages-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.compile :as qp.compile]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]))

(defn- field [column-name base-type & {:as opts}]
  [:field (merge {:lib/uuid (str (random-uuid)) :base-type base-type} opts) column-name])

(defn- clause [tag & args]
  (into [tag {:lib/uuid (str (random-uuid))}] args))

(def ^:private steps
  {:lib/type :mbql.stage/mbql
   :name     "steps"
   :values   {:columns [{:name "step" :base-type :type/Integer} {:name "label" :base-type :type/Text}]
              :rows    [[1 "it's"] [2 nil]]}})

(defn- postgres-compile [stages]
  (driver/with-driver :postgres
    (qp.store/with-metadata-provider meta/metadata-provider
      (qp.compile/compile {:lib/type :mbql/query :database (meta/id) :stages stages}))))

(deftest ^:parallel values-compile-test
  (testing "the rows are the stage's source; text goes as a parameter, never into the SQL"
    (let [{:keys [query params]} (postgres-compile [steps])]
      (is (str/includes? query (str "FROM (SELECT 1 AS \"step\", ? AS \"label\""
                                    " UNION ALL SELECT 2 AS \"step\", NULL AS \"label\") AS \"__mb_source\"")))
      (is (= ["it's"] params))))
  (testing "a later stage joins it with an inequality"
    (let [{:keys [query]} (postgres-compile
                           [{:lib/type :mbql.stage/mbql :name "venues" :source-table (meta/id :venues)}
                            steps
                            {:lib/type     :mbql.stage/mbql
                             :source-stage "venues"
                             :joins        [{:lib/type   :mbql/join :alias "s" :source-stage "steps" :strategy :inner-join
                                             :fields     :all
                                             :conditions [(clause :>= (field "PRICE" :type/Integer)
                                                                  (field "step" :type/Integer :join-alias "s"))]}]
                             :breakout     [(field "step" :type/Integer :join-alias "s")]
                             :aggregation  [(clause :count)]}])]
      (is (str/includes? query "\"__mb_stage_1\" AS (SELECT \"__mb_source\".\"step\" AS \"step\", \"__mb_source\".\"label\" AS \"label\" FROM (SELECT 1"))
      (is (str/includes? query "INNER JOIN \"__mb_stage_1\" AS \"s\" ON \"__mb_source\".\"PRICE\" >= \"s\".\"step\"")))))

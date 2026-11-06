(ns metabase-enterprise.data-complexity-score.appdb-source-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-complexity-score.appdb-source :as appdb-source]
   [metabase-enterprise.data-complexity-score.complexity :as complexity]
   [metabase-enterprise.data-complexity-score.db :as data-complexity-score.db]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------- write --------------------------------------------

(defn- stored-row
  "The `data_complexity_score` row with `fingerprint`, read raw so the model doesn't decode `score_data`."
  [fingerprint]
  (t2/query-one {:select [:fingerprint :source :score_data :created_at]
                 :from   [:data_complexity_score]
                 :where  [:= :fingerprint fingerprint]}))

(deftest ^:synchronized insert-score-row-roundtrips-json-test
  (testing "insert-score-row! writes score_data that reads back as the same JSON, with a database-set created_at"
    ;; The raw INSERT does not trigger the test framework's lazy appdb setup the way a model call does, and the
    ;; `validate-deftest` lint forbids destructive fixtures, so initialize inline.
    (mt/initialize-if-needed! :db)
    (let [fp    (str "appdb-source-test/fp-" (random-uuid))
          score (complexity/score-from-entities [] [] nil {})]
      (is (nil? (appdb-source/insert-score-row! fp "appdb-cli-test" score)))
      (try
        (let [row (stored-row fp)]
          (is (=? {:fingerprint fp, :source "appdb-cli-test", :created_at some?} row))
          (is (= (json/decode (json/encode score) true)
                 (json/decode (:score_data row) true))))
        (finally
          ;; Append-only table, so clean up by hand.
          (t2/delete! :model/DataComplexityScore :fingerprint fp))))))

(deftest ^:synchronized verify-write-target-shape-test
  (mt/initialize-if-needed! :db)
  (testing "the current schema has the columns insert-score-row! writes"
    (is (nil? (appdb-source/verify-write-target-shape!))))
  (testing "a failed probe becomes a :cli-validation error that names the table"
    (mt/with-dynamic-fn-redefs [data-complexity-score.db/probe-score-columns
                                (fn [] (throw (java.sql.SQLException. "relation does not exist" "42P01")))]
      (let [e (try (appdb-source/verify-write-target-shape!)
                   (catch clojure.lang.ExceptionInfo e e))]
        (is (=? {:cli-validation true} (ex-data e)))
        (is (re-find #"data_complexity_score" (ex-message e)))))))

;;; -------------------------------------------- reads --------------------------------------------

(defn- catalog-ids [catalogs]
  (update-vals catalogs #(into #{} (map (juxt :kind :id)) %)))

(deftest ^:synchronized reads-match-the-model-reads-test
  (testing "the CLI's raw reads give the same catalogs as the model reads on a current appdb"
    ;; On MySQL and MariaDB this also covers `is_published` arriving as `0`, which is truthy.
    (collections.tu/with-library [{:keys [metrics]}]
      (mt/with-temp [:model/Database {db-id :id}       {:name "CLI Reads DB"}
                     :model/Card     _                 {:database_id db-id, :type :metric, :name "library_metric"
                                                        :collection_id (:id metrics)}
                     :model/Card     _                 {:database_id db-id, :type :model, :name "plain_model"}
                     :model/Table    {published :id}   {:db_id db-id, :active true, :name "published"
                                                        :collection_id (:id metrics), :is_published true
                                                        :data_layer :final}
                     :model/Table    {unpublished :id} {:db_id db-id, :active true, :name "unpublished"
                                                        :collection_id (:id metrics), :is_published false}
                     :model/Table    _                 {:db_id db-id, :active true, :name "authoritative"
                                                        :data_authority :authoritative}
                     :model/Table    _                 {:db_id db-id, :active true, :name "hidden"
                                                        :visibility_type :hidden}]
        (doseq [scope [nil {:curated-only? true, :collection-id nil}]]
          (testing (pr-str scope)
            (let [model-catalogs (catalog-ids (#'complexity/enumerate-catalogs scope nil))]
              (is (= model-catalogs
                     (catalog-ids (#'complexity/enumerate-catalogs scope (appdb-source/reads)))))
              (is (= {:published true, :unpublished false}
                     {:published   (contains? (:library model-catalogs) [:table published])
                      :unpublished (contains? (:library model-catalogs) [:table unpublished])})
                  "the fixture exercises the Library's published check"))))))))

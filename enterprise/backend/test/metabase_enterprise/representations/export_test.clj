(ns metabase-enterprise.representations.export-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.core :as core]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.yaml :as rep-yaml]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- through-yaml [representation]
  (-> representation
      rep-yaml/generate-string
      rep-yaml/parse-string))

(deftest export-entity-all-entities
  (doseq [model [:model/Card :model/Database :model/Transform :model/Collection :model/NativeQuerySnippet]
          entity (t2/select model)]
    (mt/with-test-user :crowberto
      (let [rep (through-yaml (export/export-entity entity))]
        (is rep)
        (is (core/normalize-representation rep))))))

(deftest rename-refs-empty-test
  (is (= [] (export/rename-refs []
                                export/ref-from-name
                                export/standard-ref-strategies
                                export/add-sequence-number))))

(deftest rename-refs-one-test
  (is (= [{:name "xyz"}]
         (export/rename-refs [{:name "abc"}]
                             (fn [reps] (map #(assoc % ::export/proposed-ref "xyz") reps))
                             []
                             export/add-sequence-number))))

(defn- unique-names?
  [representations]
  (= (count representations)
     (count (into #{} (map :name) representations))))

(deftest hard-one-rename-test
  (is (unique-names? (export/rename-refs [{:name "1" :display_name "b-question-1" :type :question}
                                          {:name "2" :display_name "b" :type :question}
                                          {:name "3" :display_name "b" :type :question}]
                                         export/ref-from-name
                                         export/standard-ref-strategies
                                         export/add-sequence-number))))

(deftest hard-one-2-rename-test
  (let [reps [{:name "1" :display_name "b" :type :question :database "ref:2"}
              {:name "2" :display_name "b" :type :database}]
        reps' (export/rename-refs reps
                                  export/ref-from-name
                                  export/standard-ref-strategies
                                  export/add-sequence-number)]
    (is (= (->> reps'
                (filter #(= :question (:type %)))
                :database
                v0-common/unref)
           (->> reps'
                (filter #(= :database (:type %)))
                :name)))))

(deftest munge-name-english-test
  (testing "Basic English names"
    (is (= "hello-world" (#'export/munge-name "Hello World")))
    (is (= "my-dashboard" (#'export/munge-name "My Dashboard")))
    (is (= "user-report-2024" (#'export/munge-name "User Report 2024")))
    (is (= "sales-data" (#'export/munge-name "Sales_Data")))
    (is (= "trim-spaces" (#'export/munge-name "  Trim Spaces  ")))))

(deftest munge-name-accented-characters-test
  (testing "Accented characters should be preserved"
    (is (= "café" (#'export/munge-name "Café")))
    (is (= "naïve" (#'export/munge-name "Naïve")))
    (is (= "résumé" (#'export/munge-name "Résumé")))
    (is (= "señor" (#'export/munge-name "Señor")))
    (is (= "zürich" (#'export/munge-name "Zürich")))
    (is (= "crème-brûlée" (#'export/munge-name "Crème Brûlée")))))

(deftest munge-name-emoji-test
  (testing "Emojis should be replaced with hyphens"
    (is (= "hello-world" (#'export/munge-name "Hello 😀 World")))
    (is (= "report-2024" (#'export/munge-name "Report 📊 2024")))
    (is (= "dashboard" (#'export/munge-name "🎯 Dashboard 🎯")))
    (is (= "sales-data" (#'export/munge-name "Sales 💰 Data")))
    (is (= "check-this-out" (#'export/munge-name "Check ✅ This ✅ Out")))))

(deftest munge-name-cjk-test
  (testing "Chinese characters should not be replaced with hyphens"
    (is (= "用户报告" (#'export/munge-name "用户报告")))
    (is (= "销售数据-2024" (#'export/munge-name "销售数据 2024")))
    (is (= "我的仪表板" (#'export/munge-name "我的仪表板"))))

  (testing "Japanese characters should not be replaced with hyphens"
    (is (= "ユーザーレポート" (#'export/munge-name "ユーザーレポート")))
    (is (= "売上データ" (#'export/munge-name "売上データ")))
    (is (= "私のダッシュボード" (#'export/munge-name "私のダッシュボード"))))

  (testing "Korean characters should not be replaced with hyphens"
    (is (= "사용자-보고서" (#'export/munge-name "사용자 보고서")))
    (is (= "판매-데이터" (#'export/munge-name "판매 데이터")))
    (is (= "내-대시보드" (#'export/munge-name "내 대시보드")))))

(deftest munge-name-mixed-test
  (testing "Mixed scripts and special characters"
    (is (= "hello-世界" (#'export/munge-name "Hello 世界")))
    (is (= "café-日本" (#'export/munge-name "Café 日本")))
    (is (= "report-2024" (#'export/munge-name "Report!!! 2024")))
    (is (= "my-dashboard" (#'export/munge-name "My---Dashboard")))))

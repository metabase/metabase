(ns metabase.dependencies.calculation-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.dependencies.calculation :as dependencies.calculation]
   [metabase.dependencies.core :as dependencies]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel mbql-query-dependencies-test
  (testing "an MBQL query depends on its source table and the tables it joins implicitly"
    (let [base     (lib/query meta/metadata-provider (meta/table-metadata :orders))
          category (m/find-first #(and (= (meta/id :products) (:table-id %)) (= "CATEGORY" (:name %)))
                                 (lib/breakoutable-columns base))
          query    (lib/breakout base category)]
      (is (= {:card #{} :measure #{} :segment #{} :table #{(meta/id :orders) (meta/id :products)}}
             (dependencies/query-dependencies {} query))))))

(deftest ^:parallel native-query-dependencies-test
  (let [query (lib/native-query meta/metadata-provider "SELECT 1")]
    (testing "a native query depends on what hydrating its row resolved"
      (is (= {:table #{1}}
             (dependencies/query-dependencies
              (with-meta {} {::dependencies.calculation/native-dependencies {:table #{1}}}) query))))
    (testing "a native query of a row that was not hydrated throws"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not hydrated"
                            (dependencies/query-dependencies {:id 1} query))))
    (testing "a native query whose resolution failed throws that failure"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"boom"
                            (dependencies/query-dependencies
                             (with-meta {} {::dependencies.calculation/native-dependencies (ex-info "boom" {})})
                             query))))))

(deftest ^:parallel with-native-dependencies-test
  (testing "only the rows with a native query get native dependencies"
    (let [native (lib/native-query meta/metadata-provider "SELECT 1")
          mbql   (lib/query meta/metadata-provider (lib.metadata/table meta/metadata-provider (meta/id :orders)))
          rows   (dependencies/with-native-dependencies [{:id 1 :query native} {:id 2 :query mbql} {:id 3}] :query)]
      (is (contains? (meta (first rows)) ::dependencies.calculation/native-dependencies))
      (is (not-any? #(contains? (meta %) ::dependencies.calculation/native-dependencies) (rest rows)))
      (is (= [{:id 1 :query native} {:id 2 :query mbql} {:id 3}] rows)))))

(deftest ^:parallel parameters-dependencies-test
  (testing "parameters depend on the cards they take their values from"
    (is (= {:card #{7}}
           (dependencies/parameters-dependencies [{:values_source_config {:card_id 7}} {:id "p"}]))))
  (testing "parameters without a source card have no dependencies"
    (is (= {} (dependencies/parameters-dependencies [{:id "p"}])))
    (is (= {} (dependencies/parameters-dependencies nil)))))

(deftest ^:parallel visualization-settings-dependencies-test
  (testing "click behaviors link to cards and dashboards, of the visualization and of its columns"
    (is (= {:card #{1 3} :dashboard #{2}}
           (dependencies/visualization-settings-dependencies
            {:click_behavior  {:linkType "question" :targetId 1}
             :column_settings {"a" {:click_behavior {:linkType "dashboard" :targetId 2}}
                               "b" {:click_behavior {:linkType "question" :targetId 3}}
                               "c" {:click_behavior {:linkType "url" :targetId 4}}}}))))
  (testing "a target that is not a positive integer is dropped"
    (is (= {:card #{} :dashboard #{}}
           (dependencies/visualization-settings-dependencies
            {:click_behavior {:linkType "question" :targetId {:raw "x"}}})))))

(deftest ^:parallel merge-dependencies-test
  (is (= {:card #{1 2} :table #{3}}
         (dependencies/merge-dependencies {:card #{1}} nil {:card #{2} :table #{3}}))))

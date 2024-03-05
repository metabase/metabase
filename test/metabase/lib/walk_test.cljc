(ns metabase.lib.walk-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.walk :as lib.walk]))

(deftest ^:parallel walk-test
  (let [query {:stages [{:joins [{:stages [{:source-card 1}]}]}]}
        order (atom -1)]
    (is (= {:stages [{:joins     [{:stages    [{:source-card 1
                                                :path-type   :lib.walk/stage
                                                :path        [:stages 0 :joins 0 :stages 0]
                                                :order       0}]
                                   :path-type :lib.walk/join
                                   :path      [:stages 0 :joins 0]
                                   :order     1}]
                      :path-type :lib.walk/stage
                      :path      [:stages 0]
                      :order     2}]}
           (lib.walk/walk
            query
            (fn [_query path-type path stage-or-join]
              (assoc stage-or-join :path-type path-type, :path path, :order (swap! order inc))))))))

(deftest ^:parallel reduced-test
  (let [query             {:stages [{:joins [{:stages [{:source-card 1}]}]}]}
        nodes-visited (atom [])]
    (testing "Should return (reduced ...) value"
      (is (= ::has-source-card
             (lib.walk/walk
              query
              (fn [_query _path-type path stage-or-join]
                (swap! nodes-visited conj path)
                (when (:source-card stage-or-join)
                  (reduced ::has-source-card)))))))
    (testing "Should have only visited the first node since it returned a (reduced ...) value"
      (is (= [[:stages 0 :joins 0 :stages 0]]
             @nodes-visited)))))

(deftest ^:parallel ignore-joins-in-native-stages-test
  (let [query {:stages [{:lib/type :mbql.stage/native
                         :joins    [{:stages [{:source-card 1}]}]}]}
        order (atom -1)]
    (is (= {:stages [{:lib/type  :mbql.stage/native
                      :joins     [{:stages [{:source-card 1}]}]
                      :path-type :lib.walk/stage
                      :path      [:stages 0]
                      :order     0}]}
           (lib.walk/walk
            query
            (fn [_query path-type path stage-or-join]
              (assoc stage-or-join :path-type path-type, :path path, :order (swap! order inc))))))))

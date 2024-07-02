(ns metabase.lib.walk-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [malli.core :as mc]
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

(deftest ^:parallel splice-at-point-test
  (is (= {:stages [{:n 0} {:n 1}        ; before
                   {:x 1} {:x 2} {:x 3} ; new stuff replacing {:n 2}
                   {:n 3} {:n 4}]}      ; after
         (#'lib.walk/splice-at-point
          {:stages [{:n 0} {:n 1} {:n 2} {:n 3} {:n 4}]}
          [:stages 2]
          [{:x 1}
           {:x 2}
           {:x 3}]))))

(deftest ^:parallel return-multiple-stages-test
  (testing "If walk fn returns multiple stages, splice them in to replace the stage. Subsequent calls should see correct path."
    (let [query {:stages [{:lib/type       :mbql.stage/mbql
                           :joins          [{:stages [{:lib/type    :mbql.stage/mbql
                                                       :source-card 1}]}]
                           :original-stage 0}
                          {:lib/type :mbql.stage/mbql, :original-stage 1}
                          {:lib/type :mbql.stage/mbql, :original-stage 2}]}]
      (is (= {:stages [{:lib/type       :mbql.stage/mbql
                        :joins          [{:stages [{:lib/type    :mbql.stage/mbql
                                                    :source-card 1
                                                    :path        [:stages 0 :joins 0 :stages 0]}]}]
                        :path           [:stages 0]
                        :original-stage 0}
                       {:lib/type :mbql.stage/mbql, :new-stage 0, :path [:stages 1]}
                       {:lib/type :mbql.stage/mbql, :new-stage 1, :path [:stages 1]}
                       {:lib/type :mbql.stage/mbql, :new-stage 2, :path [:stages 1]}
                       ;; should see the updated path
                       {:lib/type :mbql.stage/mbql, :original-stage 2, :path [:stages 4]}]}
             (lib.walk/walk
              query
              (fn [_query path-type path stage-or-join]
                (cond
                  ;; ignore joins
                  (= path-type :lib.walk/join)
                  stage-or-join

                  ;; replace the second stage with multiple new stages
                  (= (last path) 1)
                  [{:lib/type :mbql.stage/mbql, :new-stage 0, :path path}
                   {:lib/type :mbql.stage/mbql, :new-stage 1, :path path}
                   {:lib/type :mbql.stage/mbql, :new-stage 2, :path path}]

                  :else
                  (assoc stage-or-join :path path))))
             (lib.walk/walk-stages
              query
              (fn [_query path stage]
                (if (= (last path) 1)
                  ;; replace the second stage with multiple new stages
                  [{:lib/type :mbql.stage/mbql, :new-stage 0, :path path}
                   {:lib/type :mbql.stage/mbql, :new-stage 1, :path path}
                   {:lib/type :mbql.stage/mbql, :new-stage 2, :path path}]
                  (assoc stage :path path)))))))))

(deftest ^:parallel return-multiple-joins-test
  (testing "If walk fn returns multiple stages, splice them in to replace the stage. Subsequent calls should see correct path."
    (let [query {:stages [{:lib/type :mbql.stage/mbql
                           :joins    [{:stages        [{:lib/type :mbql.stage/mbql}]
                                       :original-join 0}
                                      {:stages        [{:lib/type :mbql.stage/mbql}]
                                       :original-join 1}
                                      {:stages        [{:lib/type :mbql.stage/mbql}]
                                       :original-join 2}]}]}]
      (is (= {:stages [{:lib/type :mbql.stage/mbql
                        :joins    [{:stages        [{:lib/type :mbql.stage/mbql
                                                     :path     [:stages 0 :joins 0 :stages 0]}]
                                    :original-join 0
                                    :path          [:stages 0 :joins 0]}
                                   {:stages   [{:lib/type :mbql.stage/mbql}]
                                    :new-join 0
                                    :path     [:stages 0 :joins 1]}
                                   {:stages   [{:lib/type :mbql.stage/mbql}]
                                    :new-join 1
                                    :path     [:stages 0 :joins 1]}
                                   {:stages        [{:lib/type :mbql.stage/mbql
                                                     :path     [:stages 0 :joins 3 :stages 0]}]
                                    :original-join 2
                                    :path          [:stages 0 :joins 3]}]
                        :path     [:stages 0]}]}
             (lib.walk/walk
              query
              (fn [_query _path-type path stage-or-join]
                (if (= path [:stages 0 :joins 1])
                  [{:stages   [{:lib/type :mbql.stage/mbql}]
                    :new-join 0
                    :path     path}
                   {:stages   [{:lib/type :mbql.stage/mbql}]
                    :new-join 1
                    :path     path}]
                  (assoc stage-or-join :path path)))))))))

(deftest ^:parallel path-schema-test
  (are [path] (mc/validate ::lib.walk/path path)
    [:stages 0]
    [:stages 0 :joins 1]
    [:stages 0 :joins 1 :stages 0]
    [:stages 0 :joins 1 :stages 0 :joins 2]
    [:stages 0 :joins 1 :stages 0 :joins 2 :stages 0])
  (are [path] (not (mc/validate ::lib.walk/path path))
    []
    [:stages]
    [:stages 0 :stages 0]
    [:stages -1]
    [:stages 0 :joins]
    [:stages 0 :joins -1]
    [:stages 0 :joins 0 :joins 0]
    [:joins]
    [:joins 0]))

(ns metabase.lib.walk-test
  (:require
   #?@(:clj  ([metabase.util.malli.fn :as mu.fn])
       :cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing use-fixtures]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(use-fixtures :each (fn [thunk]
                      ;;; disable schema enforcement so we don't need mega queries to test stuff here.
                      #?(:clj (binding [mu.fn/*enforce* false]
                                (thunk))
                         :cljs (thunk))))

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

(deftest ^:parallel walk-stages-reversed-test
  (let [query {:stages [{:joins [{:stages [{:source-card 1}]}]}
                        {:joins [{:stages [{:source-table 3}
                                           {}]}
                                 {:stages [{:source-table 4}]}]}]}
        order (atom -1)]
    (is (= {:stages [{:joins     [{:stages    [{:source-card 1
                                                :path-type   :lib.walk/stage
                                                :path        [:stages 0 :joins 0 :stages 0]
                                                :order       6}]
                                   :path-type :lib.walk/join
                                   :path      [:stages 0 :joins 0]
                                   :order     7}]
                      :path-type :lib.walk/stage
                      :path      [:stages 0]
                      :order     8}
                     {:joins     [{:stages    [{:source-table 3
                                                :path-type    :lib.walk/stage
                                                :path         [:stages 1 :joins 0 :stages 0]
                                                :order        3}
                                               {:path-type    :lib.walk/stage
                                                :path         [:stages 1 :joins 0 :stages 1]
                                                :order        2}]
                                   :path-type :lib.walk/join
                                   :path      [:stages 1 :joins 0]
                                   :order     4}
                                  {:stages    [{:source-table 4
                                                :path-type    :lib.walk/stage
                                                :path         [:stages 1 :joins 1 :stages 0]
                                                :order        0}]
                                   :path-type :lib.walk/join
                                   :path      [:stages 1 :joins 1]
                                   :order     1}]
                      :path-type :lib.walk/stage
                      :path      [:stages 1]
                      :order     5}]}
           (lib.walk/walk
            query
            (fn [_query path-type path stage-or-join]
              (assoc stage-or-join :path-type path-type, :path path, :order (swap! order inc)))
            {:reversed? true})))))

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
  (are [path] (mr/validate ::lib.walk/path path)
    [:stages 0]
    [:stages 0 :joins 1]
    [:stages 0 :joins 1 :stages 0]
    [:stages 0 :joins 1 :stages 0 :joins 2]
    [:stages 0 :joins 1 :stages 0 :joins 2 :stages 0])
  (are [path] (not (mr/validate ::lib.walk/path path))
    []
    [:stages]
    [:stages 0 :stages 0]
    [:stages -1]
    [:stages 0 :joins]
    [:stages 0 :joins -1]
    [:stages 0 :joins 0 :joins 0]
    [:joins]
    [:joins 0]))

(deftest ^:parallel walk-clauses-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                  (lib/filter (lib/and
                               (lib/> (meta/field-metadata :venues :id) 50)
                               (lib/< (meta/field-metadata :venues :id) 60))))
        calls (atom [])]
    (is (=? {:stages [{:filters [[:and {}
                                  [:> {}
                                   [:field {} (meta/id :venues :id)]
                                   [:value {:lib/uuid "00000000-0000-0000-0000-000000000000"} 50]]
                                  [:< {}
                                   [:field {} (meta/id :venues :id)]
                                   60]]]}]}
            (lib.walk/walk-clauses
             query
             (fn [_query _path-type _stage-or-join-path clause]
               (swap! calls conj clause)
               (if (= clause 50)
                 [:value {:lib/uuid "00000000-0000-0000-0000-000000000000"} 50]
                 clause)))))
    (is (=? [;; recursing into `>`
             (meta/id :venues :id)
             [:field {} (meta/id :venues :id)]
             50
             [:> {}
              [:field {} (meta/id :venues :id)]
              [:value {:lib/uuid "00000000-0000-0000-0000-000000000000"} 50]]
             ;; recursing into `<`
             (meta/id :venues :id)
             [:field
              {}
              (meta/id :venues :id)]
             60
             [:< {}
              [:field
               {}
               (meta/id :venues :id)]
              60]
             ;; `:filters`
             [:and {}
              [:> {}
               [:field {} (meta/id :venues :id)]
               [:value {:lib/uuid "00000000-0000-0000-0000-000000000000"} 50]]
              [:< {}
               [:field {} (meta/id :venues :id)]
               60]]]
            @calls))))

(deftest ^:parallel walk-clauses-join-conditions-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                  (lib/join (meta/table-metadata :categories)))]
    (is (=? {:stages [{:joins [{:alias      "Categories"
                                :conditions [[:=
                                              {}
                                              [:field {} (meta/id :venues :category-id)]
                                              [:field {:join-alias "Categories"} (meta/id :categories :id)]]]}]}]}
            query))
    (is (=? {:stages [{:joins [{:alias      "Categories"
                                :conditions [[:=
                                              {}
                                              [:field {} "CATEGORY_ID"]
                                              [:field {:join-alias "Categories"} "ID"]]]}]}]}
            (lib.walk/walk-clauses
             query
             (fn [query _path-type _stage-or-join-path clause]
               (lib.util.match/match-lite clause
                 [:field opts id]
                 (let [col (lib.metadata/field query id)]
                   [:field (merge (select-keys col [:base-type]) opts) (:name col)])

                 _ nil)))))))

(deftest ^:parallel walk-clauses-identity-test
  (testing "If we don't update any clauses then we should return the original query"
    (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                    (lib/filter (lib/and
                                 (lib/> (meta/field-metadata :venues :id) 50)
                                 (lib/< (meta/field-metadata :venues :id) 60))))]
      (doseq [f [(fn [_query _path-type _stage-or-join-path clause]
                   clause)
                 ;; check that we support `f` returning no clause (treat this the same as returning the original clause)
                 (constantly nil)]]
        (is (identical? query (lib.walk/walk-clauses query f)))))))

(deftest ^:parallel walk-clauses-case-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :checkins))
                  (lib/aggregate (lib/sum (lib/case [[(lib/between
                                                       (meta/field-metadata :checkins :date)
                                                       "2018-09-01"
                                                       "2018-09-30")
                                                      false]]
                                            false))))]
    (testing "No changes should return the original query (same object)"
      (is (identical? query
                      (lib.walk/walk-clauses query (constantly nil)))))
    (let [calls (atom [])]
      (is (=? [:SUM {}
               [:CASE {}
                [[[:BETWEEN {}
                   [:FIELD {} pos-int?]
                   "2018-09-01"
                   "2018-09-30"]
                  false]]
                false]]
              (-> query
                  (lib.walk/walk-clauses
                   (fn [_query _path-type _stage-or-join-path clause]
                     (swap! calls conj clause)
                     (when (vector? clause)
                       (update clause 0 (comp keyword u/upper-case-en name)))))
                  :stages
                  first
                  :aggregation
                  first)))
      (is (=? [;; sum => case => if-then-pairs => if expr (between) => field => arg
               (meta/id :checkins :date)
               ;; sum => case => if-then-pairs => if expr (between) => field
               [:field {} (meta/id :checkins :date)]
               ;; sum => case => if-then-pairs => if expr (between) => other args
               "2018-09-01"
               "2018-09-30"
               ;; sum => case => if-then-pairs => if expr (between)
               [:between {} [:FIELD {} (meta/id :checkins :date)] "2018-09-01" "2018-09-30"]
               ;; sum => case => if-then-pairs => then expr (false)
               false
               ;; sum => case => default
               false
               ;; sum => case
               [:case {}
                [[[:BETWEEN {}
                   [:FIELD {} pos-int?]
                   "2018-09-01"
                   "2018-09-30"]
                  false]]
                false]
               ;; sum
               [:sum {}
                [:CASE {}
                 [[[:BETWEEN {}
                    [:FIELD {} pos-int?]
                    "2018-09-01"
                    "2018-09-30"]
                   false]]
                 false]]]
              @calls)))))

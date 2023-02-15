(ns metabase.query-processor.middleware.escape-join-aliases-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.impl :as driver.impl]
   [metabase.mbql.util :as mbql.u]
   [metabase.query-processor.middleware.escape-join-aliases :as escape]))

(deftest ^:parallel deduplicate-alias-names-test
  (testing "Should ensure all join aliases are unique, ignoring case"
    ;; some Databases treat table/subquery aliases as case-insensitive and thus `Cat` and `cat` would be considered the
    ;; same thing. That's EVIL! Make sure we deduplicate.
    (driver/with-driver :h2
      (is (= {:database 1
              :type     :query
              :query    {:joins  [{:source-table 2
                                   :alias        "Cat"
                                   :condition    [:= [:field 3 nil] [:field 4 {:join-alias "Cat"}]]}
                                  {:source-table 2
                                   :alias        "cat_2"
                                   :condition    [:= [:field 3 nil] [:field 4 {:join-alias "cat_2"}]]}]
                         :fields [[:field 3 nil]
                                  [:field 4 {:join-alias "Cat"}]
                                  [:field 4 {:join-alias "cat_2"}]]}
              :info {:alias/escaped->original {"cat_2" "cat"}}}
             (escape/escape-join-aliases
              {:database 1
               :type     :query
               :query    {:joins  [{:source-table 2
                                    :alias        "Cat"
                                    :condition    [:= [:field 3 nil] [:field 4 {:join-alias "Cat"}]]}
                                   {:source-table 2
                                    :alias        "cat"
                                    :condition    [:= [:field 3 nil] [:field 4 {:join-alias "cat"}]]}]
                          :fields [[:field 3 nil]
                                   [:field 4 {:join-alias "Cat"}]
                                   [:field 4 {:join-alias "cat"}]]}})))))
  (testing "no need to include alias info if they have not changed"
    (driver/with-driver :h2
      (let [query {:database 1
                   :type     :query
                   :query    {:joins  [{:source-table 2
                                        :alias        "cat_1"
                                        :condition    [:= [:field 3 nil] [:field 4 {:join-alias "Cat"}]]}
                                       {:source-table 2
                                        :alias        "Cat_2"
                                        :condition    [:= [:field 3 nil] [:field 4 {:join-alias "cat"}]]}]
                              :fields [[:field 3 nil]
                                       [:field 4 {:join-alias "Cat"}]
                                       [:field 4 {:join-alias "cat"}]]}}
            q' (escape/escape-join-aliases query)]
        (testing "No need for a map with identical mapping"
          (is (not (contains? (:info q') :alias/escaped->original))))
        (testing "aliases in the query remain the same"
          (letfn [(all-join-aliases* [query]
                    (mbql.u/match query
                      (m :guard (every-pred map? :alias))
                      (cons (:alias m) (all-join-aliases* (dissoc m :alias)))))
                  (all-join-aliases [query]
                    (set (all-join-aliases* query)))]
            (is (= (all-join-aliases query)
                   (all-join-aliases q')))))))))

(driver/register! ::custom-escape :abstract? true)

(defmethod driver/escape-alias ::custom-escape
  [_driver s]
  (driver.impl/truncate-alias s 12))

(deftest ^:parallel escape-alias-names-test
  (testing "Make sure aliases are escaped with `metabase.driver/escape-alias` for the current driver"
    (driver/with-driver ::custom-escape
      (is (= {:database 1
              :type     :query
              :query    {:joins  [{:source-table 2
                                   :alias        "012_68c4f033"
                                   :condition    [:= [:field 3 nil] [:field 4 {:join-alias "012_68c4f033"}]]}
                                  {:source-table 2
                                   :alias        "가_50a93035"
                                   :condition    [:= [:field 3 nil] [:field 4 {:join-alias "가_50a93035"}]]}]
                         :fields [[:field 3 nil]
                                  [:field 4 {:join-alias "012_68c4f033"}]
                                  [:field 4 {:join-alias "가_50a93035"}]]}
              :info {:alias/escaped->original {"가_50a93035" "가나다라마"
                                               "012_68c4f033" "0123456789abcdef"}}}
             (driver/with-driver ::custom-escape
               (escape/escape-join-aliases
                {:database 1
                 :type     :query
                 :query    {:joins  [{:source-table 2
                                      :alias        "0123456789abcdef"
                                      :condition    [:= [:field 3 nil] [:field 4 {:join-alias "0123456789abcdef"}]]}
                                     {:source-table 2
                                      :alias        "가나다라마"
                                      :condition    [:= [:field 3 nil] [:field 4 {:join-alias "가나다라마"}]]}]
                            :fields [[:field 3 nil]
                                     [:field 4 {:join-alias "0123456789abcdef"}]
                                     [:field 4 {:join-alias "가나다라마"}]]}})))))))

(deftest ^:parallel add-escaped-aliases-test
  (is (= {:source-query {:joins    [{:alias                 "Products"
                                     ::escape/escaped-alias "Products"
                                     :condition             [:=
                                                             [:field 4 nil]
                                                             [:field 5 {:join-alias "Products"}]]}]
                         :breakout [[:field 6 {:join-alias "Products", :temporal-unit :month}]]}
          :joins        [{:source-query          {:joins    [{:alias                 "Products"
                                                              ::escape/escaped-alias "Products_2"
                                                              :condition             [:=
                                                                                      [:field 4 nil]
                                                                                      [:field 5 {:join-alias "Products"}]]}]
                                                  :breakout [[:field 6 {:join-alias "Products", :temporal-unit :month}]]}
                          :alias                 "Q2"
                          ::escape/escaped-alias "Q2"
                          :condition             [:=
                                                  [:field 6 {:temporal-unit :month}]
                                                  [:field 6 {:join-alias "Q2", :temporal-unit :month}]]}]
          :order-by     [[:asc [:field 6 {:join-alias "Products", :temporal-unit :month}]]]}
         (#'escape/add-escaped-aliases
          {:source-query {:joins    [{:alias     "Products"
                                      :condition [:=
                                                  [:field 4 nil]
                                                  [:field 5 {:join-alias "Products"}]]}]
                          :breakout [[:field 6 {:join-alias "Products", :temporal-unit :month}]]}
           :joins        [{:source-query {:joins    [{:alias     "Products"
                                                      :condition [:=
                                                                  [:field 4 nil]
                                                                  [:field 5 {:join-alias "Products"}]]}]
                                          :breakout [[:field 6 {:join-alias "Products", :temporal-unit :month}]]}
                           :alias        "Q2"
                           :condition    [:=
                                          [:field 6 {:temporal-unit :month}]
                                          [:field 6 {:join-alias "Q2", :temporal-unit :month}]]}]
           :order-by     [[:asc [:field 6 {:join-alias "Products", :temporal-unit :month}]]]}
          (#'escape/escape-fn :h2)))))

(deftest ^:parallel add-original->escaped-alias-maps-test
  (is (= {:source-query              {:joins                     [{:alias                 "Products"
                                                                   ::escape/escaped-alias "Products"
                                                                   :condition             [:=
                                                                                           [:field 4 nil]
                                                                                           [:field 5 {:join-alias "Products"}]]}]
                                      ::escape/original->escaped {"Products" "Products"}
                                      :breakout                  [[:field 6 {:join-alias "Products", :temporal-unit :month}]]}
          :joins                     [{:source-query          {:joins                     [{:alias                 "Products"
                                                                                            ::escape/escaped-alias "Products_2"
                                                                                            :condition             [:=
                                                                                                                    [:field 4 nil]
                                                                                                                    [:field 5 {:join-alias "Products"}]]}]
                                                               ::escape/original->escaped {"Products" "Products_2"}
                                                               :breakout                  [[:field 6 {:join-alias "Products", :temporal-unit :month}]]}
                                       :alias                 "Q2"
                                       ::escape/escaped-alias "Q2"
                                       :condition             [:=
                                                               [:field 6 {:temporal-unit :month}]
                                                               [:field 6 {:join-alias "Q2", :temporal-unit :month}]]}]
          ::escape/original->escaped {"Q2" "Q2"}
          :order-by                  [[:asc [:field 6 {:join-alias "Products", :temporal-unit :month}]]]}
         (#'escape/add-original->escaped-alias-maps
          {:source-query {:joins    [{:alias                 "Products"
                                      ::escape/escaped-alias "Products"
                                      :condition             [:=
                                                              [:field 4 nil]
                                                              [:field 5 {:join-alias "Products"}]]}]
                          :breakout [[:field 6 {:join-alias "Products", :temporal-unit :month}]]}
           :joins        [{:source-query          {:joins    [{:alias                 "Products"
                                                               ::escape/escaped-alias "Products_2"
                                                               :condition             [:=
                                                                                       [:field 4 nil]
                                                                                       [:field 5 {:join-alias "Products"}]]}]
                                                   :breakout [[:field 6 {:join-alias "Products", :temporal-unit :month}]]}
                           :alias                 "Q2"
                           ::escape/escaped-alias "Q2"
                           :condition             [:=
                                                   [:field 6 {:temporal-unit :month}]
                                                   [:field 6 {:join-alias "Q2", :temporal-unit :month}]]}]
           :order-by     [[:asc [:field 6 {:join-alias "Products", :temporal-unit :month}]]]}))))

(deftest ^:parallel merge-original->escaped-maps-test
  (is (= {:source-query              {:joins                     [{:alias                 "Products"
                                                                   ::escape/escaped-alias "Products"
                                                                   :condition             [:=
                                                                                           [:field 4 nil]
                                                                                           [:field 5 {:join-alias "Products"}]]}]
                                      ::escape/original->escaped {"Products" "Products"}
                                      :breakout                  [[:field 6 {:join-alias "Products", :temporal-unit :month}]]}
          :joins                     [{:source-query          {:joins                     [{:alias                 "Products"
                                                                                            ::escape/escaped-alias "Products_2"
                                                                                            :condition             [:=
                                                                                                                    [:field 4 nil]
                                                                                                                    [:field 5 {:join-alias "Products"}]]}]
                                                               ::escape/original->escaped {"Products" "Products_2"}
                                                               :breakout                  [[:field 6 {:join-alias "Products", :temporal-unit :month}]]}
                                       :alias                 "Q2"
                                       ::escape/escaped-alias "Q2"
                                       :condition             [:=
                                                               [:field 6 {:temporal-unit :month}]
                                                               [:field 6 {:join-alias "Q2", :temporal-unit :month}]]}]
          ::escape/original->escaped {"Products" "Products", "Q2" "Q2"}
          :order-by                  [[:asc [:field 6 {:join-alias "Products", :temporal-unit :month}]]]}
         (#'escape/merge-original->escaped-maps
          {:source-query              {:joins                     [{:alias                 "Products"
                                                                    ::escape/escaped-alias "Products"
                                                                    :condition             [:=
                                                                                            [:field 4 nil]
                                                                                            [:field 5 {:join-alias "Products"}]]}]
                                       ::escape/original->escaped {"Products" "Products"}
                                       :breakout                  [[:field 6 {:join-alias "Products", :temporal-unit :month}]]}
           :joins                     [{:source-query          {:joins                     [{:alias                 "Products"
                                                                                             ::escape/escaped-alias "Products_2"
                                                                                             :condition             [:=
                                                                                                                     [:field 4 nil]
                                                                                                                     [:field 5 {:join-alias "Products"}]]}]
                                                                ::escape/original->escaped {"Products" "Products_2"}
                                                                :breakout                  [[:field 6 {:join-alias "Products", :temporal-unit :month}]]}
                                        :alias                 "Q2"
                                        ::escape/escaped-alias "Q2"
                                        :condition             [:=
                                                                [:field 6 {:temporal-unit :month}]
                                                                [:field 6 {:join-alias "Q2", :temporal-unit :month}]]}]
           ::escape/original->escaped {"Q2" "Q2"}
           :order-by                  [[:asc [:field 6 {:join-alias "Products", :temporal-unit :month}]]]}))))

(deftest ^:parallel add-escaped-join-aliases-to-fields-test
  (is (= {:source-query              {:joins                     [{:alias                 "Products"
                                                                   ::escape/escaped-alias "Products"
                                                                   :condition             [:=
                                                                                           [:field 4 nil]
                                                                                           [:field 5 {:join-alias                 "Products"
                                                                                                      ::escape/escaped-join-alias "Products"}]]}]
                                      ::escape/original->escaped {"Products" "Products"}
                                      :breakout                  [[:field 6 {:join-alias                 "Products"
                                                                             ::escape/escaped-join-alias "Products"
                                                                             :temporal-unit              :month}]]}
          :joins                     [{:source-query          {:joins                     [{:alias                 "Products"
                                                                                            ::escape/escaped-alias "Products_2"
                                                                                            :condition             [:=
                                                                                                                    [:field 4 nil]
                                                                                                                    [:field 5 {:join-alias                 "Products"
                                                                                                                               ::escape/escaped-join-alias "Products_2"}]]}]
                                                               ::escape/original->escaped {"Products" "Products_2"}
                                                               :breakout                  [[:field 6 {:join-alias                 "Products"
                                                                                                      ::escape/escaped-join-alias "Products_2"
                                                                                                      :temporal-unit              :month}]]}
                                       :alias                 "Q2"
                                       ::escape/escaped-alias "Q2"
                                       :condition             [:=
                                                               [:field 6 {:temporal-unit :month}]
                                                               [:field 6 {:join-alias                 "Q2"
                                                                          ::escape/escaped-join-alias "Q2"
                                                                          :temporal-unit              :month}]]}]
          ::escape/original->escaped {"Products" "Products", "Q2" "Q2"}
          :order-by                  [[:asc [:field 6 {:join-alias                 "Products"
                                                       ::escape/escaped-join-alias "Products"
                                                       :temporal-unit              :month}]]]}
         (#'escape/add-escaped-join-aliases-to-fields
          {:source-query              {:joins                     [{:alias                 "Products"
                                                                    ::escape/escaped-alias "Products"
                                                                    :condition             [:=
                                                                                            [:field 4 nil]
                                                                                            [:field 5 {:join-alias "Products"}]]}]
                                       ::escape/original->escaped {"Products" "Products"}
                                       :breakout                  [[:field 6 {:join-alias "Products", :temporal-unit :month}]]}
           :joins                     [{:source-query          {:joins                     [{:alias                 "Products"
                                                                                             ::escape/escaped-alias "Products_2"
                                                                                             :condition             [:=
                                                                                                                     [:field 4 nil]
                                                                                                                     [:field 5 {:join-alias "Products"}]]}]
                                                                ::escape/original->escaped {"Products" "Products_2"}
                                                                :breakout                  [[:field 6 {:join-alias "Products", :temporal-unit :month}]]}
                                        :alias                 "Q2"
                                        ::escape/escaped-alias "Q2"
                                        :condition             [:=
                                                                [:field 6 {:temporal-unit :month}]
                                                                [:field 6 {:join-alias "Q2", :temporal-unit :month}]]}]
           ::escape/original->escaped {"Products" "Products", "Q2" "Q2"}
           :order-by                  [[:asc [:field 6 {:join-alias "Products", :temporal-unit :month}]]]}))))

(deftest ^:parallel merged-escaped->original-with-no-ops-removed-test
  (is (= {"Products_2" "Products"}
         (#'escape/merged-escaped->original-with-no-ops-removed
          '{:query {:source-query
                    {::escape/original->escaped {"Products" "Products"}}

                    :joins
                    [{:source-query {::escape/original->escaped {"Products" "Products_2"}}}]

                    ::escape/original->escaped
                    {"Products" "Products", "Q2" "Q2"}}}))))

(deftest ^:parallel add-escaped->original-info-test
  (is (= {:query {:source-query              {:joins                     [{:alias                 "Products"
                                                                           ::escape/escaped-alias "Products"
                                                                           :condition             [:=
                                                                                                   [:field 4 nil]
                                                                                                   [:field 5 {:join-alias                 "Products"
                                                                                                              ::escape/escaped-join-alias "Products"}]]}]
                                              ::escape/original->escaped {"Products" "Products"}
                                              :breakout                  [[:field 6 {:join-alias                 "Products"
                                                                                     ::escape/escaped-join-alias "Products"
                                                                                     :temporal-unit              :month}]]}
                  :joins                     [{:source-query          {:joins                     [{:alias                 "Products"
                                                                                                    ::escape/escaped-alias "Products_2"
                                                                                                    :condition             [:=
                                                                                                                            [:field 4 nil]
                                                                                                                            [:field 5 {:join-alias                 "Products"
                                                                                                                                       ::escape/escaped-join-alias "Products_2"}]]}]
                                                                       ::escape/original->escaped {"Products" "Products_2"}
                                                                       :breakout                  [[:field 6 {:join-alias                 "Products"
                                                                                                              ::escape/escaped-join-alias "Products_2"
                                                                                                              :temporal-unit              :month}]]}
                                               :alias                 "Q2"
                                               ::escape/escaped-alias "Q2"
                                               :condition             [:=
                                                                       [:field 6 {:temporal-unit :month}]
                                                                       [:field 6 {:join-alias                 "Q2"
                                                                                  ::escape/escaped-join-alias "Q2"
                                                                                  :temporal-unit              :month}]]}]
                  ::escape/original->escaped {"Products" "Products", "Q2" "Q2"}
                  :order-by                  [[:asc [:field 6 {:join-alias                 "Products"
                                                               ::escape/escaped-join-alias "Products"
                                                               :temporal-unit              :month}]]]}
          :info  {:alias/escaped->original {"Products_2" "Products"}}}
         (#'escape/add-escaped->original-info
          {:query {:source-query              {:joins                     [{:alias                 "Products"
                                                                            ::escape/escaped-alias "Products"
                                                                            :condition             [:=
                                                                                                    [:field 4 nil]
                                                                                                    [:field 5 {:join-alias                 "Products"
                                                                                                               ::escape/escaped-join-alias "Products"}]]}]
                                               ::escape/original->escaped {"Products" "Products"}
                                               :breakout                  [[:field 6 {:join-alias                 "Products"
                                                                                      ::escape/escaped-join-alias "Products"
                                                                                      :temporal-unit              :month}]]}
                   :joins                     [{:source-query          {:joins                     [{:alias                 "Products"
                                                                                                     ::escape/escaped-alias "Products_2"
                                                                                                     :condition             [:=
                                                                                                                             [:field 4 nil]
                                                                                                                             [:field 5 {:join-alias                 "Products"
                                                                                                                                        ::escape/escaped-join-alias "Products_2"}]]}]
                                                                        ::escape/original->escaped {"Products" "Products_2"}
                                                                        :breakout                  [[:field 6 {:join-alias                 "Products"
                                                                                                               ::escape/escaped-join-alias "Products_2"
                                                                                                               :temporal-unit              :month}]]}
                                                :alias                 "Q2"
                                                ::escape/escaped-alias "Q2"
                                                :condition             [:=
                                                                        [:field 6 {:temporal-unit :month}]
                                                                        [:field 6 {:join-alias                 "Q2"
                                                                                   ::escape/escaped-join-alias "Q2"
                                                                                   :temporal-unit              :month}]]}]
                   ::escape/original->escaped {"Products" "Products", "Q2" "Q2"}
                   :order-by                  [[:asc [:field 6 {:join-alias                 "Products"
                                                                ::escape/escaped-join-alias "Products"
                                                                :temporal-unit              :month}]]]}}))))

(deftest ^:parallel replace-original-aliases-with-escaped-aliases-test
  (is (= {:source-query {:joins    [{:alias     "Products"
                                     :condition [:=
                                                 [:field 4 nil]
                                                 [:field 5 {:join-alias "Products"}]]}]
                         :breakout [[:field 6 {:join-alias    "Products"
                                               :temporal-unit :month}]]}
          :joins        [{:source-query {:joins    [{:alias     "Products_2"
                                                     :condition [:=
                                                                 [:field 4 nil]
                                                                 [:field 5 {:join-alias "Products_2"}]]}]
                                         :breakout [[:field 6 {:join-alias    "Products_2"
                                                               :temporal-unit :month}]]}
                          :alias        "Q2"
                          :condition    [:=
                                         [:field 6 {:temporal-unit :month}]
                                         [:field 6 {:join-alias    "Q2"
                                                    :temporal-unit :month}]]}]
          :order-by     [[:asc [:field 6 {:join-alias    "Products"
                                          :temporal-unit :month}]]]}
         (#'escape/replace-original-aliases-with-escaped-aliases
          {:source-query              {:joins                     [{:alias                 "Products"
                                                                    ::escape/escaped-alias "Products"
                                                                    :condition             [:=
                                                                                            [:field 4 nil]
                                                                                            [:field 5 {:join-alias                 "Products"
                                                                                                       ::escape/escaped-join-alias "Products"}]]}]
                                       ::escape/original->escaped {"Products" "Products"}
                                       :breakout                  [[:field 6 {:join-alias                 "Products"
                                                                              ::escape/escaped-join-alias "Products"
                                                                              :temporal-unit              :month}]]}
           :joins                     [{:source-query          {:joins                     [{:alias                 "Products"
                                                                                             ::escape/escaped-alias "Products_2"
                                                                                             :condition             [:=
                                                                                                                     [:field 4 nil]
                                                                                                                     [:field 5 {:join-alias                 "Products"
                                                                                                                                ::escape/escaped-join-alias "Products_2"}]]}]
                                                                ::escape/original->escaped {"Products" "Products_2"}
                                                                :breakout                  [[:field 6 {:join-alias                 "Products"
                                                                                                       ::escape/escaped-join-alias "Products_2"
                                                                                                       :temporal-unit              :month}]]}
                                        :alias                 "Q2"
                                        ::escape/escaped-alias "Q2"
                                        :condition             [:=
                                                                [:field 6 {:temporal-unit :month}]
                                                                [:field 6 {:join-alias                 "Q2"
                                                                           ::escape/escaped-join-alias "Q2"
                                                                           :temporal-unit              :month}]]}]
           ::escape/original->escaped {"Products" "Products", "Q2" "Q2"}
           :order-by                  [[:asc [:field 6 {:join-alias                 "Products"
                                                        ::escape/escaped-join-alias "Products"
                                                        :temporal-unit              :month}]]]}))))

;;; this is an e2e test

(deftest ^:parallel deduplicate-aliases-inside-source-queries-test
  ;; this query is adapted from [[metabase.query-processor-test.explicit-joins-test/joining-nested-queries-with-same-aggregation-test]]
  (is (= {:database 1
          :type     :query
          :query    {:source-query {:joins       [{:alias     "Products"
                                                   :condition [:=
                                                               [:field 4 nil]
                                                               [:field 5 {:join-alias "Products"}]]}]
                                    :breakout    [[:field 6 {:join-alias "Products", :temporal-unit :month}]]
                                    :aggregation [[:distinct [:field 5 {:join-alias "Products"}]]]
                                    :filter      [:=
                                                  [:field 7 {:join-alias "Products"}]
                                                  "Doohickey"]}
                     :joins        [{:source-query {:joins       [{:alias     "Products_2"
                                                                   :condition [:=
                                                                               [:field 4 nil]
                                                                               [:field 5 {:join-alias "Products_2"}]]
                                                                   :fields    :all}]
                                                    :breakout    [[:field 6 {:join-alias "Products_2", :temporal-unit :month}]]
                                                    :aggregation [[:distinct [:field 5 {:join-alias "Products_2"}]]]
                                                    :filter      [:= [:field 7 {:join-alias "Products_2"}] "Gizmo"]}
                                     :alias        "Q2"
                                     :condition    [:=
                                                    [:field 6 {:temporal-unit :month}]
                                                    [:field 6 {:join-alias "Q2", :temporal-unit :month}]]}]
                     :order-by     [[:asc [:field 6 {:join-alias "Products", :temporal-unit :month}]]]}
          :info     {:alias/escaped->original {"Products_2" "Products"}}}
         (driver/with-driver :h2
           (escape/escape-join-aliases
            {:database 1
             :type     :query
             :query    {:source-query {:joins       [{:alias     "Products"
                                                      :condition [:=
                                                                  [:field 4 nil]
                                                                  [:field 5 {:join-alias "Products"}]]}]
                                       :breakout    [[:field 6 {:join-alias "Products", :temporal-unit :month}]]
                                       :aggregation [[:distinct [:field 5 {:join-alias "Products"}]]]
                                       :filter      [:=
                                                     [:field 7 {:join-alias "Products"}]
                                                     "Doohickey"]}
                        :joins        [{:source-query {:joins       [{:alias     "Products"
                                                                      :condition [:=
                                                                                  [:field 4 nil]
                                                                                  [:field 5 {:join-alias "Products"}]]
                                                                      :fields    :all}]
                                                       :breakout    [[:field 6 {:join-alias "Products", :temporal-unit :month}]]
                                                       :aggregation [[:distinct [:field 5 {:join-alias "Products"}]]]
                                                       :filter      [:= [:field 7 {:join-alias "Products"}] "Gizmo"]}
                                        :alias        "Q2"
                                        :condition    [:=
                                                       [:field 6 {:temporal-unit :month}]
                                                       [:field 6 {:join-alias "Q2", :temporal-unit :month}]]}]
                        :order-by     [[:asc [:field 6 {:join-alias "Products", :temporal-unit :month}]]]}})))))

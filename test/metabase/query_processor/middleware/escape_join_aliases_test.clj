(ns metabase.query-processor.middleware.escape-join-aliases-test
  (:require
   [clojure.test :refer :all]
   [flatland.ordered.map :as ordered-map]
   [metabase.driver :as driver]
   [metabase.driver.impl :as driver.impl]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.middleware.escape-join-aliases :as escape]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]))

(driver/register! ::custom-escape :abstract? true)

(defmethod driver/escape-alias ::custom-escape
  [_driver s]
  (driver.impl/truncate-alias s 12))

(defn- do-with-metadata-provider [thunk]
  (if (qp.store/initialized?)
    (thunk)
    (qp.store/with-metadata-provider (lib.tu/merged-mock-metadata-provider
                                      meta/metadata-provider
                                      {:database {:lib/methods {:escape-alias #(driver/escape-alias driver/*driver* %)}}})
      (thunk))))

;;; the tests below are tests for the individual sub-steps of the middleware.

(deftest ^:parallel replace-original-aliases-with-escaped-aliases-test
  (#'escape/replace-original-aliases-with-escaped-aliases
   {:alias        "Cat"
    :condition    [:=
                   [:field 3 nil]
                   [:field 4 {:join-alias "Cat", :escape/join-alias nil}]]
    :source-table 2}))

(deftest ^:parallel merged-escaped->original-with-no-ops-removed-test
  (is (= {"Products_2" "Products"}
         (#'escape/merged-escaped->original-with-no-ops-removed
          '{:query {:source-query
                    {::escape/original->escaped {"Products" "Products"}}

                    :joins
                    [{:source-query {::escape/original->escaped {"Products" "Products_2"}}}]

                    ::escape/original->escaped
                    {"Products" "Products", "Q2" "Q2"}}}))))

(defn- add-escaped-aliases-h2 [query]
  (driver/with-driver :h2
    (do-with-metadata-provider
     (fn []
       (#'escape/add-escaped-aliases query (#'escape/driver->escape-fn :h2))))))

(defn- add-escaped-aliases-custom-escape [query]
  (driver/with-driver ::custom-escape
    (do-with-metadata-provider
     (fn []
       (#'escape/add-escaped-aliases query (#'escape/driver->escape-fn ::custom-escape))))))

;;; the tests below test what a query should look like after each sub-step

(defn- test-steps [steps]
  (loop [query (:init steps), [[varr expected] & more] steps]
    (if (= varr :init)
      (recur query more)
      (let [actual (varr query)]
        (testing (str \newline (u/pprint-to-str (list varr query)))
          (is (= expected
                 actual)))
        ;; Fail fast if one step fails, it's just going to make debugging this confusing.
        (when (and (seq more)
                   (= expected
                      actual))
          (recur expected more))))))

(deftest ^:parallel steps-test-1
  (test-steps
   (ordered-map/ordered-map
    :init
    {:source-query {:source-table 1
                    :joins        [{:source-table 2
                                    :alias        "Products"
                                    :condition    [:=
                                                   [:field 4 nil]
                                                   [:field 5 {:join-alias "Products"}]]}]
                    :breakout     [[:field 6 {:join-alias "Products", :temporal-unit :month}]]}
     :joins        [{:source-query {:source-table 3
                                    :joins        [{:source-table 4
                                                    :alias        "Products"
                                                    :condition    [:=
                                                                   [:field 4 nil]
                                                                   [:field 5 {:join-alias "Products"}]]
                                                    :fields       :all}]
                                    :breakout     [[:field 6 {:join-alias "Products", :temporal-unit :month}]]}
                     :alias        "Q2"
                     :condition    [:=
                                    [:field 6 {:temporal-unit :month}]
                                    [:field 6 {:join-alias "Q2", :temporal-unit :month}]]}]
     :order-by     [[:asc [:field 6 {:join-alias "Products", :temporal-unit :month}]]]}

    #'add-escaped-aliases-h2
    {:source-query {:source-table 1
                    :joins        [{:source-table  2
                                    :alias         "Products"
                                    ::escape/alias "Products"
                                    :condition     [:=
                                                    [:field 4 nil]
                                                    [:field 5 {:join-alias "Products"}]]}]
                    :breakout     [[:field 6 {:join-alias "Products", :temporal-unit :month}]]}
     :joins        [{:source-query  {:source-table 3
                                     :joins        [{:source-table  4
                                                     :alias         "Products"
                                                     ::escape/alias "Products_2"
                                                     :condition     [:=
                                                                     [:field 4 nil]
                                                                     [:field 5 {:join-alias "Products"}]]
                                                     :fields        :all}]
                                     :breakout     [[:field 6 {:join-alias "Products", :temporal-unit :month}]]}
                     :alias         "Q2"
                     ::escape/alias "Q2"
                     :condition     [:=
                                     [:field 6 {:temporal-unit :month}]
                                     [:field 6 {:join-alias "Q2", :temporal-unit :month}]]}]
     :order-by     [[:asc [:field 6 {:join-alias "Products", :temporal-unit :month}]]]}

    #'escape/add-original->escaped-alias-maps
    {:source-query              {:source-table              1
                                 :joins                     [{:source-table              2
                                                              ::escape/original->escaped {}
                                                              :alias                     "Products"
                                                              ::escape/alias             "Products"
                                                              :condition                 [:=
                                                                                          [:field 4 nil]
                                                                                          [:field 5 {:join-alias "Products"}]]}]
                                 ::escape/original->escaped {"Products" "Products"}
                                 :breakout                  [[:field 6 {:join-alias "Products", :temporal-unit :month}]]}
     :joins                     [{:source-query              {:source-table              3
                                                              :joins                     [{:source-table              4
                                                                                           ::escape/original->escaped {}
                                                                                           :alias                     "Products"
                                                                                           ::escape/alias             "Products_2"
                                                                                           :condition                 [:=
                                                                                                                       [:field 4 nil]
                                                                                                                       [:field 5 {:join-alias "Products"}]]
                                                                                           :fields                    :all}]
                                                              ::escape/original->escaped {"Products" "Products_2"}
                                                              :breakout                  [[:field 6 {:join-alias "Products", :temporal-unit :month}]]}
                                  ::escape/original->escaped {}
                                  :alias                     "Q2"
                                  ::escape/alias             "Q2"
                                  :condition                 [:=
                                                              [:field 6 {:temporal-unit :month}]
                                                              [:field 6 {:join-alias "Q2", :temporal-unit :month}]]}]
     ::escape/original->escaped {"Q2" "Q2"}
     :order-by                  [[:asc [:field 6 {:join-alias "Products", :temporal-unit :month}]]]}

    #'escape/merge-original->escaped-maps
    {:source-query              {:source-table              1
                                 :joins                     [{:source-table              2
                                                              ::escape/original->escaped {"Products" "Products"}
                                                              :alias                     "Products"
                                                              ::escape/alias             "Products"
                                                              :condition                 [:=
                                                                                          [:field 4 nil]
                                                                                          [:field 5 {:join-alias "Products"}]]}]
                                 ::escape/original->escaped {"Products" "Products"}
                                 :breakout                  [[:field 6 {:join-alias "Products", :temporal-unit :month}]]}
     :joins                     [{:source-query              {:source-table              3
                                                              :joins                     [{:source-table              4
                                                                                           ::escape/original->escaped {"Products" "Products_2"}
                                                                                           :alias                     "Products"
                                                                                           ::escape/alias             "Products_2"
                                                                                           :condition                 [:=
                                                                                                                       [:field 4 nil]
                                                                                                                       [:field 5 {:join-alias "Products"}]]
                                                                                           :fields                    :all}]
                                                              ::escape/original->escaped {"Products" "Products_2"}
                                                              :breakout                  [[:field 6 {:join-alias    "Products"
                                                                                                     :temporal-unit :month}]]}
                                  ::escape/original->escaped {"Products" "Products", "Q2" "Q2"}
                                  :alias                     "Q2"
                                  ::escape/alias             "Q2"
                                  :condition                 [:=
                                                              [:field 6 {:temporal-unit :month}]
                                                              [:field 6 {:join-alias "Q2", :temporal-unit :month}]]}]
     ::escape/original->escaped {"Products" "Products", "Q2" "Q2"}
     :order-by                  [[:asc [:field 6 {:join-alias "Products", :temporal-unit :month}]]]}

    #'escape/add-escaped-join-aliases-to-fields
    {:source-query              {:source-table              1
                                 :joins                     [{:source-table              2
                                                              ::escape/original->escaped {"Products" "Products"}
                                                              :alias                     "Products"
                                                              ::escape/alias             "Products"
                                                              :condition                 [:=
                                                                                          [:field 4 nil]
                                                                                          [:field 5 {:join-alias         "Products"
                                                                                                     ::escape/join-alias "Products"}]]}]
                                 ::escape/original->escaped {"Products" "Products"}
                                 :breakout                  [[:field 6 {:join-alias         "Products"
                                                                        ::escape/join-alias "Products"
                                                                        :temporal-unit      :month}]]}
     :joins                     [{:source-query              {:source-table              3
                                                              :joins                     [{:source-table              4
                                                                                           ::escape/original->escaped {"Products" "Products_2"}
                                                                                           :alias                     "Products"
                                                                                           ::escape/alias             "Products_2"
                                                                                           :condition                 [:=
                                                                                                                       [:field 4 nil]
                                                                                                                       [:field 5 {:join-alias         "Products"
                                                                                                                                  ::escape/join-alias "Products_2"}]]
                                                                                           :fields                    :all}]
                                                              ::escape/original->escaped {"Products" "Products_2"}
                                                              :breakout                  [[:field 6 {:join-alias         "Products"
                                                                                                     ::escape/join-alias "Products_2"
                                                                                                     :temporal-unit      :month}]]}
                                  ::escape/original->escaped {"Products" "Products", "Q2" "Q2"}
                                  :alias                     "Q2"
                                  ::escape/alias             "Q2"
                                  :condition                 [:=
                                                              [:field 6 {:temporal-unit :month}]
                                                              [:field 6 {:join-alias         "Q2"
                                                                         ::escape/join-alias "Q2"
                                                                         :temporal-unit      :month}]]}]
     ::escape/original->escaped {"Products" "Products", "Q2" "Q2"}
     :order-by                  [[:asc [:field 6 {:join-alias         "Products"
                                                  ::escape/join-alias "Products"
                                                  :temporal-unit      :month}]]]}

    #'escape/replace-original-aliases-with-escaped-aliases
    {:source-query {:source-table 1
                    :joins        [{:source-table 2
                                    :alias        "Products"
                                    :condition    [:=
                                                   [:field 4 nil]
                                                   [:field 5 {:join-alias "Products"}]]}]
                    :breakout     [[:field 6 {:join-alias    "Products"
                                              :temporal-unit :month}]]}
     :joins        [{:source-query {:source-table 3
                                    :joins        [{:source-table 4
                                                    :alias        "Products_2"
                                                    :condition    [:=
                                                                   [:field 4 nil]
                                                                   [:field 5 {:join-alias "Products_2"}]]
                                                    :fields       :all}]
                                    :breakout     [[:field 6 {:join-alias    "Products_2"
                                                              :temporal-unit :month}]]}
                     :alias        "Q2"
                     :condition    [:=
                                    [:field 6 {:temporal-unit :month}]
                                    [:field 6 {:join-alias    "Q2"
                                               :temporal-unit :month}]]}]
     :order-by     [[:asc [:field 6 {:join-alias    "Products"
                                     :temporal-unit :month}]]]})))

(deftest ^:parallel steps-test-2
  (test-steps
   (ordered-map/ordered-map
    :init
    {:source-query {:source-query {:source-table 1
                                   :joins        [{:source-table 2
                                                   :alias        "Products_Long_Identifier"
                                                   :condition    [:=
                                                                  [:field 4 nil]
                                                                  [:field 5 {:join-alias "Products_Long_Identifier"}]]}]}}
     :order-by     [[:asc [:field 6 {:join-alias "Products_Long_Identifier", :temporal-unit :month}]]]}

    #'add-escaped-aliases-custom-escape
    {:source-query {:source-query {:source-table 1
                                   :joins        [{:source-table  2
                                                   :alias         "Products_Long_Identifier"
                                                   ::escape/alias "Pro_acce5f27"
                                                   :condition     [:=
                                                                   [:field 4 nil]
                                                                   [:field 5 {:join-alias "Products_Long_Identifier"}]]}]}}
     :order-by     [[:asc [:field 6 {:join-alias "Products_Long_Identifier", :temporal-unit :month}]]]}

    #'escape/add-original->escaped-alias-maps
    {:source-query              {:source-query              {:source-table              1
                                                             :joins                     [{:source-table              2
                                                                                          :alias                     "Products_Long_Identifier"
                                                                                          ::escape/alias             "Pro_acce5f27"
                                                                                          ::escape/original->escaped {}
                                                                                          :condition                 [:=
                                                                                                                      [:field 4 nil]
                                                                                                                      [:field 5 {:join-alias "Products_Long_Identifier"}]]}]
                                                             ::escape/original->escaped {"Products_Long_Identifier" "Pro_acce5f27"}}
                                 ::escape/original->escaped {}}
     ::escape/original->escaped {}
     :order-by                  [[:asc [:field 6 {:join-alias "Products_Long_Identifier", :temporal-unit :month}]]]}

    #'escape/merge-original->escaped-maps
    {:source-query              {:source-query              {:source-table              1
                                                             :joins                     [{:source-table              2
                                                                                          :alias                     "Products_Long_Identifier"
                                                                                          ::escape/alias             "Pro_acce5f27"
                                                                                          ::escape/original->escaped {"Products_Long_Identifier" "Pro_acce5f27"}
                                                                                          :condition                 [:=
                                                                                                                      [:field 4 nil]
                                                                                                                      [:field 5 {:join-alias "Products_Long_Identifier"}]]}]
                                                             ::escape/original->escaped {"Products_Long_Identifier" "Pro_acce5f27"}}
                                 ::escape/original->escaped {"Products_Long_Identifier" "Pro_acce5f27"}}
     ::escape/original->escaped {"Products_Long_Identifier" "Pro_acce5f27"}
     :order-by                  [[:asc [:field 6 {:join-alias "Products_Long_Identifier", :temporal-unit :month}]]]}

    #'escape/add-escaped-join-aliases-to-fields
    {:source-query              {:source-query              {:source-table              1
                                                             :joins                     [{:source-table              2
                                                                                          :alias                     "Products_Long_Identifier"
                                                                                          ::escape/alias             "Pro_acce5f27"
                                                                                          ::escape/original->escaped {"Products_Long_Identifier" "Pro_acce5f27"}
                                                                                          :condition                 [:=
                                                                                                                      [:field 4 nil]
                                                                                                                      [:field 5 {:join-alias         "Products_Long_Identifier"
                                                                                                                                 ::escape/join-alias "Pro_acce5f27"}]]}]
                                                             ::escape/original->escaped {"Products_Long_Identifier" "Pro_acce5f27"}}
                                 ::escape/original->escaped {"Products_Long_Identifier" "Pro_acce5f27"}}
     ::escape/original->escaped {"Products_Long_Identifier" "Pro_acce5f27"}
     :order-by                  [[:asc [:field 6 {:join-alias         "Products_Long_Identifier"
                                                  ::escape/join-alias "Pro_acce5f27"
                                                  :temporal-unit      :month}]]]}

    #'escape/replace-original-aliases-with-escaped-aliases
    {:source-query {:source-query {:source-table 1
                                   :joins        [{:source-table 2
                                                   :alias        "Pro_acce5f27"
                                                   :condition    [:=
                                                                  [:field 4 nil]
                                                                  [:field 5 {:join-alias "Pro_acce5f27"}]]}]}}
     :order-by     [[:asc [:field 6 {:join-alias "Pro_acce5f27", :temporal-unit :month}]]]})))

(deftest ^:parallel steps-test-3
  (test-steps
   (ordered-map/ordered-map
    :init
    {:source-query {:source-table 1
                    :joins        [{:source-table 2
                                    :alias        "Products"
                                    :condition    [:=
                                                   [:field 4 nil]
                                                   [:field 5 {:join-alias "Products"}]]}]}
     :joins        [{:source-query {:source-table 3
                                    :joins        [{:source-table 4
                                                    :alias        "Products"
                                                    :condition    [:=
                                                                   [:field 4 nil]
                                                                   [:field 5 {:join-alias "Products"}]]}]}
                     :alias        "Q2"
                     :condition    [:=
                                    [:field 6 {:join-alias "Products", :temporal-unit :month}]
                                    [:field 6 {:join-alias "Q2", :temporal-unit :month}]]}]}

    #'add-escaped-aliases-h2
    {:source-query {:source-table 1
                    :joins        [{:source-table  2
                                    :alias         "Products"
                                    ::escape/alias "Products"
                                    :condition     [:=
                                                    [:field 4 nil]
                                                    [:field 5 {:join-alias "Products"}]]}]}
     :joins        [{:source-query  {:source-table 3
                                     :joins        [{:source-table  4
                                                     :alias         "Products"
                                                     ::escape/alias "Products_2"
                                                     :condition     [:=
                                                                     [:field 4 nil]
                                                                     [:field 5 {:join-alias "Products"}]]}]}
                     :alias         "Q2"
                     ::escape/alias "Q2"
                     :condition     [:=
                                     [:field 6 {:join-alias "Products", :temporal-unit :month}]
                                     [:field 6 {:join-alias "Q2", :temporal-unit :month}]]}]}

    #'escape/add-original->escaped-alias-maps
    {:source-query              {:source-table              1
                                 ::escape/original->escaped {"Products" "Products"}
                                 :joins                     [{:source-table              2
                                                              ::escape/original->escaped {}
                                                              :alias                     "Products"
                                                              ::escape/alias             "Products"
                                                              :condition                 [:=
                                                                                          [:field 4 nil]
                                                                                          [:field 5 {:join-alias "Products"}]]}]}
     ::escape/original->escaped {"Q2" "Q2"}
     :joins                     [{:source-query              {:source-table              3
                                                              ::escape/original->escaped {"Products" "Products_2"}
                                                              :joins                     [{:source-table              4
                                                                                           ::escape/original->escaped {}
                                                                                           :alias                     "Products"
                                                                                           ::escape/alias             "Products_2"
                                                                                           :condition                 [:=
                                                                                                                       [:field 4 nil]
                                                                                                                       [:field 5 {:join-alias "Products"}]]}]}
                                  ::escape/original->escaped {}
                                  :alias                     "Q2"
                                  ::escape/alias             "Q2"
                                  :condition                 [:=
                                                              [:field 6 {:join-alias "Products", :temporal-unit :month}]
                                                              [:field 6 {:join-alias "Q2", :temporal-unit :month}]]}]}

    #'escape/merge-original->escaped-maps
    {:source-query              {:source-table              1
                                 ::escape/original->escaped {"Products" "Products"}
                                 :joins                     [{:source-table              2
                                                              ::escape/original->escaped {"Products" "Products"}
                                                              :alias                     "Products"
                                                              ::escape/alias             "Products"
                                                              :condition                 [:=
                                                                                          [:field 4 nil]
                                                                                          [:field 5 {:join-alias "Products"}]]}]}
     ::escape/original->escaped {"Q2" "Q2", "Products" "Products"}
     :joins                     [{:source-query              {:source-table              3
                                                              ::escape/original->escaped {"Products" "Products_2"}
                                                              :joins                     [{:source-table              4
                                                                                           ::escape/original->escaped {"Products" "Products_2"}
                                                                                           :alias                     "Products"
                                                                                           ::escape/alias             "Products_2"
                                                                                           :condition                 [:=
                                                                                                                       [:field 4 nil]
                                                                                                                       [:field 5 {:join-alias "Products"}]]}]}
                                  ::escape/original->escaped {"Q2" "Q2", "Products" "Products"}
                                  :alias                     "Q2"
                                  ::escape/alias             "Q2"
                                  :condition                 [:=
                                                              [:field 6 {:join-alias "Products", :temporal-unit :month}]
                                                              [:field 6 {:join-alias "Q2", :temporal-unit :month}]]}]}

    #'escape/add-escaped-join-aliases-to-fields
    {:source-query              {:source-table              1
                                 ::escape/original->escaped {"Products" "Products"}
                                 :joins                     [{:source-table              2
                                                              ::escape/original->escaped {"Products" "Products"}
                                                              :alias                     "Products"
                                                              ::escape/alias             "Products"
                                                              :condition                 [:=
                                                                                          [:field 4 nil]
                                                                                          [:field 5 {:join-alias         "Products"
                                                                                                     ::escape/join-alias "Products"}]]}]}
     ::escape/original->escaped {"Q2" "Q2", "Products" "Products"}
     :joins                     [{:source-query              {:source-table              3
                                                              ::escape/original->escaped {"Products" "Products_2"}
                                                              :joins                     [{:source-table              4
                                                                                           ::escape/original->escaped {"Products" "Products_2"}
                                                                                           :alias                     "Products"
                                                                                           ::escape/alias             "Products_2"
                                                                                           :condition                 [:=
                                                                                                                       [:field 4 nil]
                                                                                                                       [:field 5 {:join-alias         "Products"
                                                                                                                                  ::escape/join-alias "Products_2"}]]}]}
                                  ::escape/original->escaped {"Q2" "Q2", "Products" "Products"}
                                  :alias                     "Q2"
                                  ::escape/alias             "Q2"
                                  :condition                 [:=
                                                              [:field 6 {:join-alias         "Products"
                                                                         ::escape/join-alias "Products"
                                                                         :temporal-unit      :month}]
                                                              [:field 6 {:join-alias         "Q2"
                                                                         ::escape/join-alias "Q2"
                                                                         :temporal-unit      :month}]]}]}

    #'escape/replace-original-aliases-with-escaped-aliases
    {:source-query {:source-table 1
                    :joins        [{:source-table 2
                                    :alias        "Products"
                                    :condition    [:=
                                                   [:field 4 nil]
                                                   [:field 5 {:join-alias "Products"}]]}]}
     :joins        [{:source-query {:source-table 3
                                    :joins        [{:source-table 4
                                                    :alias        "Products_2"
                                                    :condition    [:=
                                                                   [:field 4 nil]
                                                                   [:field 5 {:join-alias "Products_2"}]]}]}
                     :alias        "Q2"
                     :condition    [:=
                                    [:field 6 {:join-alias    "Products"
                                               :temporal-unit :month}]
                                    [:field 6 {:join-alias    "Q2"
                                               :temporal-unit :month}]]}]})))


;;; these are e2e tests

(defn- escape-join-aliases [query]
  (do-with-metadata-provider
   (fn []
     (escape/escape-join-aliases query))))

(deftest ^:parallel deduplicate-alias-names-test
  (testing "Should ensure all join aliases are unique, ignoring case"
    ;; some Databases treat table/subquery aliases as case-insensitive and thus `Cat` and `cat` would be considered the
    ;; same thing. That's EVIL! Make sure we deduplicate.
    (driver/with-driver :h2
      (is (= {:database 1
              :type     :query
              :query    {:source-table 1
                         :joins        [{:source-table 2
                                         :alias        "Cat"
                                         :condition    [:= [:field 3 nil] [:field 4 {:join-alias "Cat"}]]}
                                        {:source-table 2
                                         :alias        "cat_2"
                                         :condition    [:= [:field 3 nil] [:field 4 {:join-alias "cat_2"}]]}]
                         :fields       [[:field 3 nil]
                                        [:field 4 {:join-alias "Cat"}]
                                        [:field 4 {:join-alias "cat_2"}]]}
              :info     {:alias/escaped->original {"cat_2" "cat"}}}
             (escape-join-aliases
              {:database 1
               :type     :query
               :query    {:source-table 1
                          :joins        [{:source-table 2
                                          :alias        "Cat"
                                          :condition    [:= [:field 3 nil] [:field 4 {:join-alias "Cat"}]]}
                                         {:source-table 2
                                          :alias        "cat"
                                          :condition    [:= [:field 3 nil] [:field 4 {:join-alias "cat"}]]}]
                          :fields       [[:field 3 nil]
                                         [:field 4 {:join-alias "Cat"}]
                                         [:field 4 {:join-alias "cat"}]]}}))))))

(deftest ^:parallel deduplicate-alias-names-test-2
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
            q'    (escape-join-aliases query)]
        (testing "No need for a map with identical mapping"
          (is (not (contains? (:info q') :alias/escaped->original))))
        (testing "aliases in the query remain the same"
          (letfn [(all-join-aliases* [query]
                    (lib.util.match/match query
                      (m :guard (every-pred map? :alias))
                      (cons (:alias m) (all-join-aliases* (dissoc m :alias)))))
                  (all-join-aliases [query]
                    (set (all-join-aliases* query)))]
            (is (= (all-join-aliases query)
                   (all-join-aliases q')))))))))

(deftest ^:parallel escape-alias-names-test
  (testing "Make sure aliases are escaped with `metabase.driver/escape-alias` for the current driver"
    (driver/with-driver ::custom-escape
      (is (= {:database 1
              :type     :query
              :query    {:source-table 1
                         :joins        [{:source-table 2
                                         :alias        "012_68c4f033"
                                         :condition    [:= [:field 3 nil] [:field 4 {:join-alias "012_68c4f033"}]]}
                                        {:source-table 2
                                         :alias        "가_50a93035"
                                         :condition    [:= [:field 3 nil] [:field 4 {:join-alias "가_50a93035"}]]}]
                         :fields       [[:field 3 nil]
                                        [:field 4 {:join-alias "012_68c4f033"}]
                                        [:field 4 {:join-alias "가_50a93035"}]]}
              :info     {:alias/escaped->original {"가_50a93035"  "가나다라마"
                                                   "012_68c4f033" "0123456789abcdef"}}}
             (driver/with-driver ::custom-escape
               (escape-join-aliases
                {:database 1
                 :type     :query
                 :query    {:source-table 1
                            :joins        [{:source-table 2
                                            :alias        "0123456789abcdef"
                                            :condition    [:= [:field 3 nil] [:field 4 {:join-alias "0123456789abcdef"}]]}
                                           {:source-table 2
                                            :alias        "가나다라마"
                                            :condition    [:= [:field 3 nil] [:field 4 {:join-alias "가나다라마"}]]}]
                            :fields       [[:field 3 nil]
                                           [:field 4 {:join-alias "0123456789abcdef"}]
                                           [:field 4 {:join-alias "가나다라마"}]]}})))))))

(deftest ^:parallel deduplicate-aliases-inside-source-queries-test
  ;; this query is adapted from [[metabase.query-processor-test.explicit-joins-test/joining-nested-queries-with-same-aggregation-test]]
  (is (= {:query {:source-query {:source-table 1
                                 :joins        [{:source-table 2
                                                 :alias        "Products"
                                                 :condition    [:=
                                                                [:field 4 nil]
                                                                [:field 5 {:join-alias "Products"}]]}]
                                 :breakout     [[:field 6 {:join-alias "Products", :temporal-unit :month}]]
                                 :aggregation  [[:distinct [:field 5 {:join-alias "Products"}]]]
                                 :filter       [:=
                                                [:field 7 {:join-alias "Products"}]
                                                "Doohickey"]}
                  :joins        [{:source-query {:source-table 3
                                                 :joins        [{:source-table 4
                                                                 :alias        "Products_2"
                                                                 :condition    [:=
                                                                                [:field 4 nil]
                                                                                [:field 5 {:join-alias "Products_2"}]]
                                                                 :fields       :all}]
                                                 :breakout     [[:field 6 {:join-alias "Products_2", :temporal-unit :month}]]
                                                 :aggregation  [[:distinct [:field 5 {:join-alias "Products_2"}]]]
                                                 :filter       [:= [:field 7 {:join-alias "Products_2"}] "Gizmo"]}
                                  :alias        "Q2"
                                  :condition    [:=
                                                 [:field 6 {:temporal-unit :month}]
                                                 [:field 6 {:join-alias "Q2", :temporal-unit :month}]]}]
                  :order-by     [[:asc [:field 6 {:join-alias "Products", :temporal-unit :month}]]]}
          :info  {:alias/escaped->original {"Products_2" "Products"}}}
         (driver/with-driver :h2
           (escape-join-aliases
            {:query {:source-query {:source-table 1
                                    :joins        [{:source-table 2
                                                    :alias        "Products"
                                                    :condition    [:=
                                                                   [:field 4 nil]
                                                                   [:field 5 {:join-alias "Products"}]]}]
                                    :breakout     [[:field 6 {:join-alias "Products", :temporal-unit :month}]]
                                    :aggregation  [[:distinct [:field 5 {:join-alias "Products"}]]]
                                    :filter       [:=
                                                   [:field 7 {:join-alias "Products"}]
                                                   "Doohickey"]}
                     :joins        [{:source-query {:source-table 3
                                                    :joins        [{:source-table 4
                                                                    :alias        "Products"
                                                                    :condition    [:=
                                                                                   [:field 4 nil]
                                                                                   [:field 5 {:join-alias "Products"}]]
                                                                    :fields       :all}]
                                                    :breakout     [[:field 6 {:join-alias "Products", :temporal-unit :month}]]
                                                    :aggregation  [[:distinct [:field 5 {:join-alias "Products"}]]]
                                                    :filter       [:= [:field 7 {:join-alias "Products"}] "Gizmo"]}
                                     :alias        "Q2"
                                     :condition    [:=
                                                    [:field 6 {:temporal-unit :month}]
                                                    [:field 6 {:join-alias "Q2", :temporal-unit :month}]]}]
                     :order-by     [[:asc [:field 6 {:join-alias "Products", :temporal-unit :month}]]]}})))))

(deftest ^:parallel deduplicate-condition-test
  (testing "Ambiguous aliases inside join `:condition`s"
    (testing "Prefer parent => source-query => join over join inside current join"
      (is (= {:query {:source-query {:source-table 1
                                     :joins        [{:source-table 2
                                                     :alias        "Products"
                                                     :condition    [:=
                                                                    [:field 4 nil]
                                                                    [:field 5 {:join-alias "Products"}]]}]}
                      :joins        [{:source-query {:source-table 3
                                                     :joins        [{:source-table 4
                                                                     :alias        "Products_2"
                                                                     :condition    [:=
                                                                                    [:field 4 nil]
                                                                                    [:field 5 {:join-alias "Products_2"}]]}]}
                                      :alias        "Q2"
                                      :condition    [:=
                                                     ;; condition should
                                                     [:field 6 {:join-alias "Products", :temporal-unit :month}]
                                                     [:field 6 {:join-alias "Q2", :temporal-unit :month}]]}]}
              :info  {:alias/escaped->original {"Products_2" "Products"}}}
             (driver/with-driver :h2
               (escape-join-aliases
                {:query {:source-query {:source-table 1
                                        :joins        [{:source-table 2
                                                        :alias        "Products"
                                                        :condition    [:=
                                                                       [:field 4 nil]
                                                                       [:field 5 {:join-alias "Products"}]]}]}
                         :joins        [{:source-query {:source-table 3
                                                        :joins        [{:source-table 4
                                                                        :alias        "Products"
                                                                        :condition    [:=
                                                                                       [:field 4 nil]
                                                                                       [:field 5 {:join-alias "Products"}]]}]}
                                         :alias        "Q2"
                                         :condition    [:=
                                                        ;; this field is the ambiguous one.
                                                        [:field 6 {:join-alias "Products", :temporal-unit :month}]
                                                        [:field 6 {:join-alias "Q2", :temporal-unit :month}]]}]}})))))
    (testing "Prefer current join join over parent => source-query => join"
      (is (= {:query {:source-query {:source-table 1
                                     :joins        [{:source-table 2
                                                     :alias        "Products"
                                                     :condition    [:=
                                                                    [:field 4 nil]
                                                                    [:field 5 {:join-alias "Products"}]]}]}
                      :joins        [{:source-table 3
                                      :joins        [{:source-table 4
                                                      :alias        "Products_2"
                                                      :condition    [:=
                                                                     [:field 4 nil]
                                                                     [:field 5 {:join-alias "Products_2"}]]}]}]}
              :info  {:alias/escaped->original {"Products_2" "Products"}}}
             (driver/with-driver :h2
               (escape-join-aliases
                {:query {:source-query {:source-table 1
                                        :joins        [{:source-table 2
                                                        :alias        "Products"
                                                        :condition    [:=
                                                                       [:field 4 nil]
                                                                       [:field 5 {:join-alias "Products"}]]}]}
                         :joins        [{:source-table 3
                                         :joins        [{:source-table 4
                                                         :alias        "Products"
                                                         :condition    [:=
                                                                        [:field 4 nil]
                                                                        [:field 5 {:join-alias "Products"}]]}]}]}})))))))

(deftest ^:parallel escape-aliases-even-with-no-joins-at-current-level-test
  (testing "We should still escape stuff with `:join-alias` even if there are no joins at the current level.")
  (is (= {:query {:source-query {:source-query {:source-table 1
                                                :joins        [{:source-table 2
                                                                :alias        "Pro_acce5f27"
                                                                :condition    [:=
                                                                               [:field 4 nil]
                                                                               [:field 5 {:join-alias "Pro_acce5f27"}]]}]}}
                  :order-by     [[:asc [:field 6 {:join-alias "Pro_acce5f27", :temporal-unit :month}]]]}
          :info  {:alias/escaped->original {"Pro_acce5f27" "Products_Long_Identifier"}}}
         (driver/with-driver ::custom-escape
           (escape-join-aliases
            {:query {:source-query {:source-query {:source-table 1
                                                   :joins        [{:source-table 2
                                                                   :alias        "Products_Long_Identifier"
                                                                   :condition    [:=
                                                                                  [:field 4 nil]
                                                                                  [:field 5 {:join-alias "Products_Long_Identifier"}]]}]}}
                     :order-by     [[:asc [:field 6 {:join-alias    "Products_Long_Identifier"
                                                     :temporal-unit :month}]]]}})))))

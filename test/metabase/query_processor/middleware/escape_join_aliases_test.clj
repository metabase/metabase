(ns metabase.query-processor.middleware.escape-join-aliases-test
  (:require [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.impl :as driver.impl]
            [metabase.query-processor.middleware.escape-join-aliases :as escape-join-aliases]))

(deftest deduplicate-alias-names-test
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
                                  [:field 4 {:join-alias "cat_2"}]]}}
             (escape-join-aliases/escape-join-aliases
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
                                   [:field 4 {:join-alias "cat"}]]}}))))))

(driver/register! ::custom-escape :abstract? true)

(defmethod driver/escape-alias ::custom-escape
  [_driver s]
  (driver.impl/truncate-alias s 12))

(deftest escape-alias-names-test
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
                                  [:field 4 {:join-alias "가_50a93035"}]]}}
             (escape-join-aliases/escape-join-aliases
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
                                   [:field 4 {:join-alias "가나다라마"}]]}}))))))

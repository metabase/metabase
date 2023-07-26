(ns ^:mb/once metabase.search.filter-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.config :as search.config]
   [metabase.search.filter :as search.filter]))

(def ^:private default-search-ctx
  {:search-string       "a string"
   :archived?           false
   :models             search.config/all-models
   :current-user-perms #{"/"}})

(deftest ^:parallel search-context->applicable-models-test
  (testing "without optional filters"
    (testing "return :models as is"
      (is (= search.config/all-models
             (search.filter/search-context->applicable-models default-search-ctx)))
      (is (= #{}
             (search.filter/search-context->applicable-models
              (merge default-search-ctx
                     {:models #{}}))))

      (is (= search.config/all-models
             (search.filter/search-context->applicable-models
              (merge default-search-ctx
                     {:archived? true}))))))

  (testing "optional filters will return intersection of support models and provided models\n"
    (testing "created by"
      (is (= #{"dashboard" "dataset" "action" "card"}
             (search.filter/search-context->applicable-models
              (merge default-search-ctx
                     {:created-by 1}))))

      (is (= #{"dashboard" "dataset"}
             (search.filter/search-context->applicable-models
              (merge default-search-ctx
                     {:models #{"dashboard" "dataset" "table"}
                      :created-by 1})))))))

(def ^:private base-search-query
  {:select [:*]
   :from   [:table]})

(deftest ^:parallel build-filters-test
  (testing "no optional filters"
    (is (= [:and [:or
                  [:like [:lower :card.name] "%a%"]
                  [:like [:lower :card.name] "%string%"]
                  [:like [:lower :card.description] "%a%"]
                  [:like [:lower :card.description] "%string%"]]
            [:= :card.archived false]]
           (:where (search.filter/build-filters base-search-query "card" default-search-ctx)))))

  (testing "optional filters"
    (testing "created-by"
      (is (= [:and
              [:or
               [:like [:lower :card.name] "%a%"]
               [:like [:lower :card.name] "%string%"]
               [:like [:lower :card.description] "%a%"]
               [:like [:lower :card.description] "%string%"]]
              [:= :card.archived false]
              [:= :card.creator_id 1]]
             (:where (search.filter/build-filters
                       base-search-query
                       "card"
                       (merge default-search-ctx
                              {:created-by 1})))))
      (testing "throw error for unsupport models"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #":created-by filter for database is not supported"
             (search.filter/build-filters
              base-search-query
              "database"
              (merge default-search-ctx
                     {:created-by 1}))))))))

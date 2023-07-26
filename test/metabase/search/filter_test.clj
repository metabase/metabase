(ns ^:mb/once metabase.search.filter-test
  (:require
   [clojure.test :refer :all]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.search.config :as search.config]
   [metabase.search.filter :as search.filter]))

(def ^:private default-search-ctx
  {:search-string       nil
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
  (doseq [[[model search-ctx] expected-where]
          [;; -- card models
           [["card" default-search-ctx]
            [:= :card.archived false]]

           [["card" (merge default-search-ctx {:archived? true})]
            [:= :card.archived true]]


           ;; with search string
           [["card" (merge default-search-ctx {:search-string "a string"})]
            [:and
             [:or
              [:like [:lower :card.name] "%a%"]
              [:like [:lower :card.name] "%string%"]
              [:like [:lower :card.description] "%a%"]
              [:like [:lower :card.description] "%string%"]]
             [:= :card.archived false]]]

           ;; created by filters
           [["card" (merge default-search-ctx {:created-by 1})]
            [:and [:= :card.archived false] [:= :card.creator_id 1]]]


           ;; -- table models
           [["table" (merge default-search-ctx {:archived? false})]
            [:and [:= :table.active true] [:= :table.visibility_type nil]]]]]

    (testing (format "filter for model %s with context %s" model search-ctx)
      (is (= expected-where
             (:where (search.filter/build-filters base-search-query model search-ctx))))))

  (testing "throw error for filtering with unsupport models"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #":created-by filter for database is not supported"
         (search.filter/build-filters
          base-search-query
          "database"
          (merge default-search-ctx
                 {:created-by 1}))))))

(deftest build-filters-indexed-entity-test
  (testing "users that are not sandboxed or impersonated can search for indexed entity"
    (with-redefs [premium-features/sandboxed-or-impersonated-user? (constantly false)]
      (is (= [:and
              [:or [:like [:lower :model-index-value.name] "%foo%"]]
              [:inline [:= 1 1]]]
             (:where (search.filter/build-filters
                      base-search-query
                      "indexed-entity"
                      (merge default-search-ctx {:search-string "foo"})))))))

  (testing "otherwise search result is empty"
    (with-redefs [premium-features/sandboxed-or-impersonated-user? (constantly true)]
      (is (= [:and
              [:or [:= 0 1]]
              [:inline [:= 1 1]]]
             (:where (search.filter/build-filters
                      base-search-query
                      "indexed-entity"
                      (merge default-search-ctx {:search-string "foo"}))))))))


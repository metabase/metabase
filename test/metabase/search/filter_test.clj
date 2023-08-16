(ns ^:mb/once metabase.search.filter-test
  (:require
   [clojure.test :refer :all]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.search.config :as search.config]
   [metabase.search.filter :as search.filter]
   [metabase.test :as mt]))

(def ^:private default-search-ctx
  {:search-string       nil
   :archived?           false
   :models             search.config/all-models
   :current-user-perms #{"/"}})

(deftest ^:parallel ->applicable-models-test
  (testing "without optional filters"
    (testing "return :models as is"
      (is (= search.config/all-models
             (search.filter/search-context->applicable-models
              default-search-ctx)))

      (is (= #{}
             (search.filter/search-context->applicable-models
              (assoc default-search-ctx :models #{}))))

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
                      :created-by 1})))))

    (testing "verified"
      (is (= #{"card" "collection"}
             (search.filter/search-context->applicable-models
              (merge default-search-ctx
                     {:verified true}))))

      (is (= #{"card"}
             (search.filter/search-context->applicable-models
              (merge default-search-ctx
                     {:models   #{"card" "dashboard" "dataset" "table"}
                      :verified true})))))))

(def ^:private base-search-query
  {:select [:*]
   :from   [:table]})

(deftest ^:parallel build-archived-filter-test
  (testing "archived filters"
    (is (= [:= :card.archived false]
           (:where (search.filter/build-filters
                    base-search-query "card" default-search-ctx))))

    (is (= [:and [:= :table.active true] [:= :table.visibility_type nil]]
           (:where (search.filter/build-filters
                    base-search-query "table"  default-search-ctx))))))

(deftest ^:parallel build-filter-with-search-string-test
  (testing "with search string"
    (is (= [:and
            [:or
             [:like [:lower :card.name] "%a%"]
             [:like [:lower :card.name] "%string%"]
             [:like [:lower :card.description] "%a%"]
             [:like [:lower :card.description] "%string%"]]
            [:= :card.archived false]]
           (:where (search.filter/build-filters
                    base-search-query "card"
                    (merge default-search-ctx {:search-string "a string"})))))))

(deftest build-created-at-filter-test
  (testing "created-at filter"
    (mt/with-clock #t "2023-05-04T10:02:05Z[UTC]"
      (are [created-at expected-where]
           (= expected-where
              (->> (search.filter/build-filters
                    base-search-query "card"
                    (merge default-search-ctx {:created-at created-at}))
                   :where
                   ;; drop the first 2 clauses [:and [:= :card.archived false]]
                   (drop 2)))
           ;; absolute datetime
           "Q1-2023"                                 [[:>= [:cast :card.created_at :date] #t "2023-01-01"]
                                                      [:< [:cast :card.created_at :date]  #t "2023-04-01"]]
           "2016-04-18~2016-04-23"                   [[:>= [:cast :card.created_at :date] #t "2016-04-18"]
                                                      [:< [:cast :card.created_at :date]  #t "2016-04-24"]]
           "2016-04-18"                              [[:>= [:cast :card.created_at :date] #t "2016-04-18"]
                                                      [:< [:cast :card.created_at :date]  #t "2016-04-19"]]
           "2023-05-04~"                             [[:> [:cast :card.created_at :date]  #t "2023-05-04"]]
           "~2023-05-04"                             [[:< [:cast :card.created_at :date]  #t "2023-05-05"]]
           "2016-04-18T10:30:00~2016-04-23T11:30:00" [[:>= :card.created_at #t "2016-04-18T10:30"]
                                                      [:< :card.created_at #t "2016-04-23T11:31:00"]]
           "2016-04-23T10:00:00"                     [[:>= :card.created_at #t "2016-04-23T10:00"]
                                                      [:< :card.created_at  #t "2016-04-23T10:01"]]
           "2016-04-18T10:30:00~"                    [[:> :card.created_at #t "2016-04-18T10:30"]]
           "~2016-04-18T10:30:00"                    [[:< :card.created_at #t "2016-04-18T10:31"]]
           ;; relative datetime
           "past3days"                               [[:>= [:cast :card.created_at :date] #t "2023-05-01"]
                                                      [:< [:cast :card.created_at :date]  #t "2023-05-04"]]
           "past3days~"                              [[:>= [:cast :card.created_at :date] #t "2023-05-01"]
                                                      [:< [:cast :card.created_at :date] #t "2023-05-05"]]
           "past3hours~"                             [[:>= :card.created_at #t "2023-05-04T07:00"]
                                                      [:< :card.created_at #t "2023-05-04T11:00"]]
           "next3days"                               [[:>= [:cast :card.created_at :date] #t "2023-05-05"]
                                                      [:< [:cast :card.created_at :date]  #t "2023-05-08"]]
           "thisminute"                              [[:>= :card.created_at #t "2023-05-04T10:02"]
                                                      [:< :card.created_at #t "2023-05-04T10:03"]]
           "lasthour"                                [[:>= :card.created_at #t "2023-05-04T09:00"]
                                                      [:< :card.created_at #t "2023-05-04T10:00"]]
           "past1months-from-36months"               [[:>= [:cast :card.created_at :date] #t "2020-04-01"]
                                                      [:< [:cast :card.created_at :date]  #t "2020-05-01"]]
           "today"                                   [[:>= [:cast :card.created_at :date] #t "2023-05-04"]
                                                      [:< [:cast :card.created_at :date] #t "2023-05-05"]]
           "yesterday"                               [[:>= [:cast :card.created_at :date] #t "2023-05-03"]
                                                      [:< [:cast :card.created_at :date] #t "2023-05-04"]]))))

(deftest ^:parallel build-created-by-filter-test
  (testing "created-by filter"
    (is (= [:and [:= :card.archived false] [:= :card.creator_id 1]]
           (:where (search.filter/build-filters
                    base-search-query "card"
                    (merge default-search-ctx
                           {:created-by 1})))))))

(deftest build-verified-filter-test
  (testing "verified filter"
    (premium-features-test/with-premium-features #{:content-verification :official-collections}
      (testing "for cards"
        (is (= (merge
                base-search-query
                {:where  [:and
                          [:= :card.archived false]
                          [:= :moderation_review.status "verified"]
                          [:= :moderation_review.moderated_item_type "card"]
                          [:= :moderation_review.most_recent true]]
                 :join   [:moderation_review [:= :moderation_review.moderated_item_id :card.id]]})
               (search.filter/build-filters
                base-search-query "card"
                (merge default-search-ctx {:verified true})))))

      (testing "for collections"
        (is (= (merge
                base-search-query
                {:where [:and [:= :collection.archived false] [:= :collection.authority_level "official"]]})
               (search.filter/build-filters
                base-search-query "collection"
                (merge default-search-ctx {:verified true}))))))

    (premium-features-test/with-premium-features #{}
      (testing "for cards without ee features"
        (is (= (merge
                base-search-query
                {:where  [:and
                          [:= :card.archived false]
                          [:inline [:= 0 1]]]})
               (search.filter/build-filters
                base-search-query "card"
                (merge default-search-ctx {:verified true})))))

      (testing "for collections without ee features"
        (is (= (merge
                base-search-query
                {:where [:and [:= :collection.archived false] [:inline [:= 0 1]]]})
               (search.filter/build-filters
                base-search-query "collection"
                (merge default-search-ctx {:verified true}))))))))

(deftest ^:parallel buidl-filter-throw-error-for-unsuported-filters-test
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

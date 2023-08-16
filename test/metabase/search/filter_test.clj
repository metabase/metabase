(ns ^:mb/once metabase.search.filter-test
  (:require
   [clojure.test :refer :all]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.search.config :as search.config]
   [metabase.search.filter :as search.filter]))

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
      (is (= #{"dataset" "card"}
             (search.filter/search-context->applicable-models
              (merge default-search-ctx
                     {:verified true}))))

      (is (= #{"dataset"}
             (search.filter/search-context->applicable-models
              (merge default-search-ctx
                     {:models   #{"dashboard" "dataset" "table"}
                      :verified true})))))))

(def ^:private base-search-query
  {:select [:*]
   :from   [:table]})

(deftest build-filters-test
  (testing "archived filters"
    (is (= [:= :card.archived false]
           (:where (search.filter/build-filters
                    base-search-query "card" default-search-ctx))))

    (is (= [:and [:= :table.active true] [:= :table.visibility_type nil]]
           (:where (search.filter/build-filters
                    base-search-query "table"  default-search-ctx)))))

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
                    (merge default-search-ctx {:search-string "a string"}))))))

  (testing "created-by filter"
    (is (= [:and [:= :card.archived false] [:= :card.creator_id 1]]
           (:where (search.filter/build-filters
                    base-search-query "card"
                    (merge default-search-ctx
                           {:created-by 1}))))))

  (testing "verified filter"
    (premium-features-test/with-premium-features #{:content-verification}
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

      (testing "for models"
        (is (= (merge
                base-search-query
                {:where  [:and
                          [:= :card.archived false]
                          [:= :moderation_review.status "verified"]
                          [:= :moderation_review.moderated_item_type "card"]
                          [:= :moderation_review.most_recent true]]
                 :join   [:moderation_review [:= :moderation_review.moderated_item_id :card.id]]})
               (search.filter/build-filters
                base-search-query "dataset"
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

      (testing "for models without ee features"
        (is (= (merge
                base-search-query
                {:where  [:and
                          [:= :card.archived false]
                          [:inline [:= 0 1]]]})
               (search.filter/build-filters
                base-search-query "dataset"
                (merge default-search-ctx {:verified true})))))))

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

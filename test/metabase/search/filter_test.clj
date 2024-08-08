(ns ^:mb/once metabase.search.filter-test
  (:require
   [clojure.test :refer :all]
   [metabase.audit :as audit]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.search.config :as search.config]
   [metabase.search.filter :as search.filter]
   [metabase.test :as mt]))

(def default-search-ctx
  {:search-string       nil
   :archived?           false
   :models             search.config/all-models
   :model-ancestors?   false
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
                     {:created-by #{1}}))))

      (is (= #{"dashboard" "dataset"}
             (search.filter/search-context->applicable-models
              (merge default-search-ctx
                     {:models #{"dashboard" "dataset" "table"}
                      :created-by #{1}})))))

    (testing "created at"
      (is (= #{"dashboard" "table" "dataset" "collection" "database" "action" "card"}
             (search.filter/search-context->applicable-models
              (merge default-search-ctx
                     {:created-at "past3days"}))))

      (is (= #{"dashboard" "table" "dataset"}
             (search.filter/search-context->applicable-models
              (merge default-search-ctx
                     {:models #{"dashboard" "dataset" "table"}
                      :created-at "past3days"})))))

    (testing "verified"
      (is (= #{"dataset" "card"}
             (search.filter/search-context->applicable-models
              (merge default-search-ctx
                     {:verified true}))))

      (is (= #{"dataset"}
             (search.filter/search-context->applicable-models
              (merge default-search-ctx
                     {:models   #{"dashboard" "dataset" "table"}
                      :verified true})))))

    (testing "last edited by"
      (is (= #{"dashboard" "dataset" "card" "metric"}
             (search.filter/search-context->applicable-models
              (merge default-search-ctx
                     {:last-edited-by #{1}}))))

      (is (= #{"dashboard" "dataset"}
             (search.filter/search-context->applicable-models
              (merge default-search-ctx
                     {:models         #{"dashboard" "dataset" "table"}
                      :last-edited-by #{1}})))))

   (testing "last edited at"
     (is (= #{"dashboard" "dataset" "action" "metric" "card"}
            (search.filter/search-context->applicable-models
             (merge default-search-ctx
                    {:last-edited-at "past3days"}))))

     (is (= #{"dashboard" "dataset"}
            (search.filter/search-context->applicable-models
             (merge default-search-ctx
                    {:models   #{"dashboard" "dataset" "table"}
                     :last-edited-at "past3days"})))))

   (testing "search native query"
     (is (= #{"dataset" "action" "card"}
            (search.filter/search-context->applicable-models
             (merge default-search-ctx
                    {:search-native-query true})))))))

(deftest joined-with-table?-test
  (are [expected args]
       (= expected (apply #'search.filter/joined-with-table? args))

       false
       [{} :join :a]

       true
       [{:join [:a [:= :a.b :c.d]]} :join :a]

       false
       [{:join [:a [:= :a.b :c.d]]} :join :d]

       ;; work with multiple join types
       false
       [{:join [:a [:= :a.b :c.d]]} :left-join :d]

       ;; do the same with other join types too
       true
       [{:left-join [:a [:= :a.b :c.d]]} :left-join :a]

       false
       [{:left-join [:a [:= :a.b :c.d]]} :left-join :d]))


(def ^:private base-search-query
  {:select [:*]
   :from   [:table]})

(deftest ^:parallel build-archived-filter-test
  (testing "archived filters"
    (is (= [:= :card.archived false]
           (:where (search.filter/build-filters
                    base-search-query "card" default-search-ctx))))

    (is (= [:and
            [:= :table.active true]
            [:= :table.visibility_type nil]
            [:not [:= :table.db_id audit/audit-db-id]]]
           (:where (search.filter/build-filters
                    base-search-query "table"  default-search-ctx))))))

(deftest ^:parallel build-table-filter-always-ignores-audit-tables
  (is (contains?
         (set (:where (search.filter/build-filters
                       base-search-query "table"  default-search-ctx)))
         [:not [:= :table.db_id audit/audit-db-id]])))

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

(deftest date-range-filter-clause-test
  (mt/with-clock #t "2023-05-04T10:02:05Z[UTC]"
    (are [created-at expected-where]
         (= expected-where (#'search.filter/date-range-filter-clause :card.created_at created-at))
         ;; absolute datetime
         "Q1-2023"                                 [:and [:>= [:cast :card.created_at :date] #t "2023-01-01"]
                                                    [:< [:cast :card.created_at :date]  #t "2023-04-01"]]
         "2016-04-18~2016-04-23"                   [:and [:>= [:cast :card.created_at :date] #t "2016-04-18"]
                                                    [:< [:cast :card.created_at :date]  #t "2016-04-24"]]
         "2016-04-18"                              [:and [:>= [:cast :card.created_at :date] #t "2016-04-18"]
                                                    [:< [:cast :card.created_at :date]  #t "2016-04-19"]]
         "2023-05-04~"                             [:> [:cast :card.created_at :date]  #t "2023-05-04"]
         "~2023-05-04"                             [:< [:cast :card.created_at :date]  #t "2023-05-05"]
         "2016-04-18T10:30:00~2016-04-23T11:30:00" [:and [:>= :card.created_at #t "2016-04-18T10:30"]
                                                    [:< :card.created_at #t "2016-04-23T11:31:00"]]
         "2016-04-23T10:00:00"                     [:and [:>= :card.created_at #t "2016-04-23T10:00"]
                                                    [:< :card.created_at  #t "2016-04-23T10:01"]]
         "2016-04-18T10:30:00~"                    [:> :card.created_at #t "2016-04-18T10:30"]
         "~2016-04-18T10:30:00"                    [:< :card.created_at #t "2016-04-18T10:31"]
         ;; relative datetime
         "past3days"                               [:and [:>= [:cast :card.created_at :date] #t "2023-05-01"]
                                                    [:< [:cast :card.created_at :date]  #t "2023-05-04"]]
         "past3days~"                              [:and [:>= [:cast :card.created_at :date] #t "2023-05-01"]
                                                    [:< [:cast :card.created_at :date] #t "2023-05-05"]]
         "past3hours~"                             [:and [:>= :card.created_at #t "2023-05-04T07:00"]
                                                    [:< :card.created_at #t "2023-05-04T11:00"]]
         "next3days"                               [:and [:>= [:cast :card.created_at :date] #t "2023-05-05"]
                                                    [:< [:cast :card.created_at :date]  #t "2023-05-08"]]
         "thisminute"                              [:and [:>= :card.created_at #t "2023-05-04T10:02"]
                                                    [:< :card.created_at #t "2023-05-04T10:03"]]
         "lasthour"                                [:and [:>= :card.created_at #t "2023-05-04T09:00"]
                                                    [:< :card.created_at #t "2023-05-04T10:00"]]
         "past1months-from-36months"               [:and [:>= [:cast :card.created_at :date] #t "2020-04-01"]
                                                    [:< [:cast :card.created_at :date]  #t "2020-05-01"]]
         "today"                                   [:and [:>= [:cast :card.created_at :date] #t "2023-05-04"]
                                                    [:< [:cast :card.created_at :date] #t "2023-05-05"]]
         "yesterday"                               [:and [:>= [:cast :card.created_at :date] #t "2023-05-03"]
                                                    [:< [:cast :card.created_at :date] #t "2023-05-04"]])))

;; both created at and last-edited-at use [[search.filter/date-range-filter-clause]]
;; to generate the filter clause so for the full test cases, check [[date-range-filter-clause-test]]
;; these 2 tests are for checking the shape of the query
(deftest ^:parallel created-at-filter-test
  (testing "created-at filter"
    (is (= {:select [:*]
            :from   [:table]
            :where  [:and
                     [:= :card.archived false]
                     [:>= [:cast :card.created_at :date] #t "2016-04-18"]
                     [:< [:cast :card.created_at :date]  #t "2016-04-24"]]}
           (search.filter/build-filters
            base-search-query "card"
            (merge default-search-ctx {:created-at "2016-04-18~2016-04-23"}))))))

(deftest ^:parallel last-edited-at-filter-test
  (testing "last edited at filter"
    (is (= {:select [:*]
            :from   [:table]
            :join   [:revision [:= :revision.model_id :card.id]]
            :where  [:and
                     [:= :card.archived false]
                     [:= :revision.most_recent true]
                     [:= :revision.model "Card"]
                     [:>= [:cast :revision.timestamp :date] #t "2016-04-18"]
                     [:< [:cast :revision.timestamp :date] #t "2016-04-24"]]}
           (search.filter/build-filters
            base-search-query "dataset"
            (merge default-search-ctx {:last-edited-at "2016-04-18~2016-04-23"}))))

   (testing "do not join twice if has both last-edited-at and last-edited-by"
     (is (= {:select [:*]
             :from   [:table]
             :join   [:revision [:= :revision.model_id :card.id]]
             :where  [:and
                      [:= :card.archived false]
                      [:= :revision.most_recent true]
                      [:= :revision.model "Card"]
                      [:>= [:cast :revision.timestamp :date] #t "2016-04-18"]
                      [:< [:cast :revision.timestamp :date] #t "2016-04-24"]
                      [:= :revision.user_id 1]]}
            (search.filter/build-filters
             base-search-query "dataset"
             (merge default-search-ctx {:last-edited-at "2016-04-18~2016-04-23"
                                        :last-edited-by #{1}})))))

   (testing "for actiion"
     (is (= {:select [:*]
             :from   [:table]
             :where  [:and [:= :action.archived false]
                      [:>= [:cast :action.updated_at :date] #t "2016-04-18"]
                      [:< [:cast :action.updated_at :date] #t "2016-04-24"]]}
            (search.filter/build-filters
             base-search-query "action"
             (merge default-search-ctx {:last-edited-at "2016-04-18~2016-04-23"})))))))

(deftest ^:parallel build-created-by-filter-test
  (testing "created-by filter"
    (is (= [:and [:= :card.archived false] [:= :card.creator_id 1]]
           (:where (search.filter/build-filters
                    base-search-query "card"
                    (merge default-search-ctx
                           {:created-by #{1}})))))
    (is (= [:and [:= :card.archived false] [:in :card.creator_id #{1 2}]]
           (:where (search.filter/build-filters
                    base-search-query "card"
                    (merge default-search-ctx
                           {:created-by #{1 2}})))))))

(deftest ^:parallel build-last-edited-by-filter-test
  (testing "last edited by filter"
    (is (= {:select [:*]
            :from   [:table]
            :where  [:and
                     [:= :card.archived false]
                     [:= :revision.most_recent true]
                     [:= :revision.model "Card"]
                     [:= :revision.user_id 1]]
            :join   [:revision [:= :revision.model_id :card.id]]}
           (search.filter/build-filters
            base-search-query "dataset"
            (merge default-search-ctx
                   {:last-edited-by #{1}})))))

  (testing "last edited by filter"
    (is (= {:select [:*]
            :from   [:table]
            :where  [:and
                     [:= :card.archived false]
                     [:= :revision.most_recent true]
                     [:= :revision.model "Card"]
                     [:in :revision.user_id #{1 2}]]
            :join   [:revision [:= :revision.model_id :card.id]]}
           (search.filter/build-filters
            base-search-query "dataset"
            (merge default-search-ctx
                   {:last-edited-by #{1 2}}))))))

(deftest build-verified-filter-test
  (testing "verified filter"
    (mt/with-premium-features #{:content-verification}
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

    (mt/with-premium-features #{}
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
                (merge default-search-ctx {:verified true}))))))))

(deftest ^:parallel build-filter-throw-error-for-unsuported-filters-test
  (testing "throw error for filtering with unsupport models"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #":created-by filter for database is not supported"
         (search.filter/build-filters
          base-search-query
          "database"
          (merge default-search-ctx
                 {:created-by #{1}}))))))

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

(deftest build-filters-search-native-query
  (doseq [model ["dataset" "card"]]
    (testing model
      (testing "do not search for native query by default"
        (is (= [:and
                [:or [:like [:lower :card.name] "%foo%"] [:like [:lower :card.description] "%foo%"]]
                [:= :card.archived false]]
               (:where (search.filter/build-filters
                        base-search-query
                        model
                        (merge default-search-ctx {:search-string "foo"}))))))

      (testing "search in both name, description and dataset_query if is enabled"
        (is (= [:and [:or
                      [:like [:lower :card.name] "%foo%"]
                      [:like [:lower :card.description] "%foo%"]
                      [:and
                       [:= :card.query_type "native"]
                       [:like [:lower :card.dataset_query] "%foo%"]]]
                [:= :card.archived false]]
               (:where (search.filter/build-filters
                        base-search-query
                        model
                        (merge default-search-ctx {:search-string "foo" :search-native-query true})))))))

    (testing "action"
      (testing "do not search for native query by default"
        (is (= [:and
                [:or [:like [:lower :action.name] "%foo%"] [:like [:lower :action.description] "%foo%"]]
                [:= :action.archived false]]
               (:where (search.filter/build-filters
                        base-search-query
                        "action"
                        (merge default-search-ctx {:search-string "foo"}))))))

      (testing "search in both name, description and dataset_query if is enabled"
        (is (= [:and
                [:or
                 [:like [:lower :action.name] "%foo%"]
                 [:like [:lower :action.description] "%foo%"]
                 [:like [:lower :query_action.dataset_query] "%foo%"]]
                [:= :action.archived false]]
               (:where (search.filter/build-filters
                        base-search-query
                        "action"
                        (merge default-search-ctx {:search-string "foo" :search-native-query true})))))))))

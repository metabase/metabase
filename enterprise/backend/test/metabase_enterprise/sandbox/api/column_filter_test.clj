(ns metabase-enterprise.sandbox.api.column-filter-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.api.column-filter :as col-filter]
   [metabase-enterprise.sandbox.test-util :as mt.tu]
   [metabase-enterprise.test :as met]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

;;; -------------------------------- Pure-function tests --------------------------------

(deftest filter-fields-by-card-no-card-test
  (testing "filter-fields-by-card returns fields unchanged when card is nil"
    (let [fields [{:id 1 :name "A"} {:id 2 :name "B"}]]
      (is (= fields (col-filter/filter-fields-by-card nil fields)))))
  (testing "filter-fields-by-card returns fields unchanged when card has no dataset_query"
    (let [fields [{:id 1 :name "A"}]]
      (is (= fields (col-filter/filter-fields-by-card
                     {:dataset_query nil :result_metadata []}
                     fields))))))

(deftest empty-result-metadata-fails-closed-test
  (testing "filter-fields-by-card returns NO fields when sandbox card has empty result_metadata.

           DO NOT FLIP THIS TO FAIL-OPEN WITHOUT A SECURITY REVIEW.

           Fail-open would silently degrade a sandbox stuck in failed-metadata-extraction
           state into no column restriction at all. The acceptable trade-off is that
           sandboxed users see zero fields during the (sub-second) async metadata window
           for newly-created cards, and zero fields permanently for cards whose extraction
           failed — both of which are admin-config issues, not security regressions.

           See the namespace docstring of metabase-enterprise.sandbox.api.column-filter
           for the full rationale."
    (let [mbql-card-empty-md  {:dataset_query {:type :query
                                               :query {:source-table 1}
                                               :database 1}
                               :result_metadata []}
          mbql-card-nil-md    {:dataset_query {:type :query
                                               :query {:source-table 1}
                                               :database 1}
                               :result_metadata nil}
          native-card-empty   {:dataset_query {:type :native
                                               :native {:query "SELECT 1"}
                                               :database 1}
                               :result_metadata []}
          native-card-nil     {:dataset_query {:type :native
                                               :native {:query "SELECT 1"}
                                               :database 1}
                               :result_metadata nil}
          fields              [{:id 1 :name "A"} {:id 2 :name "B"} {:id 3 :name "C"}]]
      (testing "MBQL card with empty result_metadata filters everything out"
        (is (= [] (col-filter/filter-fields-by-card mbql-card-empty-md fields))))
      (testing "MBQL card with nil result_metadata filters everything out"
        (is (= [] (col-filter/filter-fields-by-card mbql-card-nil-md fields))))
      (testing "Native card with empty result_metadata filters everything out"
        (is (= [] (col-filter/filter-fields-by-card native-card-empty fields))))
      (testing "Native card with nil result_metadata filters everything out"
        (is (= [] (col-filter/filter-fields-by-card native-card-nil fields)))))))

;;; ----------------------------- Integration tests with a real GTAP -----------------------------

(deftest filter-fields-for-table-mbql-sandbox-test
  (testing "filter-fields-for-table keeps only columns referenced by an MBQL sandbox source card"
    (met/with-gtaps! {:gtaps      {:venues
                                   {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}
                                    :query      (mt.tu/restricted-column-query (mt/id))}}
                      :attributes {:cat 50}}
      (let [all-fields (t2/select :model/Field :table_id (mt/id :venues))
            filtered   (col-filter/filter-fields-for-table (mt/id :venues) all-fields)]
        (is (= #{"CATEGORY_ID" "ID" "NAME"}
               (set (map (comp u/upper-case-en :name) filtered))))))))

(deftest filter-fields-for-table-no-sandbox-test
  (testing "filter-fields-for-table returns fields unchanged when no sandbox exists for the user+table"
    (mt/with-current-user (mt/user->id :rasta)
      (let [all-fields (vec (t2/select :model/Field :table_id (mt/id :venues)))
            filtered   (col-filter/filter-fields-for-table (mt/id :venues) all-fields)]
        (is (= (count all-fields) (count filtered))
            "No sandbox configured for this user+table — should be a pass-through")))))

(deftest batch-filter-fields-by-table-test
  (testing "batch-filter-fields-by-table filters each table independently in a single DB query"
    (met/with-gtaps! {:gtaps      {:venues
                                   {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}
                                    :query      (mt.tu/restricted-column-query (mt/id))}}
                      :attributes {:cat 50}}
      (let [all-venues-fields   (vec (t2/select :model/Field :table_id (mt/id :venues)))
            all-checkins-fields (vec (t2/select :model/Field :table_id (mt/id :checkins)))
            result (col-filter/batch-filter-fields-by-table
                    {(mt/id :venues)   all-venues-fields
                     (mt/id :checkins) all-checkins-fields})]
        (testing "sandboxed table is filtered"
          (is (= #{"CATEGORY_ID" "ID" "NAME"}
                 (set (map (comp u/upper-case-en :name) (get result (mt/id :venues)))))))
        (testing "non-sandboxed table is unchanged"
          (is (= (count all-checkins-fields) (count (get result (mt/id :checkins))))))))))

(deftest empty-result-metadata-integration-test
  (testing "/api/table/:id/query_metadata returns zero fields when the sandbox source card has nil
           result_metadata. Pins the fail-closed contract end-to-end through the API surface."
    (met/with-gtaps! {:gtaps      {:venues
                                   {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}
                                    :query      (mt.tu/restricted-column-query (mt/id))}}
                      :attributes {:cat 50}}
      (let [card (t2/select-one :model/Card
                                {:select [:c.id]
                                 :from   [[:sandboxes :s]]
                                 :join   [[:permissions_group :pg] [:= :s.group_id :pg.id]
                                          [:report_card :c] [:= :c.id :s.card_id]]
                                 :where  [:= :pg.id (u/the-id &group)]})]
        ;; Forcibly clear result_metadata to simulate the async-not-yet-complete or failed-extraction state.
        (t2/update! :model/Card :id (:id card) {:result_metadata nil})
        (testing "sandboxed user sees zero fields (fail-closed)"
          (let [{:keys [fields]} (mt/user-http-request :rasta :get 200
                                                       (format "table/%d/query_metadata"
                                                               (mt/id :venues)))]
            (is (= [] fields))))
        (testing "admin still sees all fields (sandbox not enforced for admins)"
          (let [{:keys [fields]} (mt/user-http-request :crowberto :get 200
                                                       (format "table/%d/query_metadata"
                                                               (mt/id :venues)))]
            (is (= 6 (count fields)))))))))

(deftest find-sandbox-source-cards-batch-test
  (testing "find-sandbox-source-cards returns a {table-id => card} map for the current user's sandbox cards"
    (met/with-gtaps! {:gtaps      {:venues
                                   {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}
                                    :query      (mt.tu/restricted-column-query (mt/id))}}
                      :attributes {:cat 50}}
      (let [result (col-filter/find-sandbox-source-cards
                    #{(mt/id :venues) (mt/id :checkins) (mt/id :categories)})]
        (testing "returns an entry for the sandboxed table"
          (is (contains? result (mt/id :venues))))
        (testing "does not return entries for non-sandboxed tables"
          (is (not (contains? result (mt/id :checkins))))
          (is (not (contains? result (mt/id :categories)))))
        (testing "the returned card carries the dataset_query needed to determine native vs MBQL"
          (is (some? (:dataset_query (get result (mt/id :venues))))))))))

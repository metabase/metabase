(ns metabase-enterprise.sandbox.api.table-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.api.table :as table]
   [metabase-enterprise.sandbox.test-util :as mt.tu]
   [metabase-enterprise.test :as met]
   [metabase.queries.models.card.metadata :as card.metadata]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(def ^:private all-columns
  #{"CATEGORY_ID" "ID" "LATITUDE" "LONGITUDE" "NAME" "PRICE"})

(defn- field-names [test-user]
  (let [{:keys [fields], :as response} (mt/user-http-request
                                        test-user :get 200
                                        (format "table/%d/query_metadata" (mt/id :venues)))]
    (if (seq fields)
      (set (map (comp u/upper-case-en :name) fields))
      response)))

(deftest query-metadata-test
  (testing "GET /api/table/:id/query_metadata"
    (met/with-gtaps! {:gtaps      {:venues
                                   {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}
                                    :query      (mt.tu/restricted-column-query (mt/id))}}
                      :attributes {:cat 50}}
      (testing "Users with restricted access to the columns of a table via an MBQL sandbox should only see columns
               included in the sandboxing question"
        (is (= #{"CATEGORY_ID" "ID" "NAME"}
               (field-names :rasta))))

      (testing "Users with full permissions should not be affected by this field filtering"
        (is (= all-columns
               (field-names :crowberto)))))))

(deftest native-query-metadata-test
  (testing "GET /api/table/:id/query_metadata"
    (met/with-gtaps! {:gtaps      {:venues
                                   {:query (mt/native-query {:query "SELECT CATEGORY_ID, ID, NAME from venues;"})
                                    :remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}}}
                      :attributes {:cat 50}}
      ;; Fetch the card and manually compute & save the metadata
      (let [card (t2/select-one :model/Card
                                {:select [:c.id :c.dataset_query :c.entity_id :c.card_schema]
                                 :from   [[:sandboxes :s]]
                                 :join   [[:permissions_group :pg] [:= :s.group_id :pg.id]
                                          [:report_card :c] [:= :c.id :s.card_id]]
                                 :where  [:= :pg.id (u/the-id &group)]})
            {:keys [metadata metadata-future]} (@#'card.metadata/maybe-async-recomputed-metadata (:dataset_query card))]
        (if metadata
          (t2/update! :model/Card :id (u/the-id card) {:result_metadata metadata})
          (card.metadata/save-metadata-async! metadata-future card)))

      (testing "Users with restricted access to the columns of a table via a native query sandbox should only see
               columns included in the sandboxing question"
        (is (= #{"CATEGORY_ID" "ID" "NAME"}
               (field-names :rasta))))

      (testing "Users with full permissions should not be affected by this field filtering"
        (is (= all-columns
               (field-names :crowberto)))))))

(deftest query-metadata-sandbox-without-restricted-columns-test
  (testing "GET /api/table/:id/query_metadata"
    (testing (str "If a GTAP has a question, but that question doesn't include a clause to restrict the columns that "
                  "are returned, all fields should be returned")
      (met/with-gtaps! {:gtaps      {:venues {:query      (mt/mbql-query venues)
                                              :remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}}}
                        :attributes {:cat 50}}
        (is (= all-columns
               (field-names :rasta)))))))

(deftest query-metadata-sandbox-without-query-test
  (testing "GET /api/table/:id/query_metadata"
    (testing "Make sure the endpoint doesn't blow up if the sandbox doesn't have a query associated with it"
      (met/with-gtaps! {:gtaps {:venues {}}}
        (is (= all-columns
               (field-names :rasta)))))))

(deftest batch-fetch-table-query-metadatas-test
  (let [upper-case-field-names
        (fn [tables]
          (into #{}
                (mapcat (fn [{table-name :name, fields :fields}]
                          (let [table-name (u/upper-case-en table-name)]
                            (map (fn [{field-name :name}]
                                   (str table-name "." (u/upper-case-en field-name)))
                                 fields))))
                tables))]
    (met/with-gtaps! {:gtaps      {:venues
                                   {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}
                                    :query      (mt.tu/restricted-column-query (mt/id))}}
                      :attributes {:cat 50}}
      (testing "Users with restricted access to the columns of a table should only see columns included in the GTAP question"
        (mt/with-current-user (mt/user->id :rasta)
          (is (= #{"VENUES.CATEGORY_ID" "VENUES.ID" "VENUES.NAME"}
                 (->> [(mt/id :venues) (mt/id :checkins)]
                      table/batch-fetch-table-query-metadatas
                      upper-case-field-names)))))

      (testing "Users with full permissions should not be affected by this field filtering"
        (mt/with-current-user (mt/user->id :crowberto)
          (is (= #{"CHECKINS.DATE" "CHECKINS.ID" "CHECKINS.USER_ID" "CHECKINS.VENUE_ID"
                   "VENUES.CATEGORY_ID" "VENUES.ID" "VENUES.LATITUDE" "VENUES.LONGITUDE" "VENUES.NAME" "VENUES.PRICE"}
                 (->> [(mt/id :venues) (mt/id :checkins)]
                      table/batch-fetch-table-query-metadatas
                      upper-case-field-names))))))))

(ns metabase-enterprise.sandbox.api.database-test
  "Tests that `GET /api/database/:id/metadata` and `?include=tables.fields` filter out columns the user's
  column-restricting sandbox hides."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.test-util :as mt.tu]
   [metabase-enterprise.test :as met]
   [metabase.queries.models.card.metadata :as card.metadata]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- venues-field-names [response]
  (let [venues (some #(when (= "VENUES" (u/upper-case-en (:name %))) %) (:tables response))]
    (set (map (comp u/upper-case-en :name) (:fields venues)))))

(defn- recompute-native-sandbox-metadata!
  "Native sandbox cards populate `result_metadata` asynchronously. Compute + save it synchronously so tests
  don't race the `metabase.queries.models.card.metadata/metadata-sync-wait-ms` window. Mirrors the dance in
  metabase-enterprise.sandbox.api.table-test/native-query-metadata-test."
  [group]
  (let [card (t2/select-one :model/Card
                            {:select [:c.id :c.dataset_query :c.entity_id :c.card_schema]
                             :from   [[:sandboxes :s]]
                             :join   [[:permissions_group :pg] [:= :s.group_id :pg.id]
                                      [:report_card :c] [:= :c.id :s.card_id]]
                             :where  [:= :pg.id (u/the-id group)]})
        {:keys [metadata metadata-future]} (@#'card.metadata/maybe-async-recomputed-metadata
                                            (:dataset_query card))]
    (if metadata
      (t2/update! :model/Card :id (u/the-id card) {:result_metadata metadata})
      (card.metadata/save-metadata-async! metadata-future card))))

(deftest database-metadata-respects-column-sandbox-test
  (testing "GET /api/database/:id/metadata excludes columns hidden by a column-restricting sandbox."
    (met/with-gtaps! {:gtaps      {:venues
                                   {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}
                                    :query      (mt.tu/restricted-column-query (mt/id))}}
                      :attributes {:cat 50}}
      (let [response (mt/user-http-request :rasta :get 200 (format "database/%d/metadata" (mt/id)))]
        (is (= #{"CATEGORY_ID" "ID" "NAME"}
               (venues-field-names response))
            "Sandboxed table reports only the columns exposed by the sandbox card")))))

(deftest database-metadata-admin-sees-all-test
  (testing "Admins are exempt from sandbox enforcement on /api/database/:id/metadata"
    (met/with-gtaps! {:gtaps      {:venues
                                   {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}
                                    :query      (mt.tu/restricted-column-query (mt/id))}}
                      :attributes {:cat 50}}
      (let [response (mt/user-http-request :crowberto :get 200 (format "database/%d/metadata" (mt/id)))]
        (is (= #{"CATEGORY_ID" "ID" "LATITUDE" "LONGITUDE" "NAME" "PRICE"}
               (venues-field-names response))
            "Admin sees every venues column regardless of the GTAP")))))

(deftest database-metadata-without-restricted-columns-test
  (testing "If a GTAP card exposes ALL columns of the sandboxed table, every column is returned (no over-filtering)."
    (met/with-gtaps! {:gtaps      {:venues {:query      {:database (mt/id)
                                                         :type     :query
                                                         :query    {:source-table (mt/id :venues)}}
                                            :remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}}}
                      :attributes {:cat 50}}
      (let [response (mt/user-http-request :rasta :get 200 (format "database/%d/metadata" (mt/id)))]
        (is (= #{"CATEGORY_ID" "ID" "LATITUDE" "LONGITUDE" "NAME" "PRICE"}
               (venues-field-names response))
            "All venues columns returned because the sandbox card SELECTs them all")))))

(deftest database-metadata-row-only-sandbox-test
  (testing "A row-level sandbox (no card_id, attribute-only) leaves the column list intact —
           row security doesn't hide columns, only filters rows at query time."
    (met/with-gtaps! {:gtaps {:venues {}}}
      (let [response (mt/user-http-request :rasta :get 200 (format "database/%d/metadata" (mt/id)))]
        (is (= #{"CATEGORY_ID" "ID" "LATITUDE" "LONGITUDE" "NAME" "PRICE"}
               (venues-field-names response))
            "Row-only sandbox exposes every column to the user (row restriction is enforced by the QP)")))))

(deftest database-include-tables-fields-respects-column-sandbox-test
  (testing "GET /api/database/:id?include=tables.fields excludes sandbox-hidden columns
           (this is a separate code path from /metadata in get-database-hydrate-include)"
    (met/with-gtaps! {:gtaps      {:venues
                                   {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}
                                    :query      (mt.tu/restricted-column-query (mt/id))}}
                      :attributes {:cat 50}}
      (let [response (mt/user-http-request :rasta :get 200
                                           (format "database/%d?include=tables.fields" (mt/id)))]
        (is (= #{"CATEGORY_ID" "ID" "NAME"}
               (venues-field-names response)))))))

(deftest database-metadata-native-sandbox-test
  (testing "Native (SQL) sandbox source cards filter by column name. Confirms parity with MBQL sandboxes."
    (met/with-gtaps! {:gtaps      {:venues
                                   {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}
                                    :query      (mt/native-query
                                                 {:query "SELECT CATEGORY_ID, ID, NAME from venues;"})}}
                      :attributes {:cat 50}}
      (recompute-native-sandbox-metadata! &group)
      (let [response (mt/user-http-request :rasta :get 200 (format "database/%d/metadata" (mt/id)))]
        (is (= #{"CATEGORY_ID" "ID" "NAME"}
               (venues-field-names response)))))))

(deftest database-include-tables-fields-native-sandbox-test
  (testing "GET /api/database/:id?include=tables.fields excludes sandbox-hidden columns for a native sandbox card
           (native-by-name filtering through the get-database-hydrate-include code path)"
    (met/with-gtaps! {:gtaps      {:venues
                                   {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}
                                    :query      (mt/native-query
                                                 {:query "SELECT CATEGORY_ID, ID, NAME from venues;"})}}
                      :attributes {:cat 50}}
      (recompute-native-sandbox-metadata! &group)
      (let [response (mt/user-http-request :rasta :get 200
                                           (format "database/%d?include=tables.fields" (mt/id)))]
        (is (= #{"CATEGORY_ID" "ID" "NAME"}
               (venues-field-names response)))))))

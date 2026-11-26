(ns metabase-enterprise.sandbox.api.table-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.sandbox.api.table-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.api.table :as table]
   [metabase-enterprise.sandbox.test-util :as mt.tu]
   [metabase-enterprise.test :as met]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.queries.models.card :as queries.card]
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

(deftest query-metadata-data-app-scope-test
  (testing "GET /api/table/:id/query_metadata carries the data-app scope even under sandboxing"
    ;; Regression: the EE sandbox *replaces* the OSS query_metadata endpoint when sandboxing is active,
    ;; so it must be tagged `{:scope api-scope/data-app}` too — otherwise a sandboxed data app gets
    ;; scope_not_permitted (403) on tables it can otherwise read.
    (met/with-gtaps! {:gtaps      {:venues {:query (mt.tu/restricted-column-query (mt/id))}}
                      :attributes {:cat 50}}
      (let [as-data-app {:request-options {:headers {"x-metabase-client" "data-app"}}}]
        (testing "a data-app-marked request passes scope enforcement (not scope_not_permitted)"
          (is (mt/user-http-request :rasta :get 200
                                    (format "table/%d/query_metadata" (mt/id :venues)) as-data-app)))))))

(deftest query-metadata-not-sandboxed-for-admins-test
  (testing "GET /api/table/:id/query_metadata"
    ;; checks that admins are exempt from normal perms checking.
    ;; the above test did not trigger this case because the admin is not *in* "All Users".
    (met/with-gtaps-for-all-users!
      {:gtaps      {:venues
                    {:remappings {}
                     :query      (mt.tu/restricted-column-query (mt/id))}}
       :attributes {:cat 50}}
      (is (= #{"ID" "CATEGORY_ID" "NAME"}
             (field-names :rasta)))
      (is (= all-columns
             (field-names :crowberto))))))

(deftest native-query-metadata-test
  (testing "GET /api/table/:id/query_metadata"
    (met/with-gtaps! {:gtaps      {:venues
                                   {:query (mt/native-query {:query "SELECT CATEGORY_ID, ID, NAME from venues;"})
                                    :remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}}}
                      :attributes {:cat 50}}
      ;; Fetch the card and manually compute & save the metadata
      (let [card (t2/select-one :model/Card
                                {:select [:c.id :c.dataset_query :c.entity_id :c.card_schema
                                          ;; required alongside :card_schema for the Card schema upgrade
                                          :c.type :c.database_id :c.result_metadata
                                          :c.dimensions :c.dimension_mappings]
                                 :from   [[:sandboxes :s]]
                                 :join   [[:permissions_group :pg] [:= :s.group_id :pg.id]
                                          [:report_card :c] [:= :c.id :s.card_id]]
                                 :where  [:= :pg.id (u/the-id &group)]})
            {:keys [metadata metadata-future]} (@#'card.metadata/maybe-async-recomputed-metadata
                                                (:dataset_query card)
                                                (:result_metadata card))]
        (mt/with-test-user :crowberto
          (if metadata
            (t2/update! :model/Card :id (u/the-id card) {:result_metadata metadata})
            (queries.card/save-metadata-async! [{:future metadata-future :card card}]))))
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
                 (->> (table/batch-fetch-table-query-metadatas [(mt/id :venues) (mt/id :checkins)] nil)
                      upper-case-field-names)))))
      (testing "Users with full permissions should not be affected by this field filtering"
        (mt/with-current-user (mt/user->id :crowberto)
          (is (= #{"CHECKINS.DATE" "CHECKINS.ID" "CHECKINS.USER_ID" "CHECKINS.VENUE_ID"
                   "VENUES.CATEGORY_ID" "VENUES.ID" "VENUES.LATITUDE" "VENUES.LONGITUDE" "VENUES.NAME" "VENUES.PRICE"}
                 (->> (table/batch-fetch-table-query-metadatas [(mt/id :venues) (mt/id :checkins)] nil)
                      upper-case-field-names))))))))

(defn- fields-query
  "A query of the test Table `table-kw` returning only its Fields `field-kws`."
  [table-kw field-kws]
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id table-kw)))
        (lib/with-fields (mapv #(lib.metadata/field mp (mt/id table-kw %)) field-kws)))))

(defn- field-shapes
  "`{TABLE-NAME #{[FIELD-NAME visibility-type]}}` of the query metadata of `tables`."
  [tables]
  (into {}
        (map (fn [{table-name :name, fields :fields}]
               [(u/upper-case-en table-name)
                (into #{} (map (fn [f] [(u/upper-case-en (:name f)) (name (:visibility_type f))])) fields)]))
        tables))

(deftest batch-fetch-table-query-metadatas-sandboxed-fields-test
  (testing "the batch query metadata lists the Tables and Fields a card sandbox, an attribute sandbox and no sandbox leave"
    (met/with-gtaps! {:gtaps      {:venues   {:query (fields-query :venues [:id :name :category_id])}
                                   :checkins {:remappings {:user [:variable [:field (mt/id :checkins :user_id) nil]]}}
                                   :users    {:query (fields-query :users [:id :name])}}
                      :attributes {:user 1}}
      (perms/set-database-permission! &group (mt/id) :perms/create-queries :no)
      (doseq [table-kw [:venues :checkins :categories]]
        (perms/set-table-permission! &group (mt/id table-kw) :perms/create-queries :query-builder))
      (mt/with-temp-vals-in-db :model/Field (mt/id :venues :name) {:visibility_type :hidden}
        (mt/with-temp-vals-in-db :model/Field (mt/id :venues :price) {:visibility_type :hidden}
          (let [table-ids (mapv mt/id [:venues :checkins :categories :users :people :orders :products :reviews])
                batch     (fn [user include-hidden?]
                            (mt/with-test-user user
                              (field-shapes (table/batch-fetch-table-query-metadatas
                                             table-ids {:include-hidden-fields? include-hidden?}))))
                checkins  #{["DATE" "normal"] ["ID" "normal"] ["USER_ID" "normal"] ["VENUE_ID" "normal"]}
                category  #{["ID" "normal"] ["NAME" "normal"]}]
            (testing "a sandboxed user"
              (is (= {"CATEGORIES" category
                      "CHECKINS"   checkins
                      "VENUES"     #{["CATEGORY_ID" "normal"] ["ID" "normal"]}}
                     (batch :rasta false)))
              (is (= {"CATEGORIES" category
                      "CHECKINS"   checkins
                      "VENUES"     #{["CATEGORY_ID" "normal"] ["ID" "normal"] ["NAME" "hidden"]}}
                     (batch :rasta true))))
            (testing "an admin"
              (doseq [include-hidden? [false true]
                      :let [tables (batch :crowberto include-hidden?)]]
                (is (= #{"CATEGORIES" "CHECKINS" "ORDERS" "PEOPLE" "PRODUCTS" "REVIEWS" "USERS" "VENUES"}
                       (set (keys tables))))
                (is (= #{["ID" "normal"] ["LAST_LOGIN" "normal"] ["NAME" "normal"]}
                       (tables "USERS")))
                (is (= (cond-> #{["CATEGORY_ID" "normal"] ["ID" "normal"] ["LATITUDE" "normal"] ["LONGITUDE" "normal"]}
                         include-hidden? (into #{["NAME" "hidden"] ["PRICE" "hidden"]}))
                       (tables "VENUES")))))
            (testing "a card-sandboxed Table without query permissions is in the single-table query metadata only"
              (is (= #{"ID" "NAME"}
                     (into #{} (map (comp u/upper-case-en :name))
                           (:fields (table/fetch-table-query-metadata (mt/id :users) {})))))
              (is (not (contains? (batch :rasta false) "USERS"))))))))))

(deftest batch-fetch-table-query-metadatas-statement-count-test
  (testing "the query metadata of many card-sandboxed Tables takes as many statements as that of few"
    (let [tables [:venues :checkins :categories :users :orders :people]]
      (met/with-gtaps! {:gtaps (into {} (map (fn [t] [t {:query (fields-query t [:id])}])) tables)}
        (let [count! (fn [n]
                       (let [table-ids (mapv mt/id (take n tables))]
                         (t2/with-call-count [call-count]
                           (is (= (set table-ids)
                                  (into #{} (map :id) (table/batch-fetch-table-query-metadatas table-ids nil))))
                           (call-count))))]
          (count! 6)
          (is (= (count! 2) (count! 6))))))))

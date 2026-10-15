(ns metabase-enterprise.sandbox.models.sandbox-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.sandbox.models.sandbox-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.models.sandbox :as sandboxes]
   [metabase-enterprise.sandbox.test-util :as sbx.tu]
   [metabase-enterprise.test :as met]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest disallow-changing-table-id-test
  (testing "You can't change the table_id of a sandbox after it has been created."
    (mt/with-temp [:model/Sandbox gtap {:table_id (mt/id :venues)
                                        :group_id (u/the-id (perms-group/all-users))}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"You cannot change the table ID of a sandbox once it has been created"
           (t2/update! :model/Sandbox (:id gtap) {:table_id (mt/id :checkins)}))))))

(deftest disallow-queries-that-add-columns-test
  (testing "Don't allow saving a Sandboxing query that contains columns not in the Table it replaces (#13715)"
    (doseq [[msg f] {"Create a new GTAP"
                     (fn [query]
                       (mt/with-temp [:model/Card                   card {:dataset_query   query
                                                                          :result_metadata (qp.preprocess/query->expected-cols query)}
                                      :model/Sandbox _    {:table_id (mt/id :venues)
                                                           :group_id (u/the-id (perms-group/all-users))
                                                           :card_id  (:id card)}]
                         :ok))

                     "Update an existing GTAP"
                     (fn [query]
                       (mt/with-temp [:model/Card                   card {:dataset_query   query
                                                                          :result_metadata (qp.preprocess/query->expected-cols query)}
                                      :model/Sandbox gtap {:table_id (mt/id :venues)
                                                           :group_id (u/the-id (perms-group/all-users))}]
                         (t2/update! :model/Sandbox (:id gtap) {:card_id (:id card)})
                         :ok))

                     "Update query for Card associated with an existing GTAP"
                     (fn [query]
                       (mt/with-temp [:model/Card                   card {:dataset_query   (mt/mbql-query venues)
                                                                          :result_metadata (qp.preprocess/query->expected-cols (mt/mbql-query venues))}
                                      :model/Sandbox _    {:table_id (mt/id :venues)
                                                           :group_id (u/the-id (perms-group/all-users))
                                                           :card_id  (:id card)}]
                         (t2/update! :model/Card (:id card) {:dataset_query query})
                         :ok))}]
      (testing (str "\n" msg "\n")
        (testing "sanity check"
          (is (= :ok
                 (f (mt/mbql-query venues)))))
        (testing "removing columns = ok"
          (is (= :ok
                 (f (mt/mbql-query venues {:fields [$id $name]})))))
        (testing "changing order of columns = ok"
          (is (= :ok
                 (f (mt/mbql-query venues
                      {:fields (for [id (shuffle (map :id (qp.preprocess/query->expected-cols (mt/mbql-query venues))))]
                                 [:field id nil])})))))))))

(deftest disallow-queries-that-change-types-test
  (testing "Don't allow saving a Sandboxing query that changes the type of a column vs. the type in the Table it replaces (#13715)"
    (mt/with-premium-features #{:sandboxes}
      (doseq [[msg f] {"Create a new GTAP"
                       (fn [metadata]
                         (mt/with-temp [:model/Card                   card {:dataset_query   (mt/mbql-query venues)
                                                                            :result_metadata metadata}
                                        :model/Sandbox _    {:table_id (mt/id :venues)
                                                             :group_id (u/the-id (perms-group/all-users))
                                                             :card_id  (:id card)}]
                           :ok))

                       "Update an existing GTAP"
                       (fn [metadata]
                         (mt/with-temp [:model/Card                   card {:dataset_query   (mt/mbql-query venues)
                                                                            :result_metadata metadata}
                                        :model/Sandbox gtap {:table_id (mt/id :venues)
                                                             :group_id (u/the-id (perms-group/all-users))}]
                           (t2/update! :model/Sandbox (:id gtap) {:card_id (:id card)})
                           :ok))

                       "Update query for Card associated with an existing GTAP"
                       (fn [metadata]
                         (mt/with-temp [:model/Card                   card {:dataset_query   (mt/mbql-query venues)
                                                                            :result_metadata (qp.preprocess/query->expected-cols (mt/mbql-query venues))}
                                        :model/Sandbox _    {:table_id (mt/id :venues)
                                                             :group_id (u/the-id (perms-group/all-users))
                                                             :card_id  (:id card)}]
                           (t2/update! :model/Card (:id card) {:result_metadata metadata})
                           :ok))}]
        (testing (str "\n" msg "\n")
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Sandbox Questions can't return columns that have different types than the Table they are sandboxing"
               (f (-> (vec (qp.preprocess/query->expected-cols (mt/mbql-query venues)))
                      (assoc-in [0 :base_type] :type/Text)))))
          (testing "type changes to a descendant type = ok"
            (is (= :ok
                   (f
                    (-> (vec (qp.preprocess/query->expected-cols (mt/mbql-query venues)))
                        (assoc-in [0 :base_type] :type/BigInteger)))))))))))

(deftest add-sandboxes-to-permissions-graph-test
  (mt/with-premium-features #{:sandboxes}
    (mt/with-full-data-perms-for-all-users!
      (testing "Sandbox definitions in the DB are automatically added to the permissions graph"
        (mt/with-temp [:model/Sandbox _gtap {:table_id (mt/id :venues)
                                             :group_id (u/the-id (perms-group/all-users))}]
          (is (partial=
               {(u/the-id (perms-group/all-users))
                {(mt/id)
                 {:view-data
                  {"PUBLIC"
                   {(mt/id :venues) :sandboxed}}}}}
               (sandboxes/add-sandboxes-to-permissions-graph {})))))
      (testing "When perms are set at the DB level, incorporating a sandbox breaks them out to table-level"
        (mt/with-temp [:model/Sandbox _gtap {:table_id (mt/id :venues)
                                             :group_id (u/the-id (perms-group/all-users))}]
          (is (partial=
               {(u/the-id (perms-group/all-users))
                {(mt/id)
                 {:view-data {"PUBLIC"
                              {(mt/id :venues) :sandboxed}}}}}
               (sandboxes/add-sandboxes-to-permissions-graph
                {(u/the-id (perms-group/all-users))
                 {(mt/id)
                  {:view-data :unrestricted}}})))))
      (testing "When perms are set at the schema level, incorporating a sandbox breaks them out to table-level"
        (mt/with-temp [:model/Sandbox _gtap {:table_id (mt/id :venues)
                                             :group_id (u/the-id (perms-group/all-users))}]
          (is (partial=
               {(u/the-id (perms-group/all-users))
                {(mt/id)
                 {:view-data
                  {"PUBLIC"
                   {(mt/id :venues) :sandboxed}}}}}
               (sandboxes/add-sandboxes-to-permissions-graph
                {(u/the-id (perms-group/all-users))
                 {(mt/id)
                  {:view-data :unrestricted}}}))))))))

(defn- venues-cols
  "The result metadata of a query on VENUES returning only the columns named by `col-names`."
  [& col-names]
  (filterv (comp (set col-names) :name) (qp.preprocess/query->expected-cols (mt/mbql-query venues))))

(defn- api-venues-col
  "The VENUES Field named `col-name`, as a client would send it in a Card's `:result_metadata`."
  [col-name]
  (let [{:keys [id base_type]} (t2/select-one [:model/Field :id :base_type] :table_id (mt/id :venues) :name col-name)]
    {:id             id
     :name           col-name
     :display_name   col-name
     :base_type      base_type
     :effective_type base_type
     :field_ref      [:field id nil]
     :table_id       (mt/id :venues)
     :source         :fields}))

(defn- sandboxed-venues-field-names []
  (mapv :name (:fields (mt/user-http-request :rasta :get 200 (str "table/" (mt/id :venues) "/query_metadata")))))

(deftest non-admin-cannot-widen-a-policy-card-column-allow-list-through-the-api-test
  (testing "a non-admin who curates the policy Card cannot widen the sandbox's column allow-list via :result_metadata"
    (mt/with-premium-features #{:sandboxes}
      (met/with-gtaps! {:gtaps {:venues {:query (sbx.tu/restricted-column-query (mt/id))}}}
        (perms/grant-collection-readwrite-permissions! (:id &group) collection/root-collection)
        (let [card-id  (t2/select-one-fn :card_id :model/Sandbox :table_id (mt/id :venues) :group_id (:id &group))
              original (t2/select-one-fn :result_metadata :model/Card :id card-id)
              latitude (api-venues-col "LATITUDE")]
          (is (= ["ID" "NAME" "CATEGORY_ID"] (sandboxed-venues-field-names)))
          (is (= "You do not have permissions to modify a question that is used for row and column level security."
                 (mt/user-http-request :rasta :put 403 (str "card/" card-id)
                                       {:result_metadata (conj (vec original) latitude)})))
          (is (= original (t2/select-one-fn :result_metadata :model/Card :id card-id)))
          (is (= ["ID" "NAME" "CATEGORY_ID"] (sandboxed-venues-field-names))))))))

(deftest non-admin-may-still-make-cosmetic-edits-to-a-policy-card-test
  (testing "a non-admin may rename a policy Card while sending back the result metadata it was served"
    (mt/with-premium-features #{:sandboxes}
      (met/with-gtaps! {:gtaps {:venues {:query (sbx.tu/restricted-column-query (mt/id))}}}
        (perms/grant-collection-readwrite-permissions! (:id &group) collection/root-collection)
        (let [card-id (t2/select-one-fn :card_id :model/Sandbox :table_id (mt/id :venues) :group_id (:id &group))
              served  (mt/user-http-request :rasta :get 200 (str "card/" card-id))]
          (is (= "Renamed"
                 (:name (mt/user-http-request :rasta :put 200 (str "card/" card-id)
                                              {:name            "Renamed"
                                               :result_metadata (:result_metadata served)}))))
          (is (= ["ID" "NAME" "CATEGORY_ID"] (sandboxed-venues-field-names))))))))

(deftest running-a-policy-card-with-drifted-metadata-as-a-non-admin-test
  (testing "a non-admin running a policy Card whose stored metadata has drifted gets results, but the QP's metadata
           write-back is refused so the Card's column allow-list is unchanged"
    (mt/with-premium-features #{:sandboxes}
      (met/with-gtaps! {:gtaps {:venues {:query (sbx.tu/restricted-column-query (mt/id))}}}
        (perms/grant-collection-read-permissions! (:id &group) collection/root-collection)
        (let [card-id      (t2/select-one-fn :card_id :model/Sandbox :table_id (mt/id :venues) :group_id (:id &group))
              stored-names #(mapv :name (t2/select-one-fn :result_metadata :model/Card :id card-id))
              run-card     (fn [user]
                             (mt/rows (mt/user-http-request user :post 202 (format "card/%d/query" card-id))))]
          (mt/with-test-user :crowberto
            (t2/update! :model/Card card-id {:result_metadata (venues-cols "ID" "NAME")}))
          (testing "the non-admin's query succeeds"
            (is (seq (run-card :rasta))))
          (testing "the drifted metadata is not overwritten by the non-admin's run"
            (is (= ["ID" "NAME"] (stored-names))))
          (testing "an admin's run does write it back"
            (is (seq (run-card :crowberto)))
            (is (= ["ID" "NAME" "CATEGORY_ID"] (stored-names)))))))))

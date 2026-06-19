(ns metabase-enterprise.sandbox.metabot-read-resource-test
  "Sandboxing must apply to `read_resource` MBR output. The tool extracts entities through the
  serdes pipeline, which does NOT apply data sandboxing, so the metabot/MCP layer redacts the
  sandbox-revealing pieces (a card's `:dataset_query` / `:result_metadata`, and individual
  Field bodies) for sandboxed users. These tests pin that behavior with a real GTAP and a
  NON-admin sandboxed user — an admin would bypass sandboxing and hide the bug.

  See ~/dv/mb/ai-reports/mbr-read-resource-sandbox-leak.md."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.test-util :as mt.tu]
   [metabase-enterprise.test :as met]
   [metabase.metabot.tools.resources :as read-resource]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- table-query
  "Legacy MBQL query selecting a table, as a raw map (avoids the deprecated `mt/mbql-query`).
   Only needs to name the source table — `lib/all-source-table-ids` resolves it for the
   sandbox check."
  [table]
  {:database (mt/id) :type :query :query {:source-table (mt/id table)}})

(deftest card-query-touches-sandboxed-table?-test
  (testing "true for a non-admin sandboxed user when the card queries the sandboxed table"
    (met/with-gtaps! {:gtaps      {:venues {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}
                                            :query      (mt.tu/restricted-column-query (mt/id))}}
                      :attributes {:cat 50}}
      (mt/with-temp [:model/Card sandboxed-card {:dataset_query (table-query :venues)}
                     :model/Card other-card     {:dataset_query (table-query :checkins)}]
        (is (true? (perms/card-query-touches-sandboxed-table? sandboxed-card))
            "card over the sandboxed table is flagged")
        (is (false? (perms/card-query-touches-sandboxed-table? other-card))
            "card over a non-sandboxed table is not flagged"))))
  (testing "false for an admin (superusers are never sandboxed)"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card card {:dataset_query (table-query :venues)}]
        (is (false? (perms/card-query-touches-sandboxed-table? card)))))))

(deftest read-resource-redacts-sandboxed-card-test
  (testing "a sandboxed user reading a card MBR does NOT get :dataset_query / :result_metadata"
    (met/with-gtaps! {:gtaps      {:venues {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}
                                            :query      (mt.tu/restricted-column-query (mt/id))}}
                      :attributes {:cat 50}}
      ;; A model card retains :result_metadata through serdes (questions skip it), so we can assert
      ;; both sandbox-revealing keys are withheld.
      (mt/with-temp [:model/Card {card-eid :entity_id} {:type            :model
                                                        :dataset_query   (table-query :venues)
                                                        :result_metadata [{:name "NAME"}]}]
        (let [result (read-resource/read-resource {:uris [(str "metabase://card/" card-eid)]})
              mbr    (get-in result [:resources 0 :content :structured-output :entity])]
          (is (some? mbr) "card is still readable (collection perms intact)")
          (is (not (contains? mbr :dataset_query))
              "dataset_query withheld — it names the sandboxed table/columns")
          (is (not (contains? mbr :result_metadata))
              "result_metadata withheld — it names the sandboxed columns")
          (is (contains? mbr :name) "identity fields still present"))))))

(deftest read-resource-keeps-card-for-non-sandboxed-user-test
  (testing "an admin reading the same card MBR DOES get the query + metadata"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {card-eid :entity_id} {:type            :model
                                                        :dataset_query   (table-query :venues)
                                                        :result_metadata [{:name "NAME"}]}]
        (let [result (read-resource/read-resource {:uris [(str "metabase://card/" card-eid)]})
              mbr    (get-in result [:resources 0 :content :structured-output :entity])]
          (is (contains? mbr :dataset_query) "non-sandboxed user keeps the query")
          (is (contains? mbr :result_metadata) "non-sandboxed user keeps the metadata"))))))

(deftest read-resource-field-blocked-for-sandboxed-user-test
  (testing "a column-sandboxed user cannot read ANY Field MBR of the sandboxed table.

           Field can-read? delegates to the parent Table, which requires unrestricted view-data —
           a column-sandboxed user lacks that, so extract-as-user's read-check blocks the Field
           MBR before any field metadata is emitted. This is why Field MBR needs no extra sandbox
           filter (unlike Card, whose can-read? is collection-perm based and bypasses data perms)."
    (met/with-gtaps! {:gtaps      {:venues {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}
                                            :query      (mt.tu/restricted-column-query (mt/id))}}
                      :attributes {:cat 50}}
      (let [db-name     (t2/select-one-fn :name :model/Database (mt/id))
            venues-name (t2/select-one-fn :name :model/Table (mt/id :venues))
            schema      (t2/select-one-fn :schema :model/Table (mt/id :venues))
            field-uri   (fn [fname] (str "metabase://database/" db-name
                                         "/schema/" (or schema "") "/table/" venues-name
                                         "/field/" fname))
            read-field  (fn [fname]
                          (read-resource/read-resource {:uris [(field-uri fname)]}))
            no-entity?  (fn [res] (nil? (get-in res [:resources 0 :content :structured-output :entity])))]
        (testing "even a column kept by the sandbox (NAME) is not emitted as a Field MBR"
          (is (no-entity? (read-field "NAME"))))
        (testing "a column hidden by the sandbox (PRICE) is not emitted either"
          (is (no-entity? (read-field "PRICE"))))))))

(ns metabase-enterprise.sandbox.metabot-read-resource-test
  "Sandboxing must apply to `read_resource` MBR output. The tool extracts entities through the
  serdes pipeline, which does NOT apply data sandboxing, so the metabot/MCP layer redacts the
  sandbox-revealing pieces (a card's `:dataset_query` / `:result_metadata`, and individual
  Field bodies) for sandboxed users. These tests pin that behavior with a real GTAP and a
  NON-admin sandboxed user — an admin would bypass sandboxing and hide the bug."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.test-util :as mt.tu]
   [metabase-enterprise.test :as met]
   [metabase.api.common :as api]
   [metabase.metabot.tools.resources :as read-resource]
   [metabase.metabot.tools.shared.mbr :as mbr]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(defn- table-query
  "Legacy MBQL query selecting a table, as a raw map (avoids the deprecated `mt/mbql-query`).
   Only needs to name the source table — `lib/all-source-table-ids` resolves it for the
   sandbox check."
  [table]
  {:database (mt/id) :type :query :query {:source-table (mt/id table)}})

(deftest card-query-touches-sandboxed-table?-test
  (testing "true for a non-admin sandboxed user when the card queries the sandboxed table"
    (met/with-gtaps! {:gtaps      {:venues {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]},
                                            :query      (mt.tu/restricted-column-query (mt/id))}},
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
        (is (false? (perms/card-query-touches-sandboxed-table? card))))))
  (testing "native query over the sandboxed db is flagged via the db-level fallback (all-source-table-ids sees no tables)"
    ;; F1: native SQL has no :source-table, so the predicate falls back to sandboxed-user-for-db?.
    (met/with-gtaps! {:gtaps      {:venues {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]},
                                            :query      (mt.tu/restricted-column-query (mt/id))}},
                      :attributes {:cat 50}}
      (mt/with-temp [:model/Card native-card {:dataset_query {:database (mt/id)
                                                              :type     :native
                                                              :native   {:query "SELECT * FROM venues"}}}]
        (is (true? (perms/card-query-touches-sandboxed-table? native-card))
            "native card over the sandboxed database is flagged — its raw SQL could read the sandboxed table"))))
  (testing "throws 403 (fails closed) when no current user is bound, rather than returning false"
    ;; F2: matches sandboxed-user-for-db? / sandboxed-user?. A lost binding must not silently disable redaction.
    (met/with-gtaps! {:gtaps      {:venues {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]},
                                            :query      (mt.tu/restricted-column-query (mt/id))}},
                      :attributes {:cat 50}}
      (mt/with-temp [:model/Card card {:dataset_query (table-query :venues)}]
        (binding [api/*current-user-id*   nil
                  api/*is-superuser?*     false]
          (is (thrown? clojure.lang.ExceptionInfo
                       (perms/card-query-touches-sandboxed-table? card))))))))

(deftest read-resource-redacts-sandboxed-card-test
  (testing "a sandboxed user reading a card MBR does NOT get :dataset_query / :result_metadata"
    (met/with-gtaps! {:gtaps      {:venues {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]},
                                            :query      (mt.tu/restricted-column-query (mt/id))}},
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

(defn- leaky-viz-settings
  "Visualization settings that name a (sandbox-hidden) field: a `column_settings` key
   `[\"ref\" [\"field\" id]]`, which serdes exports with the portable `[db schema table field]` NAME."
  [field-id]
  {:column_settings {(json/encode ["ref" ["field" field-id nil]]) {:show_mini_bar true}}})

(defn- leaky-parameter-mappings
  "A `parameter_mappings` vector whose target is a field ref — serdes exports it by NAME."
  [field-id]
  [{:parameter_id "p1"
    :card_id      nil
    :target       ["dimension" ["field" field-id nil]]}])

(defn- leaky-parameters
  [field-id]
  [{:id     "p1"
    :type   "category"
    :target ["dimension" ["field" field-id nil]]
    :name   "Price"
    :slug   "price"}])

(defn- mbr-json-string
  "Render the whole MBR result to a JSON string — the rot-proof leak guard. If any key re-introduces
   the sandboxed table/column name, it shows up here regardless of which key carried it."
  [result]
  (json/encode result))

(deftest read-resource-card-viz-settings-no-leak-test
  (testing "a sandboxed user reading a Card MBR gets NO field-ref-bearing keys, and the rendered JSON
           string contains neither the sandboxed table name nor the hidden column name"
    (met/with-gtaps! {:gtaps      {:venues {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]},
                                            :query      (mt.tu/restricted-column-query (mt/id))}},
                      :attributes {:cat 50}}
      (let [price-field-id (mt/id :venues :price)   ; PRICE is hidden by restricted-column-query
            table-name     (t2/select-one-fn :name :model/Table (mt/id :venues))
            price-name     (t2/select-one-fn :name :model/Field price-field-id)]
        (mt/with-temp [:model/Card {card-eid :entity_id}
                       {:type                   :model
                        :dataset_query          (table-query :venues)
                        :result_metadata        [{:name "NAME"}]
                        :visualization_settings (leaky-viz-settings price-field-id)
                        :parameters             (leaky-parameters price-field-id)
                        :parameter_mappings     (leaky-parameter-mappings price-field-id)}]
          (let [result   (read-resource/read-resource {:uris [(str "metabase://card/" card-eid)]})
                mbr      (get-in result [:resources 0 :content :structured-output :entity])
                json-str (mbr-json-string result)]
            (is (some? mbr) "card is still readable (collection perms intact)")
            (testing "all field-ref-bearing keys are absent (allowlist default-deny)"
              (doseq [k [:dataset_query :result_metadata :visualization_settings
                         :parameters :parameter_mappings]]
                (is (not (contains? mbr k))
                    (str k " must be withheld from a sandboxed user"))))
            (testing "identity/display keys survive"
              (is (contains? mbr :name))
              (is (contains? mbr :entity_id)))
            (testing "the JSON string leaks neither the table nor the hidden column name"
              (is (not (str/includes? json-str table-name))
                  (str "sandboxed table name " table-name " leaked into MBR JSON"))
              (is (not (str/includes? json-str price-name))
                  (str "hidden column name " price-name " leaked into MBR JSON")))))))))

(deftest read-resource-dashboard-no-leak-test
  (testing "a sandboxed user reading a Dashboard MBR gets its nested dashcards + parameters scrubbed;
           the rendered JSON leaks neither the sandboxed table nor the hidden column name.
           (Before the D2 fix Dashboard was entirely unredacted, so this FAILED.)"
    (met/with-gtaps! {:gtaps      {:venues {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]},
                                            :query      (mt.tu/restricted-column-query (mt/id))}},
                      :attributes {:cat 50}}
      (let [price-field-id (mt/id :venues :price)
            table-name     (t2/select-one-fn :name :model/Table (mt/id :venues))
            price-name     (t2/select-one-fn :name :model/Field price-field-id)]
        (mt/with-temp [:model/Card {card-id :id}
                       {:type                   :model
                        :dataset_query          (table-query :venues)
                        :visualization_settings (leaky-viz-settings price-field-id)}
                       :model/Dashboard {dash-eid :entity_id dash-id :id}
                       {:parameters (leaky-parameters price-field-id)}
                       :model/DashboardCard _
                       {:dashboard_id           dash-id
                        :card_id                card-id
                        :visualization_settings (leaky-viz-settings price-field-id)
                        :parameter_mappings     (leaky-parameter-mappings price-field-id)}]
          (let [result   (read-resource/read-resource {:uris [(str "metabase://dashboard/" dash-eid)]})
                mbr      (get-in result [:resources 0 :content :structured-output :entity])
                json-str (mbr-json-string result)]
            (is (some? mbr) "dashboard is still readable (collection perms intact)")
            (is (not (contains? mbr :parameters))
                "dashboard's own :parameters withheld")
            (testing "nested dashcards are scrubbed to safe keys only"
              (doseq [dc (:dashcards mbr)]
                (is (not (contains? dc :visualization_settings)))
                (is (not (contains? dc :parameter_mappings)))))
            (testing "the JSON string leaks neither the table nor the hidden column name"
              (is (not (str/includes? json-str table-name))
                  (str "sandboxed table name " table-name " leaked into Dashboard MBR JSON"))
              (is (not (str/includes? json-str price-name))
                  (str "hidden column name " price-name " leaked into Dashboard MBR JSON")))))))))

(deftest read-resource-dashboard-kept-for-non-sandboxed-user-test
  (testing "an admin reading the same dashboard KEEPS parameters + dashcard viz settings (no over-redaction)"
    (mt/with-current-user (mt/user->id :crowberto)
      (let [price-field-id (mt/id :venues :price)]
        (mt/with-temp [:model/Card {card-id :id}
                       {:type                   :model
                        :dataset_query          (table-query :venues)
                        :visualization_settings (leaky-viz-settings price-field-id)}
                       :model/Dashboard {dash-eid :entity_id dash-id :id}
                       {:parameters (leaky-parameters price-field-id)}
                       :model/DashboardCard _
                       {:dashboard_id           dash-id
                        :card_id                card-id
                        :visualization_settings (leaky-viz-settings price-field-id)
                        :parameter_mappings     (leaky-parameter-mappings price-field-id)}]
          (let [result (read-resource/read-resource {:uris [(str "metabase://dashboard/" dash-eid)]})
                mbr    (get-in result [:resources 0 :content :structured-output :entity])]
            (is (contains? mbr :parameters) "non-sandboxed user keeps dashboard parameters")
            (is (some #(contains? % :visualization_settings) (:dashcards mbr))
                "non-sandboxed user keeps dashcard visualization_settings")))))))

(deftest read-resource-dashboard-sandbox-gate-fails-closed-test
  (testing "the Dashboard sandbox gate (sandboxed-user?) throws 403 when no current user is bound,
           rather than silently returning an unredacted dashboard (matches the Card F2 test)"
    (met/with-gtaps! {:gtaps      {:venues {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]},
                                            :query      (mt.tu/restricted-column-query (mt/id))}},
                      :attributes {:cat 50}}
      (mt/with-temp [:model/Dashboard dash {}]
        (binding [api/*current-user-id* nil
                  api/*is-superuser?*   false]
          (is (thrown? clojure.lang.ExceptionInfo
                       (mbr/redact-sandboxed "Dashboard" dash {:parameters []}))))))))

(deftest read-resource-redacts-sandboxed-card-in-list-test
  (testing "redaction also fires on the LIST path (extract-readable), not just the single-entity path —
           a sandboxed user listing a database's models gets each card's query/metadata withheld"
    ;; Realistic case: a sandboxed user browses database/{id}/models. The list goes through
    ;; extract-readable's batched hydrate + redact, a different code path than the single fetch-card.
    (met/with-gtaps! {:gtaps      {:venues {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]},
                                            :query      (mt.tu/restricted-column-query (mt/id))}},
                      :attributes {:cat 50}}
      (mt/with-temp [:model/Card _ {:type            :model
                                    :name            "Venues Model"
                                    :database_id     (mt/id)
                                    :dataset_query   (table-query :venues)
                                    :result_metadata [{:name "NAME"}]}]
        (let [result (read-resource/read-resource {:uris [(str "metabase://database/" (mt/id) "/models")]})
              items  (get-in result [:resources 0 :content :structured-output :items])
              model  (u/seek #(= "Venues Model" (:name %)) items)]
          (is (some? model) "the model is listed (collection perms intact)")
          (is (not (contains? model :dataset_query))
              "dataset_query withheld in the list item too")
          (is (not (contains? model :result_metadata))
              "result_metadata withheld in the list item too"))))))

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
    (met/with-gtaps! {:gtaps      {:venues {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]},
                                            :query      (mt.tu/restricted-column-query (mt/id))}},
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

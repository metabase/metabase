(ns metabase.metabot.summary-formula-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.usage :as metabot.usage]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private endpoint "metabot/summary-formula")

(defn- orders-query
  []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :orders)))))

(defn- request-body
  ([]
   (request-body {}))
  ([overrides]
   (merge {:mode          "aggregation"
           :prompt        "average total"
           :dataset_query (lib/prepare-for-serialization (orders-query))}
          overrides)))

(defn- do-with-llm
  "Call `(f calls)` with the LLM stubbed to `response`, or to throw it when it's an exception. `calls` is an atom holding
  the messages of each LLM call."
  [response f]
  (let [calls (atom [])]
    (mt/with-dynamic-fn-redefs [metabot.settings/llm-metabot-configured? (constantly true)
                                metabot.self/call-llm-structured         (fn [_model messages & _]
                                                                           (swap! calls conj messages)
                                                                           (if (instance? Exception response)
                                                                             (throw response)
                                                                             response))]
      (f calls))))

(defn- llm-prompts
  "The system and user prompts of the only LLM call in `calls`."
  [calls]
  (is (= 1 (count @calls)))
  (zipmap [:system :user] (map :content (first @calls))))

(defn- sent-to-llm
  "The user prompt the LLM gets for a request with `overrides`, made as `user`."
  ([overrides]
   (sent-to-llm :rasta overrides))
  ([user overrides]
   (do-with-llm {:expression "Count" :name "Count"}
                (fn [calls]
                  (mt/user-http-request user :post 200 endpoint (request-body overrides))
                  (:user (llm-prompts calls))))))

(defn- column-listed?
  [user-prompt column-name]
  (str/includes? user-prompt (str "[" column-name "]")))

(defn- check-refused
  "Check that a request for `query`, made as `user`, gets a 403 without reaching the LLM."
  ([query]
   (check-refused :rasta query))
  ([user query]
   (do-with-llm
    {:expression "Count" :name "Count"}
    (fn [calls]
      (is (= {:message "You don't have permission to run this query." :error-code "query_permission_denied"}
             (mt/user-http-request user :post 403 endpoint
                                   (request-body {:dataset_query (lib/prepare-for-serialization query)}))))
      (is (empty? @calls))))))

(defn- check-no-match
  "Check that a request for `query`, made as Rasta, finds nothing to offer without reaching the LLM."
  [query]
  (do-with-llm
   {:expression "Count" :name "Count"}
   (fn [calls]
     (is (= {:expression nil :name nil :error "Nothing in this data matches that."}
            (mt/user-http-request :rasta :post 200 endpoint
                                  (request-body {:dataset_query (lib/prepare-for-serialization query)}))))
     (is (empty? @calls)))))

(defn- grant-query-access!
  "Let all users query the tables named by `table-keys`, and nothing else."
  [& table-keys]
  (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
  (doseq [table-key table-keys]
    (perms/set-table-permission! (perms-group/all-users) (mt/id table-key) :perms/create-queries :query-builder)))

(defn- card-query
  [card-id]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/card mp card-id))))

(defn- field
  [table-key field-key]
  (lib.metadata/field (mt/metadata-provider) (mt/id table-key field-key)))

(defn- join-table
  "`query` joined to the table named by `table-key`, on `lhs-field` of Orders and that table's ID."
  [query table-key lhs-field]
  (let [mp (mt/metadata-provider)]
    (lib/join query (lib/join-clause (lib.metadata/table mp (mt/id table-key))
                                     [(lib/= (field :orders lhs-field) (field table-key :id))]))))

;;; ------------------------------------------------- Success ---------------------------------------------------

(deftest summary-formula-aggregation-mode-test
  (testing "POST /api/metabot/summary-formula drafts an aggregation from the query's columns"
    (do-with-llm
     {:expression "Average([Total])" :name "Average total"}
     (fn [calls]
       (is (= {:expression "Average([Total])" :name "Average total" :error nil}
              (mt/user-http-request :rasta :post 200 endpoint (request-body))))
       (let [{:keys [system user]} (llm-prompts calls)]
         (is (str/starts-with? system "You write one Metabase custom aggregation"))
         (is (str/includes? user "Table: Orders\n"))
         (is (str/includes? user "[Total] (number)\n"))
         (is (str/includes? user "[Created At] (date)\n"))
         (is (str/includes? user "[User → Name] (text)\n"))
         (is (str/includes? user "<request>\naverage total\n</request>")))))))

(deftest summary-formula-expression-mode-test
  (testing "POST /api/metabot/summary-formula drafts a custom column in expression mode"
    (do-with-llm
     {:expression "year([Created At])" :name "Year created"}
     (fn [calls]
       (is (= {:expression "year([Created At])" :name "Year created" :error nil}
              (mt/user-http-request :rasta :post 200 endpoint (request-body {:mode "expression"}))))
       (let [{:keys [system user]} (llm-prompts calls)]
         (is (str/starts-with? system "You write one Metabase custom column expression"))
         (is (str/includes? user "[Created At] (date)\n")))))))

(deftest summary-formula-cleans-llm-output-test
  (testing "POST /api/metabot/summary-formula cleans the expression and name the LLM returns"
    (do-with-llm
     {:expression " = `Sum([Total])` " :name "  \"Total   revenue.\" "}
     (fn [_calls]
       (is (= {:expression "Sum([Total])" :name "Total revenue" :error nil}
              (mt/user-http-request :rasta :post 200 endpoint (request-body))))))))

(deftest summary-formula-no-match-test
  (testing "POST /api/metabot/summary-formula returns a 200 with an :error when nothing in the data matches"
    (do-with-llm
     {:expression "" :name "Whatever"}
     (fn [_calls]
       (is (= {:expression nil :name nil :error "Nothing in this data matches that."}
              (mt/user-http-request :rasta :post 200 endpoint (request-body))))))))

;;; -------------------------------------------------- Errors ---------------------------------------------------

(deftest summary-formula-requires-authentication-test
  (testing "POST /api/metabot/summary-formula requires authentication"
    (is (= "Unauthenticated"
           (mt/client :post 401 endpoint (request-body))))))

(deftest summary-formula-metabot-disabled-test
  (testing "POST /api/metabot/summary-formula returns a 403 when Metabot is turned off"
    (mt/with-temporary-setting-values [metabot-enabled? false]
      (do-with-llm
       {:expression "Count" :name "Count"}
       (fn [calls]
         (is (= {:message "AI features are turned off." :error-code "metabot_disabled"}
                (mt/user-http-request :rasta :post 403 endpoint (request-body))))
         (is (empty? @calls)))))))

(deftest summary-formula-no-llm-test
  (testing "POST /api/metabot/summary-formula returns a 503 when no LLM is configured"
    (mt/with-dynamic-fn-redefs [metabot.settings/llm-metabot-configured? (constantly false)]
      (is (= {:message "No AI provider is connected." :error-code "ai_provider_not_configured"}
             (mt/user-http-request :rasta :post 503 endpoint (request-body)))))))

(deftest summary-formula-usage-limit-test
  (testing "POST /api/metabot/summary-formula returns a 429 when the usage limit is reached before the call"
    (do-with-llm
     {:expression "Count" :name "Count"}
     (fn [calls]
       (mt/with-dynamic-fn-redefs [metabot.usage/check-usage-limits! (constantly "Over the limit")]
         (is (= {:message "The AI usage limit has been reached." :error-code "ai_usage_limit_reached"}
                (mt/user-http-request :rasta :post 429 endpoint (request-body))))
         (is (empty? @calls)))))))

(deftest summary-formula-usage-limit-during-call-test
  (testing "POST /api/metabot/summary-formula returns a 429 when the LLM call hits the usage limit"
    (do-with-llm
     (ex-info "Over the limit" {:type :metabot/usage-limit-reached})
     (fn [_calls]
       (is (= {:message "The AI usage limit has been reached." :error-code "ai_usage_limit_reached"}
              (mt/user-http-request :rasta :post 429 endpoint (request-body))))))))

(deftest summary-formula-metabot-permission-test
  (testing "POST /api/metabot/summary-formula returns a 403 without the metabot permission"
    (do-with-llm
     {:expression "Count" :name "Count"}
     (fn [calls]
       (mt/with-dynamic-fn-redefs [scope/resolve-user-permissions (constantly {:permission/metabot     :yes
                                                                               :permission/metabot-nlq :no})]
         (is (= {:message "You don't have access to AI features." :error-code "metabot_permission_denied"}
                (mt/user-http-request :rasta :post 403 endpoint (request-body))))
         (is (empty? @calls)))))))

(deftest summary-formula-metabot-permission-during-call-test
  (testing "POST /api/metabot/summary-formula returns a 403 when the LLM call is denied"
    (do-with-llm
     (ex-info "Permission denied" {:type :metabot/permission-denied})
     (fn [_calls]
       (is (= {:message "You don't have access to AI features." :error-code "metabot_permission_denied"}
              (mt/user-http-request :rasta :post 403 endpoint (request-body))))))))

(deftest summary-formula-llm-failure-test
  (testing "POST /api/metabot/summary-formula returns a 502 without provider details when the LLM call fails"
    (do-with-llm
     (ex-info "secret provider detail" {:api-key "secret"})
     (fn [_calls]
       (is (= {:message "Couldn't generate a formula." :error-code "ai_provider_error"}
              (mt/user-http-request :rasta :post 502 endpoint (request-body))))))))

(deftest summary-formula-provider-error-test
  (testing "POST /api/metabot/summary-formula uses the provider-error message and code for a 502"
    (do-with-llm
     (ex-info "Rate limited" {:api-error true})
     (fn [_calls]
       (mt/with-dynamic-fn-redefs [metabot.self/provider-error (constantly {:message    "Try again in a moment."
                                                                            :error-code "ai_provider_rate_limit"})]
         (is (= {:message "Try again in a moment." :error-code "ai_provider_rate_limit"}
                (mt/user-http-request :rasta :post 502 endpoint (request-body)))))))))

;;; ------------------------------------------------- Validation ------------------------------------------------

(deftest summary-formula-validation-test
  (testing "POST /api/metabot/summary-formula rejects an invalid body"
    (do-with-llm
     {:expression "Count" :name "Count"}
     (fn [calls]
       (doseq [[description body] {"missing mode"   (dissoc (request-body) :mode)
                                   "missing prompt" (dissoc (request-body) :prompt)
                                   "missing query"  (dissoc (request-body) :dataset_query)
                                   "blank prompt"   (request-body {:prompt "   "})
                                   "invalid mode"   (request-body {:mode "filter"})
                                   "legacy query"   (request-body {:dataset_query {:database (mt/id)
                                                                                   :type     :query
                                                                                   :query    {:source-table (mt/id :orders)}}})}]
         (testing description
           (is (=? {:errors some?}
                   (mt/user-http-request :rasta :post 400 endpoint body)))))
       (is (empty? @calls))))))

(deftest summary-formula-native-query-test
  (testing "POST /api/metabot/summary-formula returns a 400 for a query with a native first stage"
    (let [query (lib/native-query (mt/metadata-provider) "SELECT 1")]
      (doseq [[description query] {"with only a native stage" query
                                   "with an appended stage"   (lib/append-stage query)}]
        (testing description
          (do-with-llm
           {:expression "Count" :name "Count"}
           (fn [calls]
             (is (= {:message    "Formulas can't be suggested for a native query."
                     :error-code "native_query_not_supported"}
                    (mt/user-http-request :crowberto :post 400 endpoint
                                          (request-body {:dataset_query (lib/prepare-for-serialization query)}))))
             (is (empty? @calls)))))))))

(deftest summary-formula-native-stage-permission-test
  (testing "POST /api/metabot/summary-formula returns a 403 for a native first stage the user can't run"
    (mt/with-no-data-perms-for-all-users!
      (grant-query-access! :orders)
      (check-refused (lib/append-stage (lib/native-query (mt/metadata-provider) "SELECT 1"))))))

(deftest summary-formula-virtual-database-test
  (testing "POST /api/metabot/summary-formula returns a 403 for the saved questions virtual database"
    (do-with-llm
     {:expression "Count" :name "Count"}
     (fn [calls]
       (let [query (assoc (lib/prepare-for-serialization (orders-query)) :database -1337)]
         (is (= {:message    "You don't have permission to run this query."
                 :error-code "query_permission_denied"}
                (mt/user-http-request :rasta :post 403 endpoint (request-body {:dataset_query query})))))
       (is (empty? @calls))))))

(deftest summary-formula-mismatched-database-test
  (testing "POST /api/metabot/summary-formula returns a 403 for a table outside the query's database"
    (mt/with-temp [:model/Database {database-id :id} {}]
      (do-with-llm
       {:expression "Count" :name "Count"}
       (fn [calls]
         (let [query (assoc (lib/prepare-for-serialization (orders-query)) :database database-id)]
           (is (= {:message    "You don't have permission to run this query."
                   :error-code "query_permission_denied"}
                  (mt/user-http-request :crowberto :post 403 endpoint (request-body {:dataset_query query})))))
         (is (empty? @calls)))))))

(deftest summary-formula-unknown-database-test
  (testing "POST /api/metabot/summary-formula doesn't reach the LLM for a database that doesn't exist"
    (do-with-llm
     {:expression "Count" :name "Count"}
     (fn [calls]
       (let [query (assoc (lib/prepare-for-serialization (orders-query)) :database Integer/MAX_VALUE)]
         (is (= {:message    "You don't have permission to run this query."
                 :error-code "query_permission_denied"}
                (mt/user-http-request :rasta :post 403 endpoint (request-body {:dataset_query query})))))
       (is (empty? @calls))))))

;;; ------------------------------------------------- Query shape -----------------------------------------------

(deftest summary-formula-appended-stage-test
  (testing "POST /api/metabot/summary-formula uses the columns of an appended empty last stage"
    (let [query (as-> (orders-query) $
                  (lib/aggregate $ (lib/count))
                  (lib/breakout $ (lib.metadata/field (mt/metadata-provider) (mt/id :orders :product_id)))
                  (lib/append-stage $))
          user  (sent-to-llm {:dataset_query (lib/prepare-for-serialization query)})]
      (is (column-listed? user "Count"))
      (is (column-listed? user "Product ID"))
      (is (not (column-listed? user "Total"))))))

(deftest summary-formula-native-model-test
  (testing "POST /api/metabot/summary-formula lists the columns of a query on a native model"
    (let [mp (mt/metadata-provider)]
      (mt/with-temp [:model/Card {model-id :id} {:type            :model
                                                 :dataset_query   (lib/native-query mp "SELECT ID, TOTAL FROM ORDERS")
                                                 :result_metadata [{:name         "ID"
                                                                    :display_name "ID"
                                                                    :base_type    :type/Integer}
                                                                   {:name         "TOTAL"
                                                                    :display_name "Total"
                                                                    :base_type    :type/Float}]}]
        (let [query (lib/query mp (lib.metadata/card mp model-id))
              user  (sent-to-llm {:dataset_query (lib/prepare-for-serialization query)})]
          (is (str/includes? user "[ID] (number)\n"))
          (is (str/includes? user "[Total] (number)\n")))))))

(deftest summary-formula-no-columns-test
  (testing "POST /api/metabot/summary-formula doesn't call the LLM when the query has no columns or metrics"
    (let [mp (mt/metadata-provider)]
      (mt/with-temp [:model/Card {card-id :id} {:dataset_query (lib/native-query mp "SELECT 1")}]
        (let [query (lib/query mp (lib.metadata/card mp card-id))]
          (do-with-llm
           {:expression "Count" :name "Count"}
           (fn [calls]
             (is (= {:expression nil :name nil :error "Nothing in this data matches that."}
                    (mt/user-http-request :rasta :post 200 endpoint
                                          (request-body {:dataset_query (lib/prepare-for-serialization query)}))))
             (is (empty? @calls)))))))))

;;; ------------------------------------------------- Permissions -----------------------------------------------

(deftest summary-formula-query-permission-test
  (testing "POST /api/metabot/summary-formula returns a 403 when the user can't run the query"
    (mt/with-no-data-perms-for-all-users!
      (do-with-llm
       {:expression "Count" :name "Count"}
       (fn [calls]
         (is (= {:message "You don't have permission to run this query." :error-code "query_permission_denied"}
                (mt/user-http-request :rasta :post 403 endpoint (request-body))))
         (is (empty? @calls)))))))

(deftest summary-formula-inaccessible-implicit-join-test
  (testing "POST /api/metabot/summary-formula doesn't send columns of an implicitly joined table the user can't query"
    (mt/with-no-data-perms-for-all-users!
      (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
      (perms/set-table-permission! (perms-group/all-users) (mt/id :orders) :perms/create-queries :query-builder)
      (let [user (sent-to-llm {})]
        (is (column-listed? user "Total"))
        (is (not (column-listed? user "User → Name")))
        (is (not (column-listed? user "Product → Title")))))))

(deftest summary-formula-hidden-column-test
  (testing "POST /api/metabot/summary-formula doesn't send hidden columns"
    (mt/with-temp-vals-in-db :model/Field (mt/id :orders :discount) {:visibility_type "hidden"}
      (let [user (sent-to-llm {})]
        (is (column-listed? user "Total"))
        (is (not (column-listed? user "Discount")))))))

(deftest summary-formula-hidden-column-behind-model-test
  (testing "POST /api/metabot/summary-formula doesn't send a hidden column reached through a model"
    (mt/with-temp-vals-in-db :model/Field (mt/id :orders :discount) {:visibility_type "hidden"}
      (mt/with-temp [:model/Card {model-id :id} {:type          :model
                                                 :dataset_query (orders-query)}]
        (let [mp    (mt/metadata-provider)
              query (lib/query mp (lib.metadata/card mp model-id))
              user  (sent-to-llm {:dataset_query (lib/prepare-for-serialization query)})]
          (is (column-listed? user "Total"))
          (is (not (column-listed? user "Discount"))))))))

(deftest summary-formula-sensitive-column-test
  (testing "POST /api/metabot/summary-formula doesn't send sensitive columns"
    (mt/with-temp-vals-in-db :model/Field (mt/id :orders :discount) {:visibility_type "sensitive"}
      (let [user (sent-to-llm {})]
        (is (column-listed? user "Total"))
        (is (not (column-listed? user "Discount")))))))

(deftest summary-formula-sensitive-column-explicit-ref-test
  (testing "POST /api/metabot/summary-formula returns a 403 when an earlier stage selects a sensitive column"
    (mt/with-temp-vals-in-db :model/Field (mt/id :orders :discount) {:visibility_type "sensitive"}
      (check-refused (-> (orders-query)
                         (lib/with-fields [(field :orders :discount) (field :orders :total)])
                         lib/append-stage)))))

(deftest summary-formula-derived-column-reference-test
  (testing "POST /api/metabot/summary-formula returns a 403 when a derived column names a field the user can't see"
    (doseq [visibility-type ["hidden" "sensitive" "retired"]]
      (testing visibility-type
        (mt/with-temp-vals-in-db :model/Field (mt/id :orders :discount) {:visibility_type visibility-type}
          (check-refused (-> (orders-query)
                             (lib/aggregate (lib/sum (field :orders :discount)))
                             lib/append-stage)))))))

(deftest summary-formula-unqueryable-field-reference-test
  (testing "POST /api/metabot/summary-formula returns a 403 when a derived column names a field the user can't query"
    (mt/with-no-data-perms-for-all-users!
      (grant-query-access! :orders)
      (check-refused (-> (orders-query)
                         (lib/aggregate (lib/sum (field :people :latitude)))
                         lib/append-stage)))))

(deftest summary-formula-hidden-table-field-reference-test
  (testing "POST /api/metabot/summary-formula returns a 403 when a derived column names a field of a hidden table"
    (mt/with-temp-vals-in-db :model/Table (mt/id :people) {:visibility_type "hidden"}
      (check-refused (-> (orders-query)
                         (lib/aggregate (lib/sum (field :people :latitude)))
                         lib/append-stage)))))

(deftest summary-formula-hidden-implicit-join-test
  (testing "POST /api/metabot/summary-formula doesn't send columns of an implicitly joined hidden table"
    (mt/with-temp-vals-in-db :model/Table (mt/id :people) {:visibility_type "hidden"}
      (doseq [user [:rasta :crowberto]]
        (testing user
          (let [prompt (sent-to-llm user {})]
            (is (column-listed? prompt "Total"))
            (is (column-listed? prompt "Product → Title"))
            (is (not (column-listed? prompt "User → Name")))))))))

(deftest summary-formula-hidden-source-table-test
  (testing "POST /api/metabot/summary-formula has nothing to offer for a hidden source table"
    (mt/with-temp-vals-in-db :model/Table (mt/id :products) {:visibility_type "hidden"}
      (let [mp (mt/metadata-provider)]
        (check-no-match (lib/query mp (lib.metadata/table mp (mt/id :products))))))))

(deftest summary-formula-hidden-table-behind-model-test
  (testing "POST /api/metabot/summary-formula keeps the columns a model publishes from a hidden table"
    (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:visibility_type "hidden"}
      (mt/with-temp [:model/Card {model-id :id} {:type :model :dataset_query (orders-query)}]
        (is (column-listed? (sent-to-llm {:dataset_query (lib/prepare-for-serialization (card-query model-id))})
                            "Total"))))))

(deftest summary-formula-model-over-unqueryable-table-test
  (testing "POST /api/metabot/summary-formula accepts a query on a readable model's columns"
    (mt/with-no-data-perms-for-all-users!
      (grant-query-access! :products)
      (mt/with-temp [:model/Card {model-id :id} {:type :model :dataset_query (orders-query)}]
        (let [query  (card-query model-id)
              total  (m/find-first #(= "TOTAL" (:name %)) (lib/filterable-columns query))
              query  (lib/filter query (lib/> total 10))
              prompt (sent-to-llm {:dataset_query (lib/prepare-for-serialization query)})]
          (is (column-listed? prompt "Total")))))))

(deftest summary-formula-view-only-user-test
  (testing "POST /api/metabot/summary-formula returns a 403 for a user who can't read the database"
    (mt/with-no-data-perms-for-all-users!
      (grant-query-access!)
      (mt/with-temp [:model/Card {model-id :id} {:type :model :dataset_query (orders-query)}]
        (check-refused (card-query model-id))))))

(deftest summary-formula-database-manager-test
  (testing "POST /api/metabot/summary-formula accepts a user who can read the database by managing its metadata"
    (mt/with-no-data-perms-for-all-users!
      (grant-query-access!)
      (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/manage-table-metadata :yes)
      (mt/with-temp [:model/Card {model-id :id} {:type :model :dataset_query (orders-query)}]
        (is (column-listed? (sent-to-llm {:dataset_query (lib/prepare-for-serialization (card-query model-id))})
                            "Total"))))))

(deftest summary-formula-model-join-to-unqueryable-table-test
  (testing "POST /api/metabot/summary-formula returns a 403 when a model is joined to a table the user can't query"
    (mt/with-no-data-perms-for-all-users!
      (grant-query-access! :orders)
      (mt/with-temp [:model/Card {model-id :id} {:type :model :dataset_query (orders-query)}]
        (check-refused (join-table (card-query model-id) :people :user_id))))))

(deftest summary-formula-model-join-to-unreadable-card-test
  (testing "POST /api/metabot/summary-formula returns a 403 when a model is joined to a card the user can't read"
    (mt/with-non-admin-groups-no-root-collection-perms
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Collection {readable-collection :id}   {}
                       :model/Collection {unreadable-collection :id} {}
                       :model/Card {model-id :id} {:type          :model
                                                   :collection_id readable-collection
                                                   :dataset_query (orders-query)}
                       :model/Card {private-id :id} {:collection_id   unreadable-collection
                                                     :dataset_query   (lib/native-query mp "SELECT 1 AS SECRET")
                                                     :result_metadata [{:name         "SECRET"
                                                                        :display_name "Secret"
                                                                        :base_type    :type/Integer}]}]
          (perms/grant-collection-read-permissions! (perms-group/all-users) readable-collection)
          (let [query   (card-query model-id)
                private (lib.metadata/card mp private-id)
                secret  (first (lib/returned-columns (lib/query mp private)))]
            (check-refused (lib/join query (lib/join-clause private
                                                            [(lib/= (first (lib/filterable-columns query))
                                                                    secret)])))))))))

(deftest summary-formula-metric-permission-test
  (testing "POST /api/metabot/summary-formula only sends metrics the user can read, in aggregation mode"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {readable-collection :id}   {}
                     :model/Collection {unreadable-collection :id} {}
                     :model/Card _ {:name          "Readable metric"
                                    :type          :metric
                                    :collection_id readable-collection
                                    :dataset_query (lib/aggregate (orders-query) (lib/count))}
                     :model/Card _ {:name          "Unreadable metric"
                                    :type          :metric
                                    :collection_id unreadable-collection
                                    :dataset_query (lib/aggregate (orders-query) (lib/count))}]
        (perms/grant-collection-read-permissions! (perms-group/all-users) readable-collection)
        (let [user (sent-to-llm {})]
          (is (column-listed? user "Readable metric"))
          (is (not (column-listed? user "Unreadable metric"))))
        (testing "with no metrics in expression mode"
          (is (not (str/includes? (sent-to-llm {:mode "expression"}) "Metrics:"))))))))

(deftest summary-formula-unreadable-metric-reference-test
  (testing "POST /api/metabot/summary-formula returns a 403 when a derived column names a metric the user can't read"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection {readable-collection :id}   {}
                     :model/Collection {unreadable-collection :id} {}
                     :model/Card {model-id :id}  {:type          :model
                                                  :collection_id readable-collection
                                                  :dataset_query (orders-query)}
                     :model/Card {metric-id :id} {:type          :metric
                                                  :collection_id unreadable-collection
                                                  :dataset_query (lib/aggregate (orders-query) (lib/count))}]
        (perms/grant-collection-read-permissions! (perms-group/all-users) readable-collection)
        (let [mp (mt/metadata-provider)]
          (check-refused (-> (card-query model-id)
                             (lib/aggregate (lib.metadata/metric mp metric-id))
                             lib/append-stage)))))))

(defn- measure-reference-query
  "An Orders query with a new stage after an aggregation on the measure with `measure-id`."
  [measure-id]
  (-> (orders-query)
      (lib/aggregate (lib.metadata/measure (mt/metadata-provider) measure-id))
      lib/append-stage))

(deftest summary-formula-unqueryable-measure-reference-test
  (testing "POST /api/metabot/summary-formula returns a 403 when a derived column names a measure the user can't query"
    (let [mp (mt/metadata-provider)]
      (mt/with-no-data-perms-for-all-users!
        (grant-query-access! :orders)
        (mt/with-temp [:model/Measure {measure-id :id} {:table_id   (mt/id :products)
                                                        :name       "Secret measure"
                                                        :creator_id (mt/user->id :crowberto)
                                                        :definition (lib/aggregate
                                                                     (lib/query mp (lib.metadata/table mp (mt/id :products)))
                                                                     (lib/count))}]
          (check-refused (measure-reference-query measure-id)))))))

(deftest summary-formula-readable-measure-reference-test
  (testing "POST /api/metabot/summary-formula accepts a measure on a table the user can query"
    (mt/with-temp [:model/Measure {measure-id :id} {:table_id   (mt/id :orders)
                                                    :name       "Open measure"
                                                    :creator_id (mt/user->id :crowberto)
                                                    :definition (lib/aggregate (orders-query) (lib/count))}]
      (is (column-listed? (sent-to-llm {:dataset_query (lib/prepare-for-serialization
                                                        (measure-reference-query measure-id))})
                          "Open measure")))))

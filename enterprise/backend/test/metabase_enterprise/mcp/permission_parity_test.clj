(ns metabase-enterprise.mcp.permission-parity-test
  "The rows of the permission-parity matrix whose scenario needs EE code: a sandboxed user, an
   impersonated user, a blocked database in one of the caller's groups, and a caller who may read but
   not download. They reuse the harness in [[metabase.mcp.permission-parity-test]].

   These scenarios are the reason the harness compares payloads and not just verdicts. A sandbox, an
   impersonation policy, and a stripped subscription all *filter what comes back* rather than refusing
   the call: every one of them answers `:allowed` on both surfaces, so a tool that dropped the filter
   would pass a verdict-only matrix while handing an agent rows, columns, and recipients the app would
   never show that user."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.impersonation.util-test :as impersonation.tu]
   [metabase-enterprise.sandbox.test-util :as met]
   [metabase.agent-api.handles :as handles]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.permission-parity-test :as parity]
   [metabase.mcp.tools :as mcp.tools]
   [metabase.permissions.core :as perms]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.test :as mt]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;;; --------------------------------------------- Sandbox fixtures --------------------------------------------------

(defn- row-sandbox
  "A sandbox that filters VENUES down to one category: the caller sees the Mexican restaurants and nothing
   else. Rows, not columns — so every surface still answers `:allowed`, and the whole claim is in the rows."
  []
  {:gtaps      {:venues {:remappings {:cat [:dimension [:field (mt/id :venues :category_id) nil]]}}}
   :attributes {:cat 50}})

(defn- column-sandbox
  "A sandbox whose GTAP card selects three of VENUES' six columns: ID, NAME, CATEGORY_ID. PRICE, LATITUDE,
   and LONGITUDE are not the caller's to see — not their values, and not the fact that they exist."
  []
  {:gtaps      {:venues {:query      (met/restricted-column-query (mt/id))
                         :remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}}}
   :attributes {:cat 50}})

(def ^:private sandboxed-columns
  "The VENUES columns [[column-sandbox]] leaves visible."
  #{"ID" "NAME" "CATEGORY_ID"})

(def ^:private all-venues-columns
  #{"ID" "NAME" "CATEGORY_ID" "LATITUDE" "LONGITUDE" "PRICE"})

(defn- venues-query-handle!
  "A handle on `SELECT * FROM VENUES`, minted for `user`.

   Addressed by handle rather than by the portable name dialect: the sandbox fixture runs against a temp
   copy of the database, which carries the same name as the original, and a name that two databases answer
   to resolves to neither."
  [user]
  (let [mp    (lib-be/application-database-metadata-provider (mt/id))
        query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                  lib/prepare-for-serialization)]
    (handles/store-query! (mt/user->id user) query)))

(defn- tool-rows
  "The rows a query tool returned. `execute_query` answers in its own envelope, with `rows` at the top
   level; `execute_question` hands back the dataset response the QP streams, whose rows sit under `data`."
  [body]
  (parity/result-rows (or (:rows body) (get-in body [:data :rows]))))

(defn- rest-rows
  [body]
  (parity/result-rows (get-in body [:data :rows])))

(def ^:private query-rows-payload
  "The payload claim of a query row: the same rows on both surfaces."
  {:from-tool tool-rows
   :from-rest rest-rows})

(defn- all-venues-rows
  "The VENUES rows an unsandboxed admin gets from REST — what a sandboxed caller's rows must be a proper
   subset of."
  []
  (rest-rows (mt/user-http-request :crowberto :post 202 "dataset" (mt/mbql-query venues))))

;;; ------------------------------------------------- Sandboxing ----------------------------------------------------

(deftest execute-sql-sandboxed-user-parity-test
  (testing "a sandboxed user is refused a native query by both surfaces — raw SQL would escape the sandbox"
    (mt/with-premium-features #{:sandboxes}
      (met/with-gtaps! {:gtaps {:venues {}}}
        (parity/check-parity!
         {:scenario :sandboxed-user
          :user     :rasta
          :expect   :denied
          :tool     ["execute_sql" {:database_id (mt/id) :sql "SELECT * FROM VENUES"}]
          :rest     [:post "dataset" {:database (mt/id)
                                      :type     :native
                                      :native   {:query "SELECT * FROM VENUES"}}]})))))

(deftest browse-data-get-fields-sandboxed-user-parity-test
  (testing "a column-sandboxed user reads a table's metadata through both surfaces, and both narrow the
            field list to the sandbox's columns — the sandbox filters, it does not deny, so the field set
            is the whole claim"
    (mt/with-premium-features #{:sandboxes}
      (met/with-gtaps! (column-sandbox)
        (parity/check-parity!
         {:scenario :column-sandboxed-user
          :user     :rasta
          :expect   :allowed
          :tool     ["browse_data" {:action "get_fields" :table_ids [(mt/id :venues)]}]
          :rest     [:get (str "table/" (mt/id :venues) "/query_metadata")]
          :payload  {:from-tool     #(set (map :name (:fields (first (:data %)))))
                     :from-rest     #(set (map :name (:fields %)))
                     :narrower-than all-venues-columns}})))))

(deftest browse-data-get-fields-sandbox-hides-the-columns-test
  (testing "and the field set both surfaces return is the sandbox's — the narrowing is real, not incidental"
    (mt/with-premium-features #{:sandboxes}
      (met/with-gtaps! (column-sandbox)
        (is (= sandboxed-columns
               (set (map :name (:fields (mt/user-http-request :rasta :get 200
                                                              (str "table/" (mt/id :venues) "/query_metadata")))))))))))

(deftest get-parameter-values-sandboxed-user-parity-test
  (testing "a row-sandboxed user reads a dashboard filter's values through both surfaces, and both narrow
            the values to what the sandbox lets them see"
    (mt/with-premium-features #{:sandboxes}
      (met/with-gtaps! (row-sandbox)
        (mt/with-temp [:model/Card      card {:dataset_query (mt/mbql-query venues)}
                       :model/Dashboard dash {:parameters [{:name "Name" :slug "name"
                                                            :id   "name" :type "string/="}]}
                       :model/DashboardCard _ {:dashboard_id       (:id dash)
                                               :card_id            (:id card)
                                               :parameter_mappings [{:parameter_id "name"
                                                                     :card_id      (:id card)
                                                                     :target       [:dimension (mt/$ids venues $name)]}]}]
          (let [all-names (set (map vec (:values (mt/user-http-request
                                                  :crowberto :get 200
                                                  (str "dashboard/" (:id dash) "/params/name/values")))))]
            (parity/check-parity!
             {:scenario :row-sandboxed-user
              :user     :rasta
              :expect   :allowed
              :tool     ["get_parameter_values" {:target "dashboard" :id (:id dash) :parameter_id "name"}]
              :rest     [:get (str "dashboard/" (:id dash) "/params/name/values")]
              :payload  {:from-tool     #(set (map vec (:values %)))
                         :from-rest     #(set (map vec (:values %)))
                         :narrower-than all-names}})))))))

(deftest execute-question-sandboxed-user-parity-test
  (testing "a row-sandboxed user may still run a saved question — and gets the sandbox's rows from both
            surfaces, never the table's"
    (mt/with-premium-features #{:sandboxes}
      (met/with-gtaps! (row-sandbox)
        (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues)}]
          (parity/check-parity!
           {:scenario :row-sandboxed-user
            :user     :rasta
            :expect   :allowed
            :tool     ["execute_question" {:id (:id card)}]
            :rest     [:post (str "card/" (:id card) "/query")]
            :payload  (assoc query-rows-payload :narrower-than (all-venues-rows))}))))))

(deftest run-saved-question-sandboxed-user-parity-test
  (testing "a row-sandboxed user may run a saved question with `run_saved_question` — and gets the sandbox's
            rows from both surfaces, never the table's"
    (mt/with-premium-features #{:sandboxes}
      (met/with-gtaps! (row-sandbox)
        (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues)}]
          (parity/check-parity!
           {:scenario :row-sandboxed-user
            :user     :rasta
            :expect   :allowed
            :tool     ["run_saved_question" {:id (:id card) :row_limit 200}]
            :rest     [:post (str "card/" (:id card) "/query")]
            :payload  (assoc query-rows-payload :narrower-than (all-venues-rows))}))))))

(deftest execute-query-sandboxed-user-parity-test
  (testing "a row-sandboxed user may run an ad-hoc MBQL query — and gets the sandbox's rows from both
            surfaces. This is the row that would pass while leaking the whole table if the matrix only
            compared verdicts: an unsandboxed run answers `:allowed` too"
    (mt/with-premium-features #{:sandboxes}
      (met/with-gtaps! (row-sandbox)
        (parity/check-parity!
         {:scenario :row-sandboxed-user
          :user     :rasta
          :expect   :allowed
          :tool     ["execute_query" {:query_handle (venues-query-handle! :rasta) :row_limit 200}]
          :rest     [:post "dataset" (mt/mbql-query venues)]
          :payload  (assoc query-rows-payload :narrower-than (all-venues-rows))})))))

(deftest get-content-metric-dimensions-sandboxed-user-parity-test
  (testing "the dimensions a metric can be grouped by are the columns the caller may see: a column-sandboxed
            caller gets the sandbox's columns of the metric's table, the same ones the app would describe to
            them, and learns the name and type of no column the sandbox hides"
    (mt/with-premium-features #{:sandboxes}
      (met/with-gtaps! (column-sandbox)
        (mt/with-temp [:model/Card metric {:name          "Parity Metric"
                                           :type          :metric
                                           :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
          (let [venues-id (mt/id :venues)]
            (parity/check-parity!
             {:scenario     :column-sandboxed-user
              :user         :rasta
              :expect       :allowed
              :tool         ["get_content" {:items   [{:type "metric" :id (:id metric)}]
                                            :include ["dimensions"]}]
              :tool-denied? parity/any-item-denied?
              :rest         [:get (str "table/" venues-id "/query_metadata")]
              :payload      {:from-tool     #(->> (:dimensions (first (:data %)))
                                                  (filter (comp #{venues-id} :table_id))
                                                  (map :name)
                                                  set)
                             :from-rest     #(set (map :name (:fields %)))
                             :narrower-than all-venues-columns}})))))))

(deftest execute-query-validate-only-sandbox-hidden-column-parity-test
  (testing "a dry run over a column the sandbox hides is refused: the app will not tell a column-sandboxed
            caller that PRICE exists, and it refuses to run a query that names it, so `validated: true` on
            that query is a column the caller learned from the tool and from nowhere else"
    (mt/with-premium-features #{:sandboxes}
      (met/with-gtaps! (column-sandbox)
        (let [mp     (lib-be/application-database-metadata-provider (mt/id))
              price  (lib.metadata/field mp (mt/id :venues :price))
              query  (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                         (lib/filter (lib/> price 1))
                         lib/prepare-for-serialization)
              handle (handles/store-query! (mt/user->id :rasta) query)]
          (parity/check-parity!
           {:scenario :column-sandboxed-user
            :user     :rasta
            :expect   :denied
            :tool     ["execute_query" {:query_handle handle :validate_only true}]
            :rest     [:post "dataset" (mt/mbql-query venues {:filter [:> $price 1]})]}))))))

;;; -------------------------------------------- Connection impersonation -------------------------------------------

(deftest get-content-subscription-impersonated-user-parity-test
  (testing "an impersonated user reads a subscription with its recipient list narrowed to themselves, on
            both surfaces — the app does not show a user under an impersonation policy who else a
            subscription goes to"
    (mt/with-premium-features #{:advanced-permissions}
      (impersonation.tu/with-impersonations!
        {:impersonations [{:db-id (mt/id) :attribute "role"}]
         :attributes     {"role" "parity_role"}}
        (mt/with-temp [:model/Card                  card    {:dataset_query (mt/mbql-query venues)}
                       :model/Pulse                 pulse   {:name       "Parity Subscription"
                                                             :creator_id (mt/user->id :crowberto)}
                       :model/PulseCard             _       {:pulse_id (:id pulse) :card_id (:id card)}
                       :model/PulseChannel          channel {:pulse_id     (:id pulse)
                                                             :channel_type :email
                                                             :details      {:emails []}
                                                             :enabled      true}
                       :model/PulseChannelRecipient _       {:pulse_channel_id (:id channel)
                                                             :user_id          (mt/user->id :rasta)}
                       :model/PulseChannelRecipient _       {:pulse_channel_id (:id channel)
                                                             :user_id          (mt/user->id :lucky)}]
          (let [recipient-ids (fn [record]
                                (set (mapcat #(map :id (:recipients %)) (:channels record))))]
            (parity/check-parity!
             {:scenario     :impersonated-user
              :user         :rasta
              :expect       :allowed
              :tool         ["get_content" {:items           [{:type "subscription" :id (:id pulse)}]
                                            :response_format "detailed"}]
              :tool-denied? parity/any-item-denied?
              :rest         [:get (str "pulse/" (:id pulse))]
              :payload      {:from-tool     #(recipient-ids (first (:data %)))
                             :from-rest     recipient-ids
                             :narrower-than #{(mt/user->id :rasta) (mt/user->id :lucky)}}})))))))

(deftest execute-query-impersonated-user-parity-test
  (testing "an impersonated user's ad-hoc query runs on both surfaces: the policy sets the warehouse role
            the query runs under, it does not refuse the query"
    (mt/with-premium-features #{:advanced-permissions}
      (impersonation.tu/with-impersonations!
        {:impersonations [{:db-id (mt/id) :attribute "role"}]
         :attributes     {"role" "parity_role"}}
        (parity/check-parity!
         {:scenario :impersonated-user
          :user     :rasta
          :expect   :allowed
          :tool     ["execute_query" {:query_handle (venues-query-handle! :rasta) :row_limit 200}]
          :rest     [:post "dataset" (mt/mbql-query venues)]
          :payload  query-rows-payload})))))

;;; ------------------------------------- Conflicting group grants · blocked database -------------------------------

(defn- with-rasta-in-a-second-group!
  "Call `f` with a second permission group Rasta belongs to, restoring both groups' data permissions
   afterwards. The scenario every conflicting-grant row needs: one user, two groups, two different
   answers to the same question."
  [f]
  (mt/with-premium-features #{:advanced-permissions}
    (mt/with-temp [:model/PermissionsGroup           group {:name "Parity Second Group"}
                   :model/PermissionsGroupMembership _     {:group_id (:id group)
                                                            :user_id  (mt/user->id :rasta)}]
      (perms.test-util/with-restored-data-perms-for-groups! [(u/the-id (perms/all-users-group)) (:id group)]
        (f group)))))

(deftest execute-query-blocked-in-one-group-parity-test
  (testing "a block in one group overrides a weaker grant in another, and denies the caller on both surfaces"
    (with-rasta-in-a-second-group!
      (fn [group]
        (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :legacy-no-self-service)
        (perms/set-database-permission! group (mt/id) :perms/view-data :blocked)
        (parity/check-parity!
         {:scenario :blocked-in-one-group
          :user     :rasta
          :expect   :denied
          :tool     ["execute_query" {:query_handle (venues-query-handle! :rasta)}]
          :rest     [:post "dataset" (mt/mbql-query venues {:limit 1})]})
        (parity/check-parity!
         {:scenario :blocked-in-one-group
          :user     :rasta
          :expect   :denied
          :tool     ["execute_sql" {:database_id (mt/id) :sql "SELECT * FROM VENUES"}]
          :rest     [:post "dataset" {:database (mt/id)
                                      :type     :native
                                      :native   {:query "SELECT * FROM VENUES"}}]})))))

(deftest execute-query-blocked-against-unrestricted-parity-test
  (testing "a block does not override an unrestricted grant in another group: the app runs the query, and so
            does the tool — with the same rows. A tool that resolved a group conflict its own way would be
            wrong in whichever direction it erred"
    (with-rasta-in-a-second-group!
      (fn [group]
        (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
        (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :query-builder)
        (perms/set-database-permission! group (mt/id) :perms/view-data :blocked)
        (parity/check-parity!
         {:scenario :blocked-against-unrestricted
          :user     :rasta
          :expect   :allowed
          :tool     ["execute_query" {:query_handle (venues-query-handle! :rasta) :row_limit 200}]
          :rest     [:post "dataset" (mt/mbql-query venues)]
          :payload  query-rows-payload})))))

(deftest execute-sql-native-granted-in-one-group-parity-test
  (testing "and the reverse conflict: native permission in one group is native permission, whatever the other
            group withholds — allowed on both surfaces"
    (with-rasta-in-a-second-group!
      (fn [group]
        (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :query-builder)
        (perms/set-database-permission! group (mt/id) :perms/create-queries :query-builder-and-native)
        (parity/check-parity!
         {:scenario :native-granted-in-one-group
          :user     :rasta
          :expect   :allowed
          :tool     ["execute_sql" {:database_id (mt/id) :sql "SELECT NAME FROM VENUES ORDER BY ID LIMIT 5"}]
          :rest     [:post "dataset" {:database (mt/id)
                                      :type     :native
                                      :native   {:query "SELECT NAME FROM VENUES ORDER BY ID LIMIT 5"}}]
          :payload  query-rows-payload})))))

;;; ------------------------------------------------ Download permissions -------------------------------------------

(deftest execute-query-no-download-permission-parity-test
  (testing "download permission gates exports, not reads: a caller who may not download still runs the query
            and reads its rows on both surfaces"
    (mt/with-premium-features #{:advanced-permissions}
      (perms.test-util/with-restored-data-perms-for-group! (u/the-id (perms/all-users-group))
        (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/download-results :no)
        (parity/check-parity!
         {:scenario :no-download-permission
          :user     :rasta
          :expect   :allowed
          :tool     ["execute_query" {:query_handle (venues-query-handle! :rasta) :row_limit 200}]
          :rest     [:post "dataset" (mt/mbql-query venues)]
          :payload  query-rows-payload})
        (testing "and the app's export refuses them, which is the surface download permission governs"
          (is (= 403
                 (:status (mt/user-http-request-full-response
                           :rasta :post "dataset/csv"
                           {:query (mt/mbql-query venues {:limit 1})})))))))))

(deftest run-saved-question-export-no-download-permission-parity-test
  (testing "`run_saved_question`'s export *is* a download, and it is refused by the permission that governs
            one — on both surfaces. The tool would silently bypass the check if it ran the export under any
            context but the app's own download context, which is the only thing the middleware recognizes"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query venues {:limit 1})}]
        (perms.test-util/with-restored-data-perms-for-group! (u/the-id (perms/all-users-group))
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/download-results :no)
          (parity/check-parity!
           {:scenario :no-download-permission
            :user     :rasta
            :expect   :denied
            :tool     ["run_saved_question" {:id (:id card) :export "csv"}]
            :rest     [:post (str "card/" (:id card) "/query/csv")]})
          (testing "while the same card still *reads* for them: download permission gates the file, not the rows"
            (parity/check-parity!
             {:scenario :no-download-permission
              :user     :rasta
              :expect   :allowed
              :tool     ["run_saved_question" {:id (:id card)}]
              :rest     [:post (str "card/" (:id card) "/query")]})))))))

(deftest run-saved-question-export-limited-download-permission-parity-test
  (testing "the limited download tier caps an export at ten thousand rows, and the tool's file carries exactly
            the rows the app's own download does"
    (mt/with-premium-features #{:advanced-permissions}
      (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query checkins)}]
        (perms.test-util/with-restored-data-perms-for-group! (u/the-id (perms/all-users-group))
          (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/download-results
                                          :ten-thousand-rows)
          (let [rest-rows (-> (mt/user-http-request :rasta :post 200 (str "card/" (:id card) "/query/csv"))
                              str
                              str/split-lines
                              count
                              dec)                                  ; the header is not a row
                tool-rows (:row_count (parity/tool-body
                                       (mt/with-test-user :rasta
                                         (mcp.tools/call-tool nil "run_saved_question"
                                                              {:id (:id card) :export "csv"}))))]
            (is (pos? rest-rows))
            (is (= rest-rows tool-rows))))))))

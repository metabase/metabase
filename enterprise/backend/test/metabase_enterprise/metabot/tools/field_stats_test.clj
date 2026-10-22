(ns metabase-enterprise.metabot.tools.field-stats-test
  (:require
   [clojure.edn :as edn]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.impersonation.util-test :as impersonation.util-test]
   [metabase-enterprise.test :as met]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.agent.profiles :as profiles]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools :as metabot.tools]
   [metabase.metabot.tools.field-stats :as metabot.tools.field-stats]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- sandboxed-query []
  (let [mp       (mt/metadata-provider)
        table    (lib.metadata/table mp (mt/id :categories))
        id-field (lib.metadata/field mp (mt/id :categories :id))]
    (lib/filter (lib/query mp table) (lib/< id-field 3))))

(deftest sandboxed-field-values-test
  (met/with-gtaps! {:gtaps {:categories {:query (sandboxed-query)}}}
    (let [field-id (mt/id :categories :name)
          table-id (mt/id :categories)]
      (try
        (let [result (metabot.tools.field-stats/field-values
                      {:entity-type "table", :entity-id table-id, :field-id field-id, :limit 10})]
          (testing "returns sandboxed field values"
            (is (= ["African" "American"] (get-in result [:structured-output :value_metadata :field_values])))))
        (testing "a truncated sample counts only the values the sandbox lets the user see"
          (is (=? {:field_values ["African"] :field_values_total 2}
                  (get-in (metabot.tools.field-stats/field-values
                           {:entity-type "table", :entity-id table-id, :field-id field-id, :limit 1})
                          [:structured-output :value_metadata]))))
        (finally
          (t2/delete! :model/FieldValues :field_id field-id :type :advanced))))))

(deftest refingerprint-skipped-for-sandboxed-user-test
  (testing "Metabot must not compute or return a fingerprint for a sandboxed user: fingerprints are global
            statistics, so an on-demand resample would run unsandboxed (via request/as-admin) and persist
            unsandboxed data to the shared Field row for a user who should never see it."
    (met/with-gtaps! {:gtaps {:categories {:query (sandboxed-query)}}}
      (let [field-id    (mt/id :categories :name)
            table-id    (mt/id :categories)
            original-fp (t2/select-one-fn :fingerprint :model/Field :id field-id)]
        (try
          ;; Clear the fingerprint -- pre-#436 (and pre this fix, for this call site) this would have
          ;; forced an unsandboxed on-demand refingerprint via get-or-create-fingerprint!.
          (t2/update! :model/Field field-id {:fingerprint nil :fingerprint_version 0})
          (let [result (metabot.tools.field-stats/field-values
                        {:entity-type "table", :entity-id table-id, :field-id field-id})]
            (testing "no fingerprint statistics are returned to the sandboxed user"
              (is (nil? (get-in result [:structured-output :value_metadata :statistics]))))
            (testing "no fingerprint was computed or saved to the shared Field row"
              (is (nil? (t2/select-one-fn :fingerprint :model/Field :id field-id)))))
          (finally
            (t2/update! :model/Field field-id {:fingerprint original-fp})))))))

(deftest fingerprint-withheld-for-sandboxed-user-test
  (testing "An existing global fingerprint is withheld from a sandboxed user, even though it's already
            computed and would otherwise just be read as-is."
    (met/with-gtaps! {:gtaps {:categories {:query (sandboxed-query)}}}
      (let [field-id (mt/id :categories :name)
            table-id (mt/id :categories)]
        (is (some? (t2/select-one-fn :fingerprint :model/Field :id field-id))
            "precondition: the field already has a fingerprint")
        (let [result (metabot.tools.field-stats/field-values
                      {:entity-type "table", :entity-id table-id, :field-id field-id})]
          (is (nil? (get-in result [:structured-output :value_metadata :statistics]))))))))

(deftest fingerprint-withheld-when-model-metadata-spoofs-table-test
  (testing "A model cannot bypass sandbox fingerprint filtering by claiming that a real Field belongs to an open table"
    (met/with-gtaps! {:gtaps {:categories {:query (sandboxed-query)}}}
      (let [restricted-field-id (mt/id :categories :name)
            open-table-id       (mt/id :venues)]
        (mt/with-temp [:model/Card {model-id :id}
                       {:name            "Model with stale metadata"
                        :type            :model
                        :database_id     (mt/id)
                        :dataset_query   {:database (mt/id)
                                          :type     :query
                                          :query    {:source-table open-table-id}}
                        ;; Model result metadata is editable and is merged over the metadata provider's
                        ;; canonical Field metadata. Simulate a stale/malicious table_id paired with a
                        ;; real Field ID from the sandboxed table.
                        :result_metadata [{:id             restricted-field-id
                                           :name           "SPOOF"
                                           :display_name   "Spoof"
                                           :base_type      :type/Text
                                           :effective_type :type/Text
                                           :table_id       open-table-id
                                           :field_ref      [:field restricted-field-id nil]}]}]
          (let [result (metabot.tools.field-stats/field-values
                        {:entity-type "model", :entity-id model-id, :field-id restricted-field-id})]
            (is (= ["African" "American"]
                   (get-in result [:structured-output :value_metadata :field_values]))
                "field values still use the current user's sandbox lens")
            (is (nil? (get-in result [:structured-output :value_metadata :statistics]))
                "the persisted Field owner, not spoofed Card metadata, controls fingerprint access")))))))

(deftest fingerprint-withheld-for-impersonated-user-test
  (testing "An impersonated user gets no fingerprint statistics, and no on-demand refingerprint is triggered"
    (mt/with-premium-features #{:advanced-permissions}
      (impersonation.util-test/with-impersonations!
        {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
         :attributes     {"impersonation_attr" "impersonation_role"}}
        (let [field-id    (mt/id :venues :price)
              table-id    (mt/id :venues)
              original-fp (t2/select-one-fn :fingerprint :model/Field :id field-id)]
          (is (some? original-fp) "precondition: the field already has a fingerprint")
          (testing "an existing fingerprint is withheld"
            (let [result (metabot.tools.field-stats/field-values
                          {:entity-type "table", :entity-id table-id, :field-id field-id})]
              (is (nil? (get-in result [:structured-output :value_metadata :statistics])))))
          (testing "a missing fingerprint is not computed or saved"
            (try
              (t2/update! :model/Field field-id {:fingerprint nil :fingerprint_version 0})
              (metabot.tools.field-stats/field-values
               {:entity-type "table", :entity-id table-id, :field-id field-id})
              (is (nil? (t2/select-one-fn :fingerprint :model/Field :id field-id)))
              (finally
                (t2/update! :model/Field field-id {:fingerprint original-fp})))))))))

(deftest fingerprint-withheld-for-routed-user-test
  (testing "A database-routed user gets no fingerprint statistics, and no on-demand refingerprint is
            triggered"
    (mt/with-temp [:model/Database       router-db {}
                   :model/Database       dest-db   {:router_database_id (:id router-db)}
                   :model/Table          table     {:db_id (:id router-db)}
                   :model/Field          field     {:table_id (:id table)
                                                    :fingerprint {:global {:distinct-count 1}}}
                   :model/DatabaseRouter _         {:database_id (:id router-db) :user_attribute "db_name"}]
      (met/with-user-attributes! :rasta {"db_name" (:name dest-db)}
        (mt/with-test-user :rasta
          (testing "an existing fingerprint is withheld"
            (let [result (metabot.tools.field-stats/field-values
                          {:entity-type "table", :entity-id (:id table), :field-id (:id field)})]
              (is (nil? (get-in result [:structured-output :value_metadata :statistics])))))
          (testing "a missing fingerprint is not computed or saved"
            (t2/update! :model/Field (:id field) {:fingerprint nil :fingerprint_version 0})
            (metabot.tools.field-stats/field-values
             {:entity-type "table", :entity-id (:id table), :field-id (:id field)})
            (is (nil? (t2/select-one-fn :fingerprint :model/Field :id (:id field))))))))))

(deftest fingerprint-returned-for-unrestricted-user-test
  (testing "A non-sandboxed, non-impersonated, non-routed user still gets fingerprint statistics -- this
            fix must not regress the common case."
    (mt/as-admin
      (let [field-id (mt/id :categories :name)
            table-id (mt/id :categories)]
        (is (some? (t2/select-one-fn :fingerprint :model/Field :id field-id))
            "precondition: the field already has a fingerprint")
        (let [result (metabot.tools.field-stats/field-values
                      {:entity-type "table", :entity-id table-id, :field-id field-id})]
          (is (some? (get-in result [:structured-output :value_metadata :statistics]))))))))

(deftest inaccessible-field-details-match-missing-fields-test
  (met/with-gtaps! {:gtaps {:venues {:query (let [mp (mt/metadata-provider)
                                                  allowed-ids (mapv #(mt/id :venues %) [:id :name :category_id])]
                                              (lib/with-fields (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                                (mapv #(lib.metadata/field mp %) allowed-ids)))}}}
    (doseq [profile [:document-generate-content :slackbot :internal]]
      (let [responses
            (mapv (fn [field-id]
                    (binding [scope/*current-user-scope* #{"*"}]
                      (let [entries (metabot.tools/->entries (:tools (profiles/get-profile profile)) nil nil profile)
                            args (if (= profile :internal)
                                   {:uris [(str "metabase://table/" (mt/id :venues) "/fields/" field-id)]}
                                   {:data_source "table" :source_id (mt/id :venues) :field_id field-id})
                            tool-name (if (= profile :internal) "read_resource" "get_field_values")
                            result ((get-in entries [tool-name :fn]) args)
                            available-ids (set (edn/read-string
                                                (or (second (re-find #"Valid field IDs: (\[[^\]]*\])"
                                                                     (:output result)))
                                                    "[]")))]
                        (is (= {:class :recoverable
                                :code (if (= profile :internal)
                                        :metabase.metabot.tools.core/all-items-failed
                                        ::metabot.tools.field-stats/unknown-field)} (:error result)))
                        (is (str/includes? (:output result)
                                           (str "Field " field-id " was not found in table " (mt/id :venues) ".")))
                        (is (str/includes? (:output result) "Retry with one of these field IDs."))
                        (is (not (str/includes? (:output result) "Call `search`")))
                        (is (every? available-ids (map #(mt/id :venues %) [:id :name :category_id])))
                        (is (not (contains? available-ids (mt/id :venues :price))))
                        result)))
                  [(mt/id :venues :price) Integer/MAX_VALUE])]
        (is (= (mapv :error responses) (repeat 2 (:error (first responses)))))
        (is (apply = (map #(second (str/split (:output %) #"\. Valid field IDs: " 2)) responses)))))))

(defn- count-query []
  (let [mp (mt/metadata-provider)]
    (lib/aggregate (lib/query mp (lib.metadata/table mp (mt/id :categories))) (lib/count))))

(defn- card-field-metadata [profile card-id field-id]
  (binding [scope/*current-user-scope* #{"*"}]
    (let [entries (metabot.tools/->entries (:tools (profiles/get-profile profile)) nil nil profile)]
      ((get-in entries ["get_field_values" :fn])
       {:data_source "question" :source_id card-id :field_id field-id}))))

(defn- check-count-fingerprint [query restricted?]
  (let [columns (mt/as-admin (-> query qp/process-query :data :results_metadata :columns))
        fingerprint (:fingerprint (first columns))
        global-count (get-in fingerprint [:type :type/Number :max])]
    (is (nil? (:id (first columns))))
    (is (pos? global-count))
    (mt/with-temp [:model/Card {card-id :id} {:type :question :database_id (mt/id)
                                              :dataset_query query :result_metadata columns}]
      (doseq [profile [:document-generate-content :slackbot]]
        (let [unrestricted (mt/as-admin (card-field-metadata profile card-id "count"))
              user-result (card-field-metadata profile card-id "count")]
          (is (= {:result-type :field-metadata :field_id "count"
                  :value_metadata {:statistics (merge {:distinct-count 1 :percent-null 0.0}
                                                      (get-in fingerprint [:type :type/Number]))}}
                 (:structured-output unrestricted)))
          (if restricted?
            (is (= {:result-type :field-metadata :field_id "count" :value_metadata nil}
                   (:structured-output user-result)))
            (is (= unrestricted user-result))))))))

(deftest virtual-column-fingerprint-withheld-for-sandboxed-user-test
  (met/with-gtaps! {:gtaps {:categories {:query (sandboxed-query)}}}
    (let [mp (mt/metadata-provider)
          query (count-query)
          table (lib.metadata/table mp (mt/id :categories))
          joined-query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                           (lib/join (lib/join-clause table
                                                      [(lib/= (lib.metadata/field mp (mt/id :venues :category_id))
                                                              (lib.metadata/field mp (mt/id :categories :id)))]))
                           (lib/aggregate (lib/count)))
          native-query (lib/native-query mp (str "SELECT COUNT(*) AS \"count\" FROM \"" (:name table) "\""))]
      (is (= [[2]] (:rows (:data (qp/process-query query)))))
      (doseq [query [query joined-query native-query]]
        (check-count-fingerprint query true))
      (mt/with-temp [:model/Card {card-id :id} {:type :question :database_id (mt/id) :dataset_query query}]
        (check-count-fingerprint (lib/query mp (lib.metadata/card mp card-id)) true)))))

(deftest virtual-column-fingerprint-withheld-for-impersonated-user-test
  (mt/with-premium-features #{:advanced-permissions}
    (impersonation.util-test/with-impersonations!
      {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
       :attributes {"impersonation_attr" "impersonation_role"}}
      (check-count-fingerprint (count-query) true))))

(deftest virtual-column-fingerprint-returned-for-unrestricted-user-test
  (mt/with-test-user :rasta
    (check-count-fingerprint (count-query) false)))

(deftest native-column-fingerprints-withheld-without-parsing-sql-test
  (met/with-gtaps! {:gtaps {:categories {:query (sandboxed-query)}}}
    (let [mp (mt/metadata-provider)
          table-name (:name (lib.metadata/table mp (mt/id :categories)))
          count-sql (str "SELECT COUNT(*) AS \"count\" FROM \"" table-name "\"")]
      (doseq [[sql field-id] [[(str count-sql " WHERE \"ID\" < 0x7FFFFFFF") "count"]
                              [(str count-sql " WHERE X'01' = X'01'") "count"]
                              [(str "TABLE \"" table-name "\"") "NAME"]]]
        (testing sql
          (let [query (lib/native-query mp sql)
                columns (mt/as-admin (-> query qp/process-query :data :results_metadata :columns))]
            (mt/with-temp [:model/Card {card-id :id} {:type :question :dataset_query query
                                                      :result_metadata columns}]
              (doseq [profile [:document-generate-content :slackbot]]
                (let [unrestricted (mt/as-admin (card-field-metadata profile card-id field-id))
                      result (card-field-metadata profile card-id field-id)]
                  (is (pos? (get-in unrestricted [:structured-output :value_metadata :statistics :distinct-count])))
                  (is (= {:result-type :field-metadata :field_id field-id :value_metadata nil}
                         (:structured-output result))))))))))))

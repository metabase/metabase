(ns metabase.metabot.tools.metadata-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver.util :as driver.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.agent.profiles :as profiles]
   [metabase.metabot.metadata-perms :as metabot.perms]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools :as metabot.tools]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.metabot.tools.field-stats :as field-stats]
   [metabase.metabot.tools.metadata :as metadata-tools]
   [metabase.metabot.tools.util :as tools.u]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- invoke-metadata
  ([profile tool-name args]
   (invoke-metadata profile tool-name args nil))
  ([profile tool-name args metabot]
   (binding [scope/*current-user-scope* #{"*"}]
     (let [entries (metabot.tools/->entries (:tools (profiles/get-profile profile)) nil metabot profile)]
       ((get-in entries [tool-name :fn]) args)))))

(deftest missing-metabot-is-recoverable-test
  (is (= {:error {:class :recoverable :code ::metadata-tools/unknown-metabot}
          :output (str "No Metabot was provided for this call."
                       "\nAsk the user to reopen the document and try again.")}
         (invoke-metadata :document-generate-content "list_available_data_sources" {}))))

(deftest metadata-id-limit-is-recoverable-test
  (doseq [profile [:document-generate-content :slackbot]
          kind [:table_ids :model_ids :metric_ids]]
    (testing (str profile " " kind)
      (is (= {:error {:class :recoverable :code ::metadata-tools/too-many-ids}
              :output (str "Too many " (name ({:table_ids :table :model_ids :model :metric_ids :metric} kind))
                           " IDs provided (6). Limit each source type to 5 IDs per call."
                           "\nSplit the IDs across multiple calls.")}
             (invoke-metadata profile "list_available_fields"
                              (assoc {:table_ids [] :model_ids [] :metric_ids []} kind [1 2 3 4 5 6])))))))

(deftest metadata-failures-keep-successful-ids-test
  (mt/as-admin
    (doseq [profile [:document-generate-content :slackbot]]
      (mt/with-dynamic-fn-redefs [entity-details/get-table-details
                                  (fn [{:keys [entity-id]}]
                                    (if (= entity-id (mt/id :orders))
                                      {:structured-output {:id entity-id :name "Orders" :fields []}}
                                      (throw (ex-info "clojure.lang.ExceptionInfo: private database text" {}))))]
        (let [{:keys [output error]} (invoke-metadata profile "list_available_fields"
                                                      {:table_ids [(mt/id :orders) (mt/id :products)]
                                                       :model_ids [] :metric_ids []})]
          (is (nil? error))
          (is (str/includes? output "Orders"))
          (is (str/includes? output (str "Could not load metadata for table " (mt/id :products) "."))))
        (is (=? {:error {:class :recoverable :code :metabase.metabot.tools.core/all-items-failed}
                 :output #(str/includes? % (str "Could not load metadata for table " (mt/id :products) "."))}
                (invoke-metadata profile "list_available_fields"
                                 {:table_ids [(mt/id :products)] :model_ids [] :metric_ids []})))))))

(deftest field-values-unknown-field-lists-valid-ids-test
  (mt/as-admin
    (doseq [profile [:document-generate-content :slackbot]]
      (let [{:keys [error output]} (invoke-metadata profile "get_field_values"
                                                    {:data_source "table" :source_id (mt/id :products)
                                                     :field_id "missing"})]
        (is (= {:class :recoverable :code ::field-stats/unknown-field} error))
        (is (str/includes? output (str "Field missing was not found in table " (mt/id :products)
                                       ". Valid field IDs:")))
        (is (str/includes? output (str (mt/id :products :category))))
        (is (str/includes? output "Retry with one of these field IDs."))))))

(deftest field-values-refusals-name-the-requested-entity-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-current-user (mt/user->id :rasta)
      (doseq [profile [:document-generate-content :slackbot]
              table-id [(mt/id :products) Integer/MAX_VALUE]]
        (is (= {:error {:class :recoverable :code :metabase.metabot.tools.recoverable.common/not-found}
                :output (str "Table " table-id " was not found. It may not exist, or you may not have access to it."
                             (when (= profile :slackbot)
                               "\nCall `search` to find the entity you want and use an id from the results."))}
               (invoke-metadata profile "get_field_values"
                                {:data_source "table" :source_id table-id :field_id 1})))))))

(deftest inaccessible-field-ids-use-accessible-suggestions-test
  (mt/as-admin
    (mt/with-dynamic-fn-redefs [metabot.perms/sandbox-restricted-fields
                                (fn [_] {(mt/id :products) #{(mt/id :products :id)}})]
      (doseq [profile [:document-generate-content :slackbot]
              field-id [(mt/id :products :category) Integer/MAX_VALUE]]
        (let [result (invoke-metadata profile "get_field_values"
                                      {:data_source "table" :source_id (mt/id :products) :field_id field-id})]
          (is (= {:error {:class :recoverable :code ::field-stats/unknown-field}
                  :output (str "Field " field-id " was not found in table " (mt/id :products)
                               ". Valid field IDs: [" (mt/id :products :id) "]."
                               "\nRetry with one of these field IDs.")}
                 result)))))))

(deftest field-values-accept-emitted-column-aliases-test
  (mt/as-admin
    (let [mp (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    (lib/aggregate (lib/count)))
          col (first (lib/returned-columns query))
          field-id (:field_id (tools.u/->result-column query col))]
      (mt/with-temp [:model/Card {card-id :id} {:type :question :dataset_query query}]
        (doseq [profile [:document-generate-content :slackbot]
                data-source ["question" "report"]]
          (is (string? field-id))
          (is (=? {:structured-output {:field_id field-id :result-type :field-metadata}
                   :output #(str/includes? % "<result>")}
                  (invoke-metadata profile "get_field_values"
                                   {:data_source data-source :source_id card-id :field_id field-id}))))))))

(deftest destination-database-field-values-are-not-found-test
  (mt/as-admin
    (mt/with-temp [:model/Database {router-id :id} {}
                   :model/Database {destination-id :id} {:router_database_id router-id}
                   :model/Card {card-id :id} {:type :question :database_id destination-id}]
      (let [table-id (t2/insert-returning-pk! (t2/table-name :model/Table)
                                              {:db_id destination-id :name "destination-table" :active true
                                               :created_at :%now :updated_at :%now})]
        (testing "destination databases cannot be addressed directly"
          (doseq [profile [:document-generate-content :slackbot]
                  [data-source source-id] [["table" table-id] ["model" card-id] ["metric" card-id]
                                           ["question" card-id] ["report" card-id]]]
            (is (=? {:error {:class :recoverable :code :metabase.metabot.tools.recoverable.common/not-found}}
                    (invoke-metadata profile "get_field_values"
                                     {:data_source data-source :source_id source-id :field_id 1}))))
          (doseq [profile [:document-generate-content :slackbot]]
            (let [{:keys [error output]} (invoke-metadata profile "list_available_fields"
                                                          {:table_ids [table-id]
                                                           :model_ids [card-id] :metric_ids [card-id]})]
              (is (= {:class :recoverable :code :metabase.metabot.tools.core/all-items-failed} error))
              (doseq [[kind id] [["Table" table-id] ["Model" card-id] ["Metric" card-id]]]
                (is (str/includes? output (str kind " " id " was not found.")))))))))))

(deftest field-values-validates-the-data-source-test
  (doseq [profile [:document-generate-content :slackbot]]
    (is (=? {:error {:class :validation :code :invalid-arguments}
             :output #(str/includes? % "data_source")}
            (invoke-metadata profile "get_field_values"
                             {:data_source "bogus" :source_id 1 :field_id 1})))))

(deftest metadata-accepts-fifteen-ids-test
  (mt/as-admin
    (mt/with-dynamic-fn-redefs [entity-details/get-table-details
                                (fn [{:keys [entity-id]}] {:structured-output {:id entity-id :name "Birds" :fields []}})
                                entity-details/get-metric-details
                                (fn [{:keys [metric-id]}] {:structured-output {:id metric-id :name "Bird count"}})]
      (mt/with-temp [:model/Card {model-id :id} {:type :model}
                     :model/Card {metric-id :id} {:type :metric}]
        (doseq [profile [:document-generate-content :slackbot]]
          (let [result (invoke-metadata profile "list_available_fields"
                                        {:table_ids (repeat 5 (mt/id :orders))
                                         :model_ids (repeat 5 model-id) :metric_ids (repeat 5 metric-id)})]
            (is (nil? (:error result)))
            (is (= [5 5 5] (mapv #(count (get-in result [:structured-output %])) [:tables :models :metrics])))))))))

(deftest available-data-sources-use-the-turns-metabot-test
  (let [metabot {:id 42}]
    (mt/with-dynamic-fn-redefs [entity-details/answer-sources
                                (fn [options]
                                  (is (= metabot (:metabot options)))
                                  {:structured-output {:result-type :answer-sources :models [] :metrics []}})]
      (is (=? {:output #(str/includes? % "<result>") :structured-output {:models [] :metrics []}}
              (invoke-metadata :document-generate-content "list_available_data_sources" {} metabot))))))

(deftest unknown-field-suggestions-respect-column-permissions-test
  (mt/as-admin
    (let [allowed-id (mt/id :products :id)]
      (mt/with-dynamic-fn-redefs [metabot.perms/sandbox-restricted-fields
                                  (fn [_] {(mt/id :products) #{allowed-id}})]
        (doseq [profile [:document-generate-content :slackbot]]
          (is (= (str "Field missing was not found in table " (mt/id :products)
                      ". Valid field IDs: [" allowed-id "]."
                      "\nRetry with one of these field IDs.")
                 (:output (invoke-metadata profile "get_field_values"
                                           {:data_source "table" :source_id (mt/id :products)
                                            :field_id "missing"})))))))))

(deftest metadata-failures-name-each-source-test
  (mt/as-admin
    (mt/with-temp [:model/Card {model-id :id} {:type :model}
                   :model/Card {metric-id :id} {:type :metric}]
      (doseq [profile [:document-generate-content :slackbot]
              failure [(fn [_] {:output "private driver text"})
                       (fn [_] (throw (ex-info "private parser text" {})))
                       (fn [_] (throw (AssertionError. "private failure")))]]
        (mt/with-dynamic-fn-redefs [entity-details/get-table-details failure
                                    entity-details/get-metric-details failure]
          (let [result (invoke-metadata profile "list_available_fields"
                                        {:table_ids [(mt/id :orders)] :model_ids [model-id] :metric_ids [metric-id]})]
            (is (= {:class :recoverable :code :metabase.metabot.tools.core/all-items-failed} (:error result)))
            (doseq [[kind id] [["table" (mt/id :orders)] ["model" model-id] ["metric" metric-id]]]
              (is (str/includes? (:output result) (str "Could not load metadata for " kind " " id "."))))))))))

(deftest field-values-accept-numeric-strings-test
  (mt/as-admin
    (doseq [profile [:document-generate-content :slackbot]]
      (is (=? {:structured-output {:field_id (str (mt/id :products :category))}
               :output #(str/includes? % "<field-metadata")}
              (invoke-metadata profile "get_field_values"
                               {:data_source "table" :source_id (str (mt/id :products))
                                :field_id (str (mt/id :products :category))}))))))

(deftest numeric-column-aliases-keep-their-identity-test
  (mt/with-test-user :crowberto
    (let [mp (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :orders)))
          physical-column (first (lib/returned-columns query))
          aggregate-query (lib/aggregate query (lib/count))
          alias-column (assoc (first (lib/returned-columns aggregate-query))
                              :lib/desired-column-alias (str (:id physical-column))
                              :fingerprint {:global {:distinct-count 17}})
          field-id (:field_id (tools.u/->result-column aggregate-query alias-column))]
      (mt/with-temp [:model/Card {card-id :id} {:type :question :dataset_query aggregate-query}]
        (mt/with-dynamic-fn-redefs [lib/returned-columns (constantly [alias-column])
                                    lib/visible-columns (constantly [physical-column])]
          (doseq [profile [:document-generate-content :slackbot]]
            (is (=? {:structured-output {:field_id field-id
                                         :value_metadata {:statistics {:distinct-count 17}}}}
                    (invoke-metadata profile "get_field_values"
                                     {:data_source "question" :source_id card-id :field_id field-id})))))))))

(deftest native-card-aliases-match-the-metadata-output-test
  (mt/as-admin
    (let [query (lib/native-query (mt/metadata-provider) "SELECT 17 AS \"bird_count\"")
          columns (-> query qp/process-query :data :results_metadata :columns)]
      (mt/with-temp [:model/Card {question-id :id} {:type :question :dataset_query query :result_metadata columns}
                     :model/Card {model-id :id} {:type :model :dataset_query query :result_metadata columns}]
        (doseq [[data-source source-id entity-type] [["question" question-id :question]
                                                     ["report" question-id :question]
                                                     ["model" model-id :model]]
                :let [metadata (entity-details/get-table-details
                                {:entity-type entity-type :entity-id source-id
                                 :with-fields? true :with-field-values? false
                                 :with-related-tables? false :with-metrics? false
                                 :with-measures? false :with-segments? false})
                      field-id (get-in metadata [:structured-output :fields 0 :field_id])]
                profile [:document-generate-content :slackbot]]
          (is (string? field-id))
          (is (=? {:structured-output {:field_id field-id :result-type :field-metadata}}
                  (invoke-metadata profile "get_field_values"
                                   {:data_source data-source :source_id source-id :field_id field-id}))))))))

(deftest metadata-wrong-source-types-are-recoverable-test
  (mt/as-admin
    (mt/with-temp [:model/Card {question-id :id} {:type :question}
                   :model/Card {model-id :id} {:type :model}
                   :model/Card {metric-id :id} {:type :metric}]
      (doseq [profile [:document-generate-content :slackbot]
              [source-id actual-type expected-type] [[question-id "question" "model"]
                                                     [metric-id "metric" "model"]
                                                     [model-id "model" "metric"]
                                                     [question-id "question" "metric"]]
              :let [message (str "Card " source-id " is a " actual-type ", not a " expected-type "."
                                 "\nRetry using a " expected-type " ID."
                                 "\nSet `data_source` to \"" actual-type "\" in `get_field_values` for this card.")]]
        (let [result (invoke-metadata profile "list_available_fields"
                                      (assoc {:table_ids [(mt/id :products)] :model_ids [] :metric_ids []}
                                             (keyword (str expected-type "_ids")) [source-id]))]
          (is (nil? (:error result)))
          (is (= [(mt/id :products)] (mapv :id (get-in result [:structured-output :tables]))))
          (is (= [message] (get-in result [:structured-output :errors]))))
        (is (=? {:error {:class :recoverable :code :metabase.metabot.tools.core/all-items-failed}
                 :output #(str/includes? % message)}
                (invoke-metadata profile "list_available_fields"
                                 (assoc {:table_ids [] :model_ids [] :metric_ids []}
                                        (keyword (str expected-type "_ids")) [source-id])))))
      (doseq [profile [:document-generate-content :slackbot]
              [source-id actual-type] [[question-id "question"] [model-id "model"]]]
        (is (= {:error {:class :recoverable :code ::tools.u/wrong-source-type}
                :output (str "Card " source-id " is a " actual-type ", not a metric.\nRetry using a metric ID."
                             "\nSet `data_source` to \"" actual-type "\" in `get_field_values` for this card.")}
               (invoke-metadata profile "get_field_values"
                                {:data_source "metric" :source_id source-id :field_id (mt/id :orders :id)})))))))

(deftest pivot-question-fields-round-trip-test
  (mt/as-admin
    (let [mp (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    (lib/aggregate (lib/count))
                    (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :orders :total))))
                    (lib/breakout (lib/with-temporal-bucket
                                    (lib.metadata/field mp (mt/id :orders :created_at)) :month)))]
      (mt/with-temp [:model/Card {card-id :id} {:type :question :display :pivot :dataset_query query}]
        (let [fields (get-in (entity-details/get-table-details
                              {:entity-type :question :entity-id card-id
                               :with-fields? true :with-field-values? false :with-related-tables? false
                               :with-metrics? false :with-measures? false :with-segments? false})
                             [:structured-output :fields])]
          (is (= 3 (count fields)))
          (doseq [profile [:document-generate-content :slackbot]
                  {field-id :field_id} fields]
            (is (=? {:structured-output {:field_id field-id :result-type :field-metadata}}
                    (invoke-metadata profile "get_field_values"
                                     {:data_source "question" :source_id card-id :field_id field-id})))))))))

(deftest unknown-field-names-card-source-test
  (mt/as-admin
    (let [mp (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    (lib/aggregate (lib/count)))]
      (doseq [card-type [:model :question :metric]]
        (mt/with-temp [:model/Card {card-id :id} {:type card-type :dataset_query query}]
          (doseq [profile [:document-generate-content :slackbot]
                  data-source (if (= card-type :question) ["question" "report"] [(name card-type)])]
            (is (=? {:error {:class :recoverable :code ::field-stats/unknown-field}
                     :output #(str/starts-with? % (str "Field missing was not found in " (name card-type)
                                                       " " card-id ". Valid field IDs:"))}
                    (invoke-metadata profile "get_field_values"
                                     {:data_source data-source :source_id card-id :field_id "missing"})))))))))

(deftest wide-table-field-suggestions-keep-recovery-test
  (mt/as-admin
    (mt/with-temp [:model/Table {table-id :id} {:db_id (mt/id) :name "WIDE_BIRDS" :active true}]
      (t2/insert! :model/Field (for [i (range 1300)]
                                 {:table_id table-id :name (str "BIRD_" i) :base_type :type/Integer
                                  :database_type "INTEGER" :active true}))
      (doseq [[profile tool-name args] [[:document-generate-content "get_field_values"
                                         {:data_source "table" :source_id table-id :field_id "missing"}]
                                        [:slackbot "get_field_values"
                                         {:data_source "table" :source_id table-id :field_id "missing"}]
                                        [:internal "read_resource"
                                         {:uris [(str "metabase://table/" table-id "/fields/missing")]}]]]
        (let [{:keys [error output]} (invoke-metadata profile tool-name args)
              ids (second (re-find #"Valid field IDs: \[([^\]]*)\]" output))]
          (is (= :recoverable (:class error)))
          (is (str/includes? output (str "Field missing was not found in table " table-id ".")))
          (is (= 100 (count (re-seq #"\d+" (or ids "")))))
          (is (str/includes? output "and 1200 more"))
          (is (str/includes? output "Retry with one of these field IDs."))
          (is (< (count output) 4000)))))))

(defn- invoke-field-detail
  [profile data-source source-id field-id]
  (if (= profile :internal)
    (invoke-metadata profile "read_resource"
                     {:uris [(str "metabase://" (if (= data-source "report") "question" data-source)
                                  "/" source-id (if (= data-source "metric") "/dimensions/" "/fields/") field-id)]})
    (invoke-metadata profile "get_field_values"
                     {:data_source data-source :source_id source-id :field_id field-id})))

(deftest field-details-check-every-card-type-test
  (mt/as-admin
    (let [mp (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
      (mt/with-temp [:model/Card {model-id :id} {:type :model :dataset_query query}
                     :model/Card {question-id :id} {:type :question :dataset_query query}
                     :model/Card {metric-id :id} {:type :metric :dataset_query (lib/aggregate query (lib/count))}]
        (doseq [profile [:document-generate-content :slackbot :internal]
                [actual-type source-id] [["model" model-id] ["question" question-id] ["metric" metric-id]]
                data-source ["model" "question" "report" "metric"]
                :let [expected-type (if (= data-source "report") "question" data-source)]
                :when (not= actual-type expected-type)]
          (let [{:keys [error output]} (invoke-field-detail profile data-source source-id (mt/id :orders :id))]
            (is (= {:class :recoverable
                    :code (if (= profile :internal)
                            :metabase.metabot.tools.core/all-items-failed
                            ::tools.u/wrong-source-type)} error))
            (is (str/includes? (or output "")
                               (str "Card " source-id " is a " actual-type ", not a " expected-type "."
                                    (if (= profile :internal)
                                      (str "\nRead `metabase://" actual-type "/" source-id
                                           (if (= actual-type "metric") "/dimensions/" "/fields/")
                                           (mt/id :orders :id) "` instead.")
                                      (str "\nRetry using a " expected-type " ID."
                                           "\nSet `data_source` to \"" actual-type
                                           "\" in `get_field_values` for this card.")))))))))))

(deftest question-field-details-use-returned-columns-test
  (mt/as-admin
    (let [mp (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
      (doseq [[display card-query unreturned-id]
              [[:pivot (-> query (lib/aggregate (lib/count))
                           (lib/breakout (lib/with-temporal-bucket
                                           (lib.metadata/field mp (mt/id :orders :created_at)) :month)))
                (mt/id :orders :quantity)]
               [:table (lib/with-fields query [(lib.metadata/field mp (mt/id :orders :product_id))])
                (mt/id :products :category)]]]
        (mt/with-temp [:model/Card {card-id :id} {:type :question :display display :dataset_query card-query}]
          (let [fields (get-in (entity-details/get-table-details
                                {:entity-type :question :entity-id card-id
                                 :with-fields? true :with-field-values? false :with-related-tables? false
                                 :with-metrics? false :with-measures? false :with-segments? false})
                               [:structured-output :fields])
                valid-ids (mapv :field_id fields)
                message (str "Field " unreturned-id " was not found in question " card-id
                             ". Valid field IDs: " (pr-str valid-ids) ".\nRetry with one of these field IDs.")]
            (is (seq fields))
            (doseq [profile [:document-generate-content :slackbot :internal]
                    data-source ["question" "report"]]
              (let [{:keys [error output]} (invoke-field-detail profile data-source card-id unreturned-id)]
                (is (= :recoverable (:class error)))
                (is (str/includes? output message))))))))))

(deftest native-pivot-fields-use-saved-result-metadata-test
  (mt/with-test-user :crowberto
    (let [query (lib/native-query (mt/metadata-provider) "SELECT 17 AS \"bird_count\"")
          columns (-> query qp/process-query :data :results_metadata :columns)]
      (mt/with-temp [:model/Card {card-id :id} {:type :question :display :pivot :dataset_query query
                                                :result_metadata columns}]
        (let [listed (invoke-metadata :internal "read_resource"
                                      {:uris [(str "metabase://question/" card-id "/fields")]})]
          (is (= ["bird_count"] (mapv :field_id (get-in listed [:structured-output 0 :fields])))))
        (doseq [profile [:document-generate-content :slackbot :internal]
                data-source ["question" "report"]]
          (let [result (invoke-field-detail profile data-source card-id "bird_count")]
            (is (nil? (:error result)))
            (is (str/includes? (:output result) "bird_count"))))))))

(deftest empty-field-suggestions-offer-another-source-test
  (mt/as-admin
    (let [query (lib/native-query (mt/metadata-provider) "SELECT 17 AS \"bird_count\"")]
      (mt/with-temp [:model/Card {card-id :id} {:type :question :dataset_query query :result_metadata []}]
        (doseq [profile [:document-generate-content :slackbot :internal]]
          (let [{:keys [error output]} (invoke-field-detail profile "question" card-id "missing")]
            (is (= :recoverable (:class error)))
            (is (str/includes? output
                               (str "Field missing was not found in question " card-id "."
                                    " No accessible field IDs are available for this data source."
                                    "\nChoose another data source.")))))))))

(defn- check-unrestricted-statistics [card-id statistics]
  (doseq [profile [:document-generate-content :slackbot]]
    (let [responses (for [user [:crowberto :rasta]]
                      (mt/with-test-user user
                        (let [result (invoke-metadata profile "get_field_values"
                                                      {:data_source "question" :source_id card-id :field_id "bird_count"})]
                          (is (nil? (:error result)))
                          (is (= {:result-type :field-metadata :field_id "bird_count"
                                  :value_metadata {:statistics statistics}}
                                 (:structured-output result)))
                          result)))]
      (is (apply = responses)))))

(deftest unrestricted-virtual-column-statistics-do-not-require-source-tables-test
  (let [mp (mt/metadata-provider)
        query (lib/native-query mp "SELECT 17 AS \"bird_count\"")
        required-query (lib/native-query mp "SELECT 17 AS \"bird_count\" WHERE 1 < {{max_id}}")
        columns (mt/as-admin (-> query qp/process-query :data :results_metadata :columns))
        statistics (merge {:distinct-count 1 :percent-null 0.0}
                          (get-in columns [0 :fingerprint :type :type/Number]))]
    (doseq [query [query
                   (lib/native-query mp "SELECT 17 AS \"bird_count\" FROM \"missing_statistics_source\"")
                   (lib/with-template-tags required-query
                     (mapv #(assoc % :type :number :required true) (lib/template-tags required-query)))]]
      (mt/with-temp [:model/Card {card-id :id} {:type :question :dataset_query query :result_metadata columns}]
        (check-unrestricted-statistics card-id statistics)))
    (mt/with-temp [:model/Card {card-id :id} {:type :question :dataset_query query :result_metadata columns}]
      (with-redefs [driver.u/trusted-for-table-permissions? #{}]
        (check-unrestricted-statistics card-id statistics)))
    (mt/with-temp [:model/Card {inner-id :id} {:type :question :dataset_query query :result_metadata columns}
                   :model/Card {outer-id :id} {:type :question
                                               :dataset_query (lib/query mp (lib.metadata/card mp inner-id))
                                               :result_metadata columns}]
      (t2/delete! :model/Card :id inner-id)
      (check-unrestricted-statistics outer-id statistics))))

(deftest joined-metric-dimensions-round-trip-test
  (mt/as-admin
    (let [mp (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    (lib/join (lib/join-clause
                               (lib.metadata/table mp (mt/id :reviews))
                               [(lib/= (lib.metadata/field mp (mt/id :orders :product_id))
                                       (lib.metadata/field mp (mt/id :reviews :product_id)))]))
                    (lib/aggregate (lib/count)))]
      (mt/with-temp [:model/Card {metric-id :id} {:type :metric :dataset_query query}]
        (let [dimensions (->> (entity-details/get-metric-details
                               {:metric-id metric-id :with-field-values? false})
                              :structured-output :join-required-dimensions (mapcat :dimensions))
              valid-ids (mapv :field_id dimensions)]
          (is (some #{(mt/id :reviews :rating)} valid-ids))
          (doseq [profile [:document-generate-content :slackbot :internal]]
            (doseq [field-id valid-ids]
              (let [{:keys [error structured-output]} (invoke-field-detail profile "metric" metric-id field-id)]
                (is (nil? error))
                (is (=? {:field_id (if (= profile :internal) (str field-id) field-id)}
                        (if (= profile :internal) (first structured-output) structured-output)))))
            (let [{:keys [output]} (invoke-field-detail profile "metric" metric-id "missing")]
              (is (str/includes? output (str "Field missing was not found in metric " metric-id ".")))
              (doseq [field-id valid-ids]
                (is (str/includes? output (str field-id)))))))))))

(deftest card-resource-types-name-the-real-kind-test
  (mt/as-admin
    (let [mp (mt/metadata-provider)
          query (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
      (doseq [actual-type [:model :question :metric]]
        (mt/with-temp [:model/Card {card-id :id} {:type actual-type
                                                  :dataset_query (if (= actual-type :metric)
                                                                   (lib/aggregate query (lib/count)) query)}]
          (doseq [expected-type [:model :question :metric]
                  :when (not= expected-type actual-type)
                  path (if (= expected-type :metric) ["" "/dimensions"] ["" "/fields" "/sources"])]
            (let [{:keys [error output]} (invoke-metadata :internal "read_resource"
                                                          {:uris [(str "metabase://" (name expected-type)
                                                                       "/" card-id path)]})]
              (is (= :recoverable (:class error)))
              (is (str/includes? output (str "Card " card-id " is a " (name actual-type)
                                             ", not a " (name expected-type) ".")))
              (is (str/includes? output (str "metabase://" (name actual-type) "/" card-id))))))))))

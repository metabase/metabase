(ns metabase.metabot.tools.curated-content-test
  "BOT-1649: with `use_verified_content` on, Metabot tools that read or query entities directly stay within curated
  content, matching the `:curated` filter search applies."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.activity-feed.core :as activity-feed]
   [metabase.api-scope.core :as api-scope]
   [metabase.content-verification.core :as moderation]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.curation :as curation]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.autogen-dashboard :as autogen]
   [metabase.metabot.tools.construct :as construct]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.create-alert :as create-alert]
   [metabase.metabot.tools.explorations :as explorations-tools]
   [metabase.metabot.tools.field-stats :as field-stats]
   [metabase.metabot.tools.metadata :as metadata-tools]
   [metabase.metabot.tools.resources :as read-resource]
   [metabase.metabot.tools.run-query :as run-query]
   [metabase.metabot.tools.runtime :as tools.runtime]
   [metabase.metabot.tools.shared :as tools.shared]
   [metabase.metabot.tools.static-viz :as static-viz]
   [metabase.metabot.tools.subscriptions :as subscriptions]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(def ^:private curation-features
  "The features the verified, official, and Library curation signals are gated on. The test instance holds no
  token, so every test here grants them; [[premium-gates-test]] takes them away again."
  #{:content-verification :official-collections :library})

(use-fixtures :each (fn [thunk] (mt/with-additional-premium-features curation-features (thunk))))

(defn- verify-card! [card-id]
  (moderation/create-review! {:moderated_item_id   card-id
                              :moderated_item_type "card"
                              :moderator_id        (mt/user->id :crowberto)
                              :status              "verified"}))

(defn- orders-query []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :orders)))))

(defn- orders-joined-query
  "ORDERS explicitly joined to `table-kw` on `ORDERS.<fk-kw> = <table-kw>.<pk-kw>`."
  [table-kw fk-kw pk-kw]
  (let [mp (mt/metadata-provider)]
    (lib/join (orders-query)
              (lib/join-clause (lib.metadata/table mp (mt/id table-kw))
                               [(lib/= (lib.metadata/field mp (mt/id :orders fk-kw))
                                       (lib.metadata/field mp (mt/id table-kw pk-kw)))]))))

(defn- count-metric-query [query]
  (lib/aggregate query (lib/count)))

(defn- as-metabot
  "Call `f` as a tool of the Metabot row `metabot` under `profile-id`, with tool state bound the way the runtime
  binds it."
  [metabot profile-id f]
  (binding [tools.shared/*metabot*    metabot
            tools.shared/*profile-id* profile-id]
    (f)))

(def ^:private read-ctx
  {:tool-names #{"read_resource" "search"}})

(defn- read-uris
  "Run `read_resource` on `uris` as a tool of `metabot` under `profile-id`, one entry per URI, as
  `POST /v1/read-resource` reads them."
  [metabot profile-id & uris]
  (as-metabot metabot profile-id
              #(tools/with-batched-entries read-resource/read-resource-tool {:uris (vec uris)} read-ctx nil
                 (fn [entries]
                   (mapv (fn [{:keys [item output failed? structured-output]}]
                           (cond-> {:uri (:uri item)}
                             failed?       (assoc :error (tools/render-text output))
                             (not failed?) (assoc :content {:structured-output structured-output})))
                         entries)))))

(defn- item-ids [resource]
  (into #{} (map :id) (get-in resource [:content :structured-output :items])))

(defn- denied? [resource]
  (boolean (some-> (:error resource) (str/includes? "only uses curated content"))))

(defn- db-name []
  (t2/select-one-fn :name :model/Database :id (mt/id)))

(deftest read-resource-curated-only-tables-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {published :id} {:db_id db-id :name "published_orders" :schema "curated_schema"
                                                 :active true :is_published true :data_layer :final}
                   :model/Table {authoritative :id} {:db_id db-id :name "authoritative_people" :schema "curated_schema"
                                                     :active true :data_authority :authoritative}
                   :model/Table {raw :id} {:db_id db-id :name "raw_products" :schema "raw_schema" :active true}
                   :model/Metabot curated-metabot {:name "curated metabot" :use_verified_content true}
                   :model/Metabot open-metabot {:name "open metabot" :use_verified_content false}]
      (testing "curated-only Metabot"
        (testing "denies uncurated tables and their sub-resources without naming them"
          (doseq [uri [(str "metabase://table/" raw)
                       (str "metabase://table/" raw "/fields")]]
            (let [[resource] (read-uris curated-metabot :internal uri)]
              (is (denied? resource) uri)
              (is (not (str/includes? (:error resource) "raw_products"))))))
        (testing "reads curated tables"
          (is (=? [{:content {:structured-output map?}} {:content {:structured-output map?}}]
                  (read-uris curated-metabot :internal
                             (str "metabase://table/" published)
                             (str "metabase://table/" authoritative)))))
        (testing "lists only curated tables"
          (is (= #{published authoritative}
                 (item-ids (first (read-uris curated-metabot :internal (str "metabase://database/" db-id "/tables"))))))
          (is (= #{}
                 (item-ids (first (read-uris curated-metabot :internal
                                             (str "metabase://database/" db-id "/schemas/raw_schema/tables")))))))
        (testing "lists only schemas holding a curated table"
          (is (= ["curated_schema"]
                 (->> (read-uris curated-metabot :internal (str "metabase://database/" db-id "/schemas"))
                      first :content :structured-output :items (map :name))))))
      (testing "reads and lists everything readable when the Metabot isn't restricted, when no Metabot is bound
                (e.g. the agent API), and for the nlq profile"
        (doseq [[metabot profile-id] [[open-metabot :internal] [nil nil] [curated-metabot :nlq]]]
          (is (not (denied? (first (read-uris metabot profile-id (str "metabase://table/" raw))))))
          (is (= #{published authoritative raw}
                 (item-ids (first (read-uris metabot profile-id
                                             (str "metabase://database/" db-id "/tables")))))))))))

(deftest read-resource-curated-only-cards-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Collection {coll-id :id} {:name "curation test collection"}
                   :model/Card {verified-model :id} {:type :model :name "verified model" :collection_id coll-id
                                                     :dataset_query (orders-query)}
                   :model/Card {plain-model :id} {:type :model :name "plain model" :collection_id coll-id
                                                  :dataset_query (orders-query)}
                   :model/Card {plain-metric :id} {:type :metric :name "plain metric" :collection_id coll-id
                                                   :dataset_query (count-metric-query (orders-query))}
                   :model/Metabot metabot {:name "curated metabot" :use_verified_content true}]
      (verify-card! verified-model)
      (testing "reads an uncurated metric only when what it's defined on is curated, as construct_notebook_query does"
        (is (denied? (first (read-uris metabot :internal (str "metabase://metric/" plain-metric)))))
        (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true :data_layer :final}
          (is (not (denied? (first (read-uris metabot :internal (str "metabase://metric/" plain-metric))))))))
      (testing "denies uncurated cards"
        (is (denied? (first (read-uris metabot :internal (str "metabase://model/" plain-model "/fields"))))))
      (testing "reads curated cards, without their exported definition"
        (let [[resource] (read-uris metabot :internal (str "metabase://model/" verified-model "/fields"))]
          (is (not (denied? resource)))
          (is (map? (get-in resource [:content :structured-output])))
          (is (not (contains? (get-in resource [:content :structured-output]) :query_json))))
        (testing "(the unrestricted Metabot gets the definition)"
          (is (contains? (get-in (first (read-uris nil nil (str "metabase://model/" verified-model)))
                                 [:content :structured-output])
                         :query_json))))
      (testing "lists only curated cards"
        (let [models (item-ids (first (read-uris metabot :internal (str "metabase://database/" (mt/id) "/models"))))]
          (is (contains? models verified-model))
          (is (not (contains? models plain-model))))
        (is (= #{verified-model}
               (item-ids (first (read-uris metabot :internal (str "metabase://collection/" coll-id "/items"))))))))))

(deftest read-resource-curated-only-dashboards-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Collection {official :id} {:authority_level "official"}
                   :model/Dashboard {curated-dash :id} {:name "official dashboard" :collection_id official}
                   :model/Dashboard {plain-dash :id} {:name "plain dashboard"}
                   :model/Metabot metabot {:name "curated metabot" :use_verified_content true}]
      (testing "an uncurated dashboard and its items are denied"
        (is (denied? (first (read-uris metabot :internal (str "metabase://dashboard/" plain-dash)))))
        (is (denied? (first (read-uris metabot :internal (str "metabase://dashboard/" plain-dash "/items"))))))
      (testing "a curated dashboard reads"
        (is (not (denied? (first (read-uris metabot :internal (str "metabase://dashboard/" curated-dash))))))))))

(deftest excluded-signals-test
  (testing "search never returns these, so they aren't curated whatever their signals"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Collection {official :id} {:authority_level "official"}
                     :model/Card {archived :id} {:collection_id official :archived true :dataset_query (orders-query)}
                     :model/Dashboard {archived-dash :id} {:collection_id official :archived true}
                     :model/Document {doc-id :id} {:collection_id official}
                     :model/Card {doc-card :id} {:collection_id official :document_id doc-id
                                                 :dataset_query (orders-query)}
                     :model/Table {hidden :id} {:db_id (mt/id) :name "hidden_authoritative" :active true
                                                :visibility_type :hidden :data_authority :authoritative}
                     :model/Table {live :id} {:db_id (mt/id) :name "live_authoritative" :active true
                                              :data_authority :authoritative}]
        (is (= #{["table" live]}
               (curation/curated-ids [["card" archived] ["dashboard" archived-dash] ["card" doc-card]
                                      ["table" hidden] ["table" live]])))))))

(deftest premium-gates-test
  (testing "verified, official, and Library signals count only while their feature is active; authoritative always"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Collection {official :id} {:authority_level "official"}
                     :model/Card {verified :id} {:dataset_query (orders-query)}
                     :model/Card {in-official :id} {:collection_id official :dataset_query (orders-query)}
                     :model/Table {published :id} {:db_id (mt/id) :name "gated_published" :active true
                                                   :is_published true :data_layer :final}
                     :model/Table {authoritative :id} {:db_id (mt/id) :name "gated_authoritative" :active true
                                                       :data_authority :authoritative}]
        (verify-card! verified)
        (let [items [["card" verified] ["card" in-official] ["table" published] ["table" authoritative]]]
          (is (= (set items) (curation/curated-ids items)))
          (mt/with-premium-features #{}
            (is (= #{["table" authoritative]} (curation/curated-ids items)))))))))

(deftest metric-read-judges-metric-cards-only-test
  (testing "the metric rule judges metric Cards with structured definitions, and nothing else passes through it"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Metabot metabot {:name "curated metabot" :use_verified_content true}
                     :model/Card {native-question :id} {:type :question :name "native question"
                                                        :dataset_query (mt/native-query {:query "SELECT 1"})}
                     :model/Card {plain-model :id} {:type :model :name "plain model"
                                                    :dataset_query (orders-query)}
                     :model/Card {native-metric :id native-metric-eid :entity_id}
                     {:type :metric :name "native metric"
                      :dataset_query (mt/native-query {:query "SELECT count(*) FROM ORDERS"})}
                     :model/Card {verified-native-metric :id}
                     {:type :metric :name "verified native metric"
                      :dataset_query (mt/native-query {:query "SELECT count(*) FROM ORDERS"})}
                     :model/Card {archived-metric :id}
                     {:type :metric :name "archived metric" :archived true
                      :dataset_query (count-metric-query (orders-query))}]
        (verify-card! verified-native-metric)
        (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true :data_layer :final}
          (let [read     (fn [id] (first (read-uris metabot :internal (str "metabase://metric/" id))))
                metadata (fn [id] (as-metabot metabot :internal
                                              #(:structured-output (metadata-tools/get-metadata {:metric-ids [id]}))))
                query    (fn [metric-eid]
                           {:lib/type "mbql/query"
                            :stages   [{:lib/type     "mbql.stage/mbql"
                                        :source-table [(db-name) "PUBLIC" "ORDERS"]
                                        :aggregation  [["metric" {} metric-eid]]}]})]
            (testing "an uncurated native question isn't readable through the metric URI"
              (is (denied? (read native-question)))
              (is (some #(str/includes? % "only uses curated content") (:errors (metadata native-question)))))
            (testing "an uncurated model on a curated table isn't readable through the metric URI"
              (is (denied? (read plain-model)))
              (is (some #(str/includes? % "only uses curated content") (:errors (metadata plain-model)))))
            (testing "an uncurated metric with a native definition is denied: it references no tables to judge it by"
              (is (denied? (read native-metric)))
              (testing "and construct_notebook_query fails closed on it (resolve rejects it before the rule runs)"
                (is (thrown-with-msg? clojure.lang.ExceptionInfo #"."
                                      (as-metabot metabot :internal
                                                  #(construct/execute-representations-query
                                                    (query native-metric-eid)))))))
            (testing "an archived uncurated metric on a curated table is denied"
              (is (denied? (read archived-metric))))
            (testing "a curated metric with a native definition is readable, being curated itself"
              (is (not (denied? (read verified-native-metric)))))))))))

(deftest curated-non-metric-card-through-metric-paths-test
  (testing "a curated Card named where a metric is expected passes on its own curation, as the unrestricted Metabot
            reads it through the same paths, and an uncurated question referenced as a metric fails closed"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {model-id :id} {:type :model :name "verified model" :dataset_query (orders-query)}
                     :model/Card {question-id :id} {:type :question :name "plain question"
                                                    :dataset_query (orders-query)}
                     :model/Metabot metabot {:name "curated metabot" :use_verified_content true}]
        (verify-card! model-id)
        (testing "read_resource metric URI"
          (is (not (denied? (first (read-uris metabot :internal (str "metabase://metric/" model-id)))))))
        (testing "list_available_fields metric_ids"
          (is (not-any? #(str/includes? % "only uses curated content")
                        (as-metabot metabot :internal
                                    #(:errors (:structured-output
                                               (metadata-tools/get-metadata {:metric-ids [model-id]})))))))
        (testing "a question referenced as a metric in a query is judged as missing, not by its definition"
          (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true :data_layer :final}
            (is (= [["card" question-id]]
                   (curation/uncurated-query-sources
                    (lib/query (mt/metadata-provider)
                               {:database (mt/id)
                                :type     :query
                                :query    {:source-table (mt/id :orders)
                                           :aggregation  [["metric" question-id]]}}))))))))))

(deftest curated-question-fields-stay-within-its-results-test
  (testing "a verified question's field reads expose its own result columns, not every column of the raw table it
            reads: REVIEWS is neither curated nor FK-related to the question's results, and construct_notebook_query
            rejects joining it to the question"
    (mt/with-current-user (mt/user->id :crowberto)
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {question-id :id} {:type          :question
                                                      :name          "verified review count"
                                                      :dataset_query (lib/aggregate
                                                                      (lib/query mp (lib.metadata/table
                                                                                     mp (mt/id :reviews)))
                                                                      (lib/count))}
                       :model/Metabot metabot {:name "curated metabot" :use_verified_content true}]
          (verify-card! question-id)
          (let [rating (mt/id :reviews :rating)]
            (testing "construct_notebook_query's rule rejects the raw table joined to the question"
              (let [on-question (lib/query mp (lib.metadata/card mp question-id))
                    joined      (lib/join on-question
                                          (lib/join-clause (lib.metadata/table mp (mt/id :reviews))
                                                           [(lib/= (first (lib/returned-columns on-question))
                                                                   (lib.metadata/field mp (mt/id :reviews :id)))]))]
                (is (= [["table" (mt/id :reviews)]] (curation/uncurated-query-sources joined)))))
            (testing "read_resource doesn't serve the raw table's column through the question"
              (let [[resource] (read-uris metabot :internal
                                          (str "metabase://question/" question-id "/fields/" rating))]
                (is (nil? (get-in resource [:content :structured-output :value_metadata])))))
            (testing "get_field_values doesn't either"
              (is (nil? (get-in (as-metabot metabot :internal
                                            #(metadata-tools/get-field-values-tool {:data_source "question"
                                                                                    :source_id   question-id
                                                                                    :field_id    rating}))
                                [:structured-output :value_metadata]))))))))))

(deftest field-values-follow-the-definition-not-edited-metadata-test
  (testing "a curated model whose result metadata maps a column to a field of a table its definition never reads
            doesn't serve that field's values"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {model-id :id} {:type :model :name "verified orders model"
                                                 :dataset_query (orders-query)}
                     :model/Metabot metabot {:name "curated metabot" :use_verified_content true}]
        (let [rating (mt/id :reviews :rating)
              total  (mt/id :orders :total)
              ;; point one result column at REVIEWS.RATING, a field no FK from ORDERS reaches; verified afterwards,
              ;; since editing a verified card unverifies it
              _      (t2/update! :model/Card model-id
                                 {:result_metadata [{:name "TOTAL" :display_name "Total" :base_type :type/Float
                                                     :id total :table_id (mt/id :orders)}
                                                    {:name "RATING" :display_name "Rating" :base_type :type/Integer
                                                     :id rating :table_id (mt/id :reviews)}]})
              _      (verify-card! model-id)
              read   (fn [field-id]
                       (as-metabot metabot :internal
                                   #(metadata-tools/get-field-values-tool {:data_source "model"
                                                                           :source_id   model-id
                                                                           :field_id    field-id})))]
          (is (some? (get-in (read total) [:structured-output :value_metadata])))
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"only uses curated content" (read rating)))
          (testing "(the unrestricted Metabot serves it)"
            (is (some? (get-in (as-metabot nil nil
                                           #(metadata-tools/get-field-values-tool {:data_source "model"
                                                                                   :source_id   model-id
                                                                                   :field_id    rating}))
                               [:structured-output :value_metadata])))))))))

(deftest covered-metric-as-source-card-test
  (testing "an uncurated metric that passes the metric rule may be a query's source card, as it may be read and used in
            an aggregation; one that doesn't pass is still rejected"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {metric-id :id metric-eid :entity_id}
                     {:type          :metric
                      :name          "plain metric"
                      :dataset_query (count-metric-query (orders-query))}
                     :model/Metabot metabot {:name "curated metabot" :use_verified_content true}]
        (let [q         {:lib/type "mbql/query"
                         :stages   [{:lib/type "mbql.stage/mbql" :source-card metric-eid}]}
              construct (fn [metabot profile-id]
                          (as-metabot metabot profile-id #(construct/execute-representations-query q)))
              rejected? (fn []
                          (try
                            (construct metabot :internal)
                            false
                            (catch clojure.lang.ExceptionInfo e
                              (if (= :uncurated-source (:error (ex-data e))) true (throw e)))))]
          (testing "the query is valid without a restricted Metabot"
            (is (some? (:structured-output (construct nil nil)))))
          (testing "over a raw table the metric is rejected as a source"
            (is (rejected?)))
          (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true :data_layer :final}
            (testing "over a curated table it is readable"
              (is (not (denied? (first (read-uris metabot :internal (str "metabase://metric/" metric-id)))))))
            (testing "and queryable as a source card"
              (is (not (rejected?))))))))))

(deftest curated-question-read-as-metric-stays-within-its-results-test
  (testing "a verified question named where a metric is expected exposes its results, as it does through its own
            URI, not the raw tables its definition joins: metric/{id}/dimensions must not offer REVIEWS' columns as
            join-required dimensions when construct_notebook_query rejects that join"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {question-id :id} {:type          :question
                                                    :name          "verified orders with reviews count"
                                                    :dataset_query (count-metric-query
                                                                    (orders-joined-query :reviews :product_id
                                                                                         :product_id))}
                     :model/Metabot metabot {:name "curated metabot" :use_verified_content true}]
        (verify-card! question-id)
        (let [so (get-in (first (read-uris metabot :internal (str "metabase://metric/" question-id "/dimensions")))
                         [:content :structured-output])]
          (is (map? so))
          (is (nil? (:join-required-dimensions so))))))))

(deftest inactive-table-reads-as-missing-test
  (testing "a deactivated table reads as missing, as it does for the unrestricted Metabot, not as uncurated"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Table {inactive :id} {:db_id (mt/id) :name "dropped_raw_table" :active false}
                     :model/Metabot metabot {:name "curated metabot" :use_verified_content true}]
        (let [uri (str "metabase://table/" inactive)]
          (testing "read_resource"
            (let [[resource] (read-uris metabot :internal uri)]
              (is (some? (:error resource)))
              (is (not (denied? resource)))
              (is (= (:error (first (read-uris nil nil uri))) (:error resource)))))
          (testing "list_available_fields"
            (is (not-any? #(str/includes? % "only uses curated content")
                          (as-metabot metabot :internal
                                      #(:errors (:structured-output
                                                 (metadata-tools/get-metadata {:table-ids [inactive]}))))))))))))

(deftest curated-entity-details-list-only-usable-metrics-test
  (testing "a curated table's or model's details list only the metrics this Metabot may use: a metric on curated
            ORDERS (or on a verified model over it) that joins raw REVIEWS fails the rule, so metric/{id} denies it and
            table/{ORDERS} and model/{id} must not list it; a metric that passes the rule stays listed"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {good-metric :id} {:type          :metric
                                                    :name          "orders count"
                                                    :dataset_query (count-metric-query (orders-query))}
                     :model/Card {bad-metric :id} {:type          :metric
                                                   :name          "orders joined to raw reviews"
                                                   :dataset_query (count-metric-query
                                                                   (orders-joined-query :reviews :product_id
                                                                                        :product_id))}
                     :model/Card {model-id :id} {:type :model :name "verified orders model"
                                                 :dataset_query (orders-query)}
                     :model/Metabot metabot {:name "curated metabot" :use_verified_content true}]
        (verify-card! model-id)
        (let [mp         (mt/metadata-provider)
              on-model   (lib/query mp (lib.metadata/card mp model-id))
              product-id (some #(when (= "PRODUCT_ID" (:name %)) %) (lib/returned-columns on-model))]
          (mt/with-temp [:model/Card {bad-model-metric :id}
                         {:type          :metric
                          :name          "model joined to raw reviews"
                          :dataset_query (count-metric-query
                                          (lib/join on-model
                                                    (lib/join-clause
                                                     (lib.metadata/table mp (mt/id :reviews))
                                                     [(lib/= product-id
                                                             (lib.metadata/field mp (mt/id :reviews :product_id)))])))}]
            (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true :data_layer :final}
              (let [listed (fn [uri]
                             (let [so (get-in (first (read-uris metabot :internal uri))
                                              [:content :structured-output])]
                               (is (map? so) uri)
                               (into #{} (map :id) (:metrics so))))]
                (testing "the failing metrics themselves are denied"
                  (is (denied? (first (read-uris metabot :internal (str "metabase://metric/" bad-metric)))))
                  (is (denied? (first (read-uris metabot :internal (str "metabase://metric/" bad-model-metric))))))
                (testing "table/{ORDERS} lists the passing metric and not the failing one"
                  (let [ids (listed (str "metabase://table/" (mt/id :orders)))]
                    (is (contains? ids good-metric))
                    (is (not (contains? ids bad-metric)))))
                (testing "model/{id} doesn't list the failing metric defined on it"
                  (is (not (contains? (listed (str "metabase://model/" model-id)) bad-model-metric))))))))))))

(deftest read-resource-curated-only-recents-test
  (testing "recent items (which carry keyword models) are filtered like any other list"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-model-cleanup [:model/RecentViews]
        (mt/with-temp [:model/Card {verified-model :id} {:type :model :name "verified recent model"
                                                         :dataset_query (orders-query)}
                       :model/Card {plain-question :id} {:type :question :name "plain recent question"
                                                         :dataset_query (orders-query)}
                       :model/Table {raw-table :id} {:db_id (mt/id) :name "raw_recent_table" :active true}
                       :model/Metabot metabot {:name "curated metabot" :use_verified_content true}]
          (verify-card! verified-model)
          (doseq [[model id] [[:model/Card verified-model] [:model/Card plain-question] [:model/Table raw-table]]]
            (activity-feed/update-users-recent-views! (mt/user->id :crowberto) model id :view))
          (let [items (fn [metabot]
                        (filterv (comp #{["model" verified-model] ["question" plain-question] ["table" raw-table]}
                                       (juxt :type :id))
                                 (get-in (first (read-uris metabot :internal "metabase://user/recent-items"))
                                         [:content :structured-output :items])))]
            ;; key on type and id: a temp Card's id can coincide with a temp Table's
            (is (=? [{:type "model" :id verified-model}] (items metabot)))
            (testing "the unrestricted Metabot lists them all, with their public types and URIs"
              (is (=? [{:type "table" :uri (str "metabase://table/" raw-table)}
                       {:type "question" :uri (str "metabase://question/" plain-question)}
                       {:type "model" :uri (str "metabase://model/" verified-model)}]
                      (items nil))))))))))

(deftest curation-subject-test
  (testing "transforms can never be curated"
    (is (= ["transform" 1]
           (#'read-resource/curation-subject ["transform" "1" "sources"]))))
  (testing "navigation and table dependents aren't gated per entity"
    (is (nil? (#'read-resource/curation-subject ["databases"])))
    (is (nil? (#'read-resource/curation-subject ["collection" "1" "items"])))
    (is (nil? (#'read-resource/curation-subject ["table" "1" "derived"]))))
  (testing "tables, cards, and dashboards are judged as themselves"
    (is (= ["table" 1] (#'read-resource/curation-subject ["table" "1" "fields" "c75"])))
    (is (= ["metric" 2] (#'read-resource/curation-subject ["metric" "2" "dimensions"])))
    (is (= ["dashboard" 3] (#'read-resource/curation-subject ["dashboard" "3" "items"])))))

(defn- rejected?
  "Whether `construct_notebook_query` rejects `q` as uncurated for `metabot` under `profile-id`."
  [metabot profile-id q]
  (try
    (as-metabot metabot profile-id #(construct/execute-representations-query q))
    false
    (catch clojure.lang.ExceptionInfo e
      (if (= :uncurated-source (:error (ex-data e)))
        true
        (throw e)))))

(deftest construct-query-curated-only-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card {verified-model :id verified-eid :entity_id} {:type :model :name "verified model"
                                                                             :dataset_query (orders-query)}
                   :model/Card {plain-eid :entity_id} {:type :model :name "plain model"
                                                       :dataset_query (orders-query)}
                   :model/Card {verified-metric :id verified-metric-eid :entity_id}
                   {:type :metric :name "verified metric" :dataset_query (count-metric-query (orders-query))}
                   :model/Card {plain-metric :id plain-metric-eid :entity_id}
                   {:type :metric :name "plain metric" :dataset_query (count-metric-query (orders-query))}
                   :model/Card {nested-metric-eid :entity_id}
                   {:type :metric :name "plain metric built on the plain metric"
                    :dataset_query {:database (mt/id)
                                    :type     :query
                                    :query    {:source-table (mt/id :orders)
                                               :aggregation  [["metric" plain-metric]]}}}
                   :model/Card {nested-on-verified :id nested-on-verified-eid :entity_id}
                   {:type :metric :name "plain metric built on the verified metric"
                    :dataset_query {:database (mt/id)
                                    :type     :query
                                    :query    {:source-table (mt/id :orders)
                                               :aggregation  [["metric" verified-metric]]}}}
                   :model/Card {verified-join-metric :id verified-join-metric-eid :entity_id}
                   {:type :metric :name "verified metric joining an unrelated table"
                    :dataset_query (count-metric-query (orders-joined-query :reviews :product_id :product_id))}
                   :model/Card {related-join-metric-eid :entity_id}
                   {:type :metric :name "plain metric joining a related table"
                    :dataset_query (count-metric-query (orders-joined-query :products :product_id :id))}
                   :model/Card {unrelated-join-metric-eid :entity_id}
                   {:type :metric :name "plain metric joining an unrelated table"
                    :dataset_query (count-metric-query (orders-joined-query :reviews :product_id :product_id))}
                   :model/Card {model-metric-eid :entity_id}
                   {:type :metric :name "plain metric on a model"
                    :dataset_query (let [mp (mt/metadata-provider)]
                                     (count-metric-query (lib/query mp (lib.metadata/card mp verified-model))))}
                   :model/Metabot metabot {:name "curated metabot" :use_verified_content true}]
      (verify-card! verified-model)
      (verify-card! verified-metric)
      (verify-card! verified-join-metric)
      (let [db-name        (db-name)
            stage          (fn [source] (merge {:lib/type "mbql.stage/mbql" :aggregation [["count" {}]]} source))
            query          (fn [source] {:lib/type "mbql/query" :stages [(stage source)]})
            orders-query   (query {:source-table [db-name "PUBLIC" "ORDERS"]})
            products-query (query {:source-table [db-name "PUBLIC" "PRODUCTS"]})
            joined-query   (assoc-in orders-query [:stages 0 :breakout]
                                     [["field" {:source-field [db-name "PUBLIC" "ORDERS" "PRODUCT_ID"]}
                                       [db-name "PUBLIC" "PRODUCTS" "CATEGORY"]]])
            ;; raw PRODUCTS as the source, explicitly joined to ORDERS
            products-joined-query
            (assoc-in products-query [:stages 0 :joins]
                      [{:lib/type   "mbql/join"
                        :fields     "all"
                        :strategy   "left-join"
                        :alias      "Orders"
                        :conditions [["=" {}
                                      ["field" {} [db-name "PUBLIC" "PRODUCTS" "ID"]]
                                      ["field" {:join-alias "Orders"} [db-name "PUBLIC" "ORDERS" "PRODUCT_ID"]]]]
                        :stages     [{:lib/type "mbql.stage/mbql" :source-table [db-name "PUBLIC" "ORDERS"]}]}])
            metric-query   (fn [metric-eid]
                             (assoc-in orders-query [:stages 0 :aggregation] [["metric" {} metric-eid]]))
            construct      (fn [metabot profile-id q]
                             (as-metabot metabot profile-id #(construct/execute-representations-query q)))
            accepted?      (fn [q] (some? (:structured-output (construct metabot :internal q))))]
        (testing "a raw table is rejected for a curated-only Metabot"
          (is (rejected? metabot :internal orders-query)))
        (testing "a raw table is queryable without a restricted Metabot, and for the nlq profile"
          (is (some? (:structured-output (construct nil nil orders-query))))
          (is (some? (:structured-output (construct metabot :nlq orders-query)))))
        (testing "a curated table is queryable"
          (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true :data_layer :final}
            (is (accepted? orders-query))
            (testing "along with the related tables it exposes, joined implicitly"
              (is (accepted? joined-query)))
            (testing "and the metrics defined on it, curated or not"
              (is (accepted? (metric-query plain-metric-eid)))
              (testing "as long as everything the metric's definition reads is curated or covered"
                (is (accepted? (metric-query related-join-metric-eid)))
                (is (rejected? metabot :internal (metric-query unrelated-join-metric-eid))))
              (testing "including a metric built on another uncurated metric over the curated table"
                (is (accepted? (metric-query nested-metric-eid)))))
            (testing "but a related table is still not a source of its own"
              (is (rejected? metabot :internal products-query))
              (testing "even when joined to the curated table"
                (is (rejected? metabot :internal products-joined-query))))))
        (testing "an uncurated metric defined on a curated model is accepted"
          (is (accepted? (assoc-in (query {:source-card verified-eid}) [:stages 0 :aggregation]
                                   [["metric" {} model-metric-eid]]))))
        (testing "a curated metric covers the raw table it's defined on, and that table's related tables"
          (is (accepted? (metric-query verified-metric-eid)))
          (is (accepted? (assoc-in (metric-query verified-metric-eid) [:stages 0 :breakout]
                                   (get-in joined-query [:stages 0 :breakout])))))
        (testing "an uncurated metric on a raw table is rejected"
          (is (rejected? metabot :internal (metric-query plain-metric-eid))))
        (testing "read_resource and construct_notebook_query agree on metrics over a raw table"
          (testing "a plain metric next to the verified one is rejected on both sides"
            (is (rejected? metabot :internal
                           (assoc-in orders-query [:stages 0 :aggregation]
                                     [["metric" {} verified-metric-eid] ["metric" {} plain-metric-eid]])))
            (is (denied? (first (read-uris metabot :internal (str "metabase://metric/" plain-metric))))))
          (testing "a plain metric built on the verified metric is accepted on both sides"
            (is (accepted? (metric-query nested-on-verified-eid)))
            (is (not (denied? (first (read-uris metabot :internal
                                                (str "metabase://metric/" nested-on-verified))))))))
        (testing "a table a curated metric only joins is not a source of its own"
          (is (rejected? metabot :internal
                         (assoc-in (query {:source-table [db-name "PUBLIC" "REVIEWS"]}) [:stages 0 :aggregation]
                                   [["metric" {} verified-join-metric-eid]]))))
        (testing "a table a curated metric joins widens coverage no further: PRODUCTS is one hop from ORDERS, so a
                  breakout on it passes, but REVIEWS' own FK targets don't become joinable through the metric"
          (is (accepted? (assoc-in (metric-query verified-join-metric-eid) [:stages 0 :breakout]
                                   (get-in joined-query [:stages 0 :breakout])))))
        (testing "source cards must be curated"
          (is (accepted? (query {:source-card verified-eid})))
          (is (rejected? metabot :internal (query {:source-card plain-eid}))))))))

(deftest construct-query-coarse-gate-runs-before-repair-test
  (testing "a query on a raw table with a column that doesn't exist is refused as uncurated, before repair can list
            the table's columns"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Metabot metabot {:name "curated metabot" :use_verified_content true}]
        (let [db-name (db-name)
              q       {:lib/type "mbql/query"
                       :stages   [{:lib/type     "mbql.stage/mbql"
                                   :source-table [db-name "PUBLIC" "PRODUCTS"]
                                   :breakout     [["field" {} [db-name "PUBLIC" "PRODUCTS" "NO_SUCH_COLUMN"]]]}]}]
          (is (rejected? metabot :internal q))
          (testing "(the unrestricted Metabot gets the column error)"
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"(?i)column|field"
                                  (as-metabot nil nil #(construct/execute-representations-query q))))))))))

(deftest measures-and-segments-follow-their-tables-test
  (testing "a measure or segment is usable only when its table and the tables its definition reads are curated or
            covered"
    (mt/with-current-user (mt/user->id :crowberto)
      (let [mp            (mt/metadata-provider)
            reviews-count (lib/aggregate (lib/query mp (lib.metadata/table mp (mt/id :reviews))) (lib/count))
            orders-count  (count-metric-query (orders-query))]
        (mt/with-temp [:model/Measure {raw-measure :id} {:name "reviews count" :table_id (mt/id :reviews)
                                                         :definition reviews-count}
                       :model/Measure {orders-measure :id} {:name "orders count" :table_id (mt/id :orders)
                                                            :definition orders-count}
                       :model/Segment {raw-segment :id}
                       {:name       "rated"
                        :table_id   (mt/id :reviews)
                        :definition (lib/filter (lib/query mp (lib.metadata/table mp (mt/id :reviews)))
                                                (lib/> (lib.metadata/field mp (mt/id :reviews :rating)) 3))}]
          (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true :data_layer :final}
            (let [on-orders (fn [aggregation]
                              (lib/query mp {:database (mt/id)
                                             :type     :query
                                             :query    {:source-table (mt/id :orders)
                                                        :aggregation  [aggregation]}}))]
              (is (= [] (curation/uncurated-query-sources (on-orders [:measure orders-measure]))))
              (is (= [[:measure raw-measure]] (curation/uncurated-query-sources (on-orders [:measure raw-measure]))))
              (is (= [[:measure Integer/MAX_VALUE]]
                     (curation/uncurated-query-sources (on-orders [:measure Integer/MAX_VALUE])))
                  "a missing measure fails closed")
              (is (= [[:segment raw-segment]]
                     (curation/uncurated-query-sources
                      (lib/query mp {:database (mt/id)
                                     :type     :query
                                     :query    {:source-table (mt/id :orders)
                                                :filter       [:segment raw-segment]}})))))))))))

(deftest run-query-viewed-question-test
  (testing "run_query reads a saved question the user is viewing only when read_resource would"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {verified :id} {:dataset_query (count-metric-query (orders-query))}
                     :model/Card {plain :id} {:dataset_query (count-metric-query (orders-query))}
                     :model/Metabot metabot {:name "curated metabot" :use_verified_content true}
                     :model/MetabotConversation {conversation-id :id} {:user_id (mt/user->id :crowberto)}]
        (verify-card! verified)
        (let [run (fn [card-id]
                    (mt/with-temporary-setting-values [metabot-query-execution-enabled? true]
                      (as-metabot metabot :internal
                                  #(binding [tools.shared/*memory-atom*
                                             (atom {:conversation-id conversation-id
                                                    :state           {:queries {}}
                                                    :context         {:user_is_viewing [{:type "question"
                                                                                         :id   card-id}]}})]
                                     (run-query/run-query-tool {:query_id (str card-id)})))))]
          (is (str/includes? (:output (run verified)) "Count"))
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"only uses curated content" (run plain))))))))

(deftest id-taking-tools-curated-only-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card {plain :id} {:dataset_query (orders-query)}
                   :model/Dashboard {plain-dash :id} {}
                   :model/Metabot metabot {:name "curated metabot" :use_verified_content true}]
      (as-metabot metabot :internal
                  (fn []
                    (testing "create_autogenerated_dashboard"
                      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"only uses curated content"
                                            (autogen/create-autogenerated-dashboard-tool
                                             {:source {:table_id (mt/id :orders)}})))
                      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"only uses curated content"
                                            (autogen/create-autogenerated-dashboard-tool
                                             {:source {:report_id plain}}))))
                    (testing "static_viz"
                      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"only uses curated content"
                                            (static-viz/static-viz-tool {:entity_id plain}))))
                    (testing "create_alert"
                      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"only uses curated content"
                                            (create-alert/create-alert-tool
                                             {:card_id        plain
                                              :send_condition "has_result"
                                              :schedule       {:frequency "daily" :hour 9}}))))
                    (testing "create_dashboard_subscription"
                      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"only uses curated content"
                                            (subscriptions/create-dashboard-subscription-tool
                                             {:dashboard_id  plain-dash
                                              :slack_channel "#general"
                                              :schedule      {:frequency "daily" :hour 9}})))))))))

(deftest read-resource-curated-check-ordering-test
  (testing "the curation check runs after the entity's existence and read checks, but before its handler"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Metabot metabot {:name "curated metabot" :use_verified_content true}]
        (testing "a missing table reads as missing, not as uncurated"
          (let [[resource] (read-uris metabot :internal "metabase://table/2147483647")]
            (is (some? (:error resource)))
            (is (not (denied? resource)))))
        (testing "a missing transform reads as missing, not as uncurated"
          (let [[resource] (read-uris metabot :internal "metabase://transform/2147483647")]
            (is (some? (:error resource)))
            (is (not (denied? resource)))))
        (testing "a card on a routing destination database reads as missing, not as uncurated"
          (mt/with-temp [:model/Database {router-id :id}      {}
                         :model/Database {destination-id :id} {:router_database_id router-id}
                         :model/Card     {card-id :id}        {:type :model :database_id destination-id}]
            (let [[resource] (read-uris metabot :internal (str "metabase://model/" card-id))]
              (is (some? (:error resource)))
              (is (not (denied? resource))))))
        (testing "a denied URI does none of its handler's work (field values and fingerprints aren't computed)"
          (mt/with-dynamic-fn-redefs [field-stats/field-values
                                      (fn [& _] (throw (ex-info "handler ran for a denied URI" {})))]
            (let [uri (str "metabase://table/" (mt/id :orders) "/fields/" (mt/id :orders :total))]
              (is (denied? (first (read-uris metabot :internal uri)))))))))
    (testing "an unreadable table doesn't reveal whether it's curated"
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table {published :id} {:db_id db-id :name "hidden_published" :active true
                                                   :is_published true :data_layer :final}
                     :model/Table {raw :id} {:db_id db-id :name "hidden_raw" :active true}
                     :model/Metabot metabot {:name "curated metabot" :use_verified_content true}]
        (mt/with-no-data-perms-for-all-users!
          (mt/with-current-user (mt/user->id :rasta)
            (let [errors (mapv #(:error (first (read-uris metabot :internal (str "metabase://table/" %))))
                               [published raw])]
              (is (every? some? errors))
              (is (not-any? #(str/includes? % "only uses curated content") errors))
              (is (every? #(str/includes? % "was not found") errors)))))))))

(deftest read-resource-curated-action-uri-test
  (testing "an action dashcard keeps its backing model's uri only when that model is curated"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Collection {official :id} {:authority_level "official"}]
        (mt/with-actions [{model-id :id} {:type :model :dataset_query (orders-query)}
                          {:keys [action-id]} {:type :query :visualization_settings {}}]
          (mt/with-temp [:model/Dashboard {dash-id :id} {:collection_id official}
                         :model/DashboardCard _ {:dashboard_id dash-id :card_id model-id :action_id action-id
                                                 :row 0 :col 0 :size_x 4 :size_y 1
                                                 :visualization_settings {:button.label "Create Row"}}
                         :model/Metabot metabot {:name "curated metabot" :use_verified_content true}]
            (let [action-uris (fn []
                                (into []
                                      (keep :uri)
                                      (get-in (first (read-uris metabot :internal
                                                                (str "metabase://dashboard/" dash-id "/items")))
                                              [:content :structured-output :items])))]
              (is (= [] (action-uris)))
              (verify-card! model-id)
              (is (= [(str "metabase://model/" model-id)] (action-uris))))))))))

(deftest metadata-tools-curated-only-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Metabot metabot {:name "curated metabot" :use_verified_content true}
                   :model/Card {plain-metric :id} {:type :metric :name "plain metric"
                                                   :dataset_query (count-metric-query (orders-query))}]
      (as-metabot metabot :internal
                  (fn []
                    (testing "list_available_fields reports uncurated tables as errors"
                      (let [{:keys [tables errors]} (:structured-output
                                                     (metadata-tools/get-metadata {:table-ids [(mt/id :orders)]}))]
                        (is (empty? tables))
                        (is (some #(str/includes? % "only uses curated content") errors))))
                    (testing "get_field_values rejects uncurated tables"
                      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"only uses curated content"
                                            (metadata-tools/get-field-values-tool
                                             {:data_source "table"
                                              :source_id   (mt/id :orders)
                                              :field_id    (mt/id :orders :total)}))))
                    (testing "curated tables are readable"
                      (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true :data_layer :final}
                        (is (=? {:structured-output {:tables [{:id (mt/id :orders)}]}}
                                (metadata-tools/get-metadata {:table-ids [(mt/id :orders)]})))
                        (testing "and so are the metrics defined on them"
                          (is (=? {:structured-output {:metrics [{:id plain-metric}]}}
                                  (metadata-tools/get-metadata {:metric-ids [plain-metric]}))))
                        (is (some? (metadata-tools/get-field-values-tool
                                    {:data_source "table"
                                     :source_id   (mt/id :orders)
                                     :field_id    (mt/id :orders :total)}))))))))))

(def ^:private curated-probe-tool
  "A tool that reports whether the session it runs in is restricted to curated content."
  (reify tools/Tool
    (declaration [_] {:name "curated_probe" :description "Reports the session's curation verdict."
                      :args [:map {:closed true}]})
    (handle [_ _args _ctx] {:output (str (tools.shared/curated-only?))})))

(deftest runtime-binds-the-curated-only-verdict-test
  (testing "the tool runtime binds the session's Metabot and profile, from which curated-only? is derived"
    (mt/with-temp [:model/Metabot curated {:name "curated metabot" :use_verified_content true}
                   :model/Metabot open    {:name "open metabot" :use_verified_content false}]
      (let [entries (tools/entries [curated-probe-tool])
            probe   (fn [metabot profile-id]
                      (binding [scope/*current-user-scope* #{"agent:content:read"}]
                        (:output (tools.runtime/invoke entries
                                                       {:profile-id profile-id
                                                        :metabot    metabot
                                                        :tool-names #{"curated_probe"}
                                                        :user-scope api-scope/unrestricted}
                                                       "curated_probe" {}))))]
        (is (false? (tools.shared/curated-only?)) "unbound outside a session")
        (is (= "true" (probe curated :internal)))
        (is (= "false" (probe curated :nlq)) "the nlq profile is exempt")
        (is (= "false" (probe curated :nlq-fallback)))
        (is (= "false" (probe open :internal)))
        (is (= "false" (probe nil :internal)))))))

(deftest construct-coarse-gate-runs-before-repair-test
  (testing "the gate before repair rejects an uncurated source whatever else the query names, so repair never lists
            its columns: an unusable metric, a metric reference without options, or a joined uncurated card"
    (mt/with-current-user (mt/user->id :crowberto)
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {raw-metric-eid :entity_id} {:type          :metric
                                                                :name          "raw orders count"
                                                                :dataset_query (count-metric-query (orders-query))}
                       :model/Card {verified-metric-eid :entity_id verified-metric :id}
                       {:type :metric :name "verified orders count" :dataset_query (count-metric-query (orders-query))}
                       :model/Card {plain-model-eid :entity_id} {:type          :model
                                                                 :name          "plain products model"
                                                                 :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :products)))}
                       :model/Metabot metabot {:name "curated metabot" :use_verified_content true}]
          (verify-card! verified-metric)
          (let [db-name   (db-name)
                error-of  (fn [q]
                            (try
                              (as-metabot metabot :internal #(construct/execute-representations-query q))
                              nil
                              (catch clojure.lang.ExceptionInfo e
                                (ex-data e))))
                bad-field ["field" {} [db-name "PUBLIC" "ORDERS" "NO_SUCH_COLUMN"]]
                query     (fn [stage]
                            {:lib/type "mbql/query"
                             :stages   [(merge {:lib/type "mbql.stage/mbql" :source-table [db-name "PUBLIC" "ORDERS"]}
                                               stage)]})]
            (testing "a metric this Metabot may not use doesn't authorize its table: rejected before repair"
              (is (= :uncurated-source
                     (:error (error-of (query {:aggregation [["metric" {} raw-metric-eid]] :breakout [bad-field]}))))))
            (testing "a metric reference without its options map is read the same way"
              (is (= :uncurated-source
                     (:error (error-of (query {:aggregation [["metric" raw-metric-eid]] :breakout [bad-field]}))))))
            (testing "a curated metric authorizes its own table as the source, so the query reaches repair"
              (is (= :unknown-field
                     (:error (error-of (query {:aggregation [["metric" {} verified-metric-eid]] :breakout [bad-field]}))))))
            (testing "a joined uncurated card is rejected before repair, even under a curated source"
              (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true :data_layer :final}
                (is (= :uncurated-source
                       (:error (error-of
                                (query {:aggregation [["count" {}]]
                                        :joins       [{:lib/type   "mbql/join"
                                                       :fields     "all"
                                                       :strategy   "left-join"
                                                       :alias      "P"
                                                       :conditions [["=" {}
                                                                     ["field" {} [db-name "PUBLIC" "ORDERS" "PRODUCT_ID"]]
                                                                     ["field" {:join-alias "P"} ["card" plain-model-eid "NO_SUCH"]]]]
                                                       :stages     [{:lib/type "mbql.stage/mbql" :source-card plain-model-eid}]}]})))))))
            (testing "each uncurated entity is listed once"
              (is (= [["table" (mt/id :orders)]]
                     (:uncurated (error-of (query {:breakout [bad-field]}))))))))))))

(deftest run-query-conversation-query-curated-only-test
  (testing "run_query and create_autogenerated_dashboard judge a query the conversation holds, which may come from the
            user's viewing context unjudged"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Metabot metabot {:name "curated metabot" :use_verified_content true}
                     :model/MetabotConversation {conversation-id :id} {:user_id (mt/user->id :crowberto)}]
        (let [orders-count {:database (mt/id)
                            :type     :query
                            :query    {:source-table (mt/id :orders) :aggregation [[:count]]}}
              with-query   (fn [f]
                             (as-metabot metabot :internal
                                         #(binding [tools.shared/*memory-atom* (atom {:conversation-id conversation-id
                                                                                      :state           {:queries {"adhoc" orders-count}}
                                                                                      :context         {}})]
                                            (f))))
              run          (fn []
                             (mt/with-temporary-setting-values [metabot-query-execution-enabled? true]
                               (with-query #(run-query/run-query-tool {:query_id "adhoc"}))))]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"only uses curated content" (run)))
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"only uses curated content"
                                (with-query #(autogen/create-autogenerated-dashboard-tool {:source {:query_id "adhoc"}}))))
          (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true :data_layer :final}
            (is (str/includes? (:output (run)) "Count"))))))))

(deftest id-taking-tools-missing-id-reads-as-missing-test
  (testing "a missing id gets the handler's own answer, not a curation verdict"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Metabot metabot {:name "curated metabot" :use_verified_content true}]
        (as-metabot metabot :internal
                    (fn []
                      (let [missing   2147483647
                            output-of (fn [f]
                                        (try
                                          (:output (f))
                                          (catch clojure.lang.ExceptionInfo e
                                            (ex-message e))))]
                        (doseq [f [#(autogen/create-autogenerated-dashboard-tool {:source {:report_id missing}})
                                   #(autogen/create-autogenerated-dashboard-tool {:source {:table_id missing}})
                                   #(create-alert/create-alert-tool {:card_id        missing
                                                                     :send_condition "has_result"
                                                                     :schedule       {:frequency "daily" :hour 9}})
                                   #(subscriptions/create-dashboard-subscription-tool {:dashboard_id  missing
                                                                                       :slack_channel "#general"
                                                                                       :schedule      {:frequency "daily" :hour 9}})]]
                          (let [text (output-of f)]
                            (is (string? text))
                            (is (not (str/includes? text "only uses curated content")) text))))))))))

(deftest explorations-tools-curated-only-test
  (testing "the research catalog tools list and accept only the metrics this Metabot may use"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {raw-metric :id} {:type          :metric
                                                   :name          "zz raw orders count"
                                                   :dataset_query (count-metric-query (orders-query))}
                     :model/Card {verified-metric :id} {:type          :metric
                                                        :name          "zz verified orders count"
                                                        :dataset_query (count-metric-query (orders-query))}
                     :model/Metabot metabot {:name "curated metabot" :use_verified_content true}]
        (verify-card! verified-metric)
        (let [ours       #{raw-metric verified-metric}
              metric-ids (fn [metabot profile-id tool args]
                           (set/intersection ours
                                             (into #{}
                                                   (map :id)
                                                   (:metrics (json/decode+kw (:output (as-metabot metabot profile-id #(tool args))))))))]
          (testing "list_research_metrics"
            (is (= ours (metric-ids nil nil explorations-tools/list-research-metrics-tool {:q "zz"})))
            (is (= #{verified-metric} (metric-ids metabot :internal explorations-tools/list-research-metrics-tool {:q "zz"}))))
          (testing "get_research_candidates by q"
            (is (= ours (metric-ids nil nil explorations-tools/get-research-candidates-tool {:q "zz"})))
            (is (= #{verified-metric} (metric-ids metabot :internal explorations-tools/get-research-candidates-tool {:q "zz"}))))
          (testing "get_research_candidates by id"
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"only uses curated content"
                                  (as-metabot metabot :internal
                                              #(explorations-tools/get-research-candidates-tool {:metric_ids [raw-metric]}))))
            (is (= #{verified-metric}
                   (metric-ids metabot :internal explorations-tools/get-research-candidates-tool {:metric_ids [verified-metric]})))))))))

(deftest listings-omit-query-json-curated-only-test
  (testing "under curated-only a card's details omit its definition in list_available_fields, as in read_resource"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {model-id :id} {:type :model :name "verified orders model" :dataset_query (orders-query)}
                     :model/Metabot metabot {:name "curated metabot" :use_verified_content true}]
        (verify-card! model-id)
        (let [model-entry (fn [metabot profile-id]
                            (first (get-in (as-metabot metabot profile-id
                                                       #(metadata-tools/list-available-fields-tool {:table_ids  []
                                                                                                    :model_ids  [model-id]
                                                                                                    :metric_ids []}))
                                           [:structured-output :models])))]
          (is (contains? (model-entry nil nil) :query_json))
          (is (not (contains? (model-entry metabot :internal) :query_json))))))))

(deftest field-values-follow-the-definition-through-cards-test
  (testing "the field-owner rule follows a card's definition through its source cards, reads a native definition's
            result columns, and judges a metric's columns the same way"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true :data_layer :final}
        (let [mp    (mt/metadata-provider)
              total (mt/id :orders :total)]
          (mt/with-temp [:model/Card {base-model :id} {:type :model :name "orders model" :dataset_query (orders-query)}
                         :model/Card {stacked-model :id} {:type          :model
                                                          :name          "model on model"
                                                          :dataset_query (lib/query mp (lib.metadata/card mp base-model))}
                         :model/Card {native-model :id} {:type          :model
                                                         :name          "native model"
                                                         :dataset_query (mt/native-query {:query "SELECT TOTAL FROM ORDERS"})}
                         :model/Card {edited-model :id} {:type :model :name "edited model" :dataset_query (orders-query)}
                         :model/Metabot metabot {:name "curated metabot" :use_verified_content true}]
            (t2/update! :model/Card native-model
                        {:result_metadata [{:name "TOTAL" :display_name "Total" :base_type :type/Float
                                            :id total :table_id (mt/id :orders)}]})
            (t2/update! :model/Card edited-model
                        {:result_metadata [{:name "RATING" :display_name "Rating" :base_type :type/Integer
                                            :id (mt/id :reviews :rating) :table_id (mt/id :reviews)}]})
            (doseq [id [base-model stacked-model native-model edited-model]]
              (verify-card! id))
            (mt/with-temp [:model/Card {metric-id :id} {:type          :metric
                                                        :name          "metric on edited model"
                                                        :dataset_query (count-metric-query
                                                                        (lib/query mp (lib.metadata/card mp edited-model)))}]
              (let [values (fn [source-type source-id field-id]
                             (as-metabot metabot :internal
                                         #(metadata-tools/get-field-values-tool {:data_source source-type
                                                                                 :source_id   source-id
                                                                                 :field_id    field-id})))]
                (is (some? (get-in (values "model" stacked-model total) [:structured-output :value_metadata]))
                    "a model built on a model reaches the tables its source reads")
                (is (some? (get-in (values "model" native-model total) [:structured-output :value_metadata]))
                    "a native model exposes the tables its result columns map to")
                (is (thrown-with-msg? clojure.lang.ExceptionInfo #"only uses curated content"
                                      (values "metric" metric-id (mt/id :reviews :rating)))
                    "a metric's columns are judged by its definition, source cards included")))))))))

(deftest measure-reads-follow-their-definitions-test
  (testing "read_resource judges a measure by its table and by the tables its definition reads"
    (mt/with-current-user (mt/user->id :crowberto)
      (let [mp     (mt/metadata-provider)
            orders (lib/query mp (lib.metadata/table mp (mt/id :orders)))
            price  (first (filter #(= (:id %) (mt/id :products :price)) (lib/visible-columns orders)))]
        (mt/with-temp [:model/Measure {raw-measure :id} {:name       "reviews count"
                                                         :table_id   (mt/id :reviews)
                                                         :definition (lib/aggregate (lib/query mp (lib.metadata/table mp (mt/id :reviews)))
                                                                                    (lib/count))}
                       :model/Measure {hop-measure :id} {:name       "orders product price"
                                                         :table_id   (mt/id :orders)
                                                         :definition (lib/aggregate orders (lib/sum price))}
                       :model/Metabot metabot {:name "curated metabot" :use_verified_content true}]
          (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true :data_layer :final}
            (is (denied? (first (read-uris metabot :internal (str "metabase://measure/" raw-measure)))))
            (is (not (denied? (first (read-uris metabot :internal (str "metabase://measure/" hop-measure)))))
                "PRODUCTS is one FK hop from curated ORDERS")
            (is (false? (curation/measure-or-segment-curated? :measure raw-measure)))
            (is (true? (curation/measure-or-segment-curated? :measure hop-measure)))))))))

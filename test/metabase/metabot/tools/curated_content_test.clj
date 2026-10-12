(ns metabase.metabot.tools.curated-content-test
  "BOT-1649: with `use_verified_content` on, Metabot tools that read or query entities directly (`read_resource`,
  `construct_notebook_query`) stay within curated content, matching the `:curated` filter search applies."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.activity-feed.core :as activity-feed]
   [metabase.content-verification.core :as moderation]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.curation :as curation]
   [metabase.metabot.tools.construct :as construct]
   [metabase.metabot.tools.field-stats :as field-stats]
   [metabase.metabot.tools.metadata :as metadata-tools]
   [metabase.metabot.tools.resources :as read-resource]
   [metabase.metabot.tools.shared :as tools.shared]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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
  "Call `f` as a tool of the Metabot with entity id `metabot-id` under `profile-id`, with tool state bound the way
  the agent loop binds it."
  [metabot-id profile-id f]
  (binding [tools.shared/*metabot-id*    metabot-id
            tools.shared/*profile-id*    profile-id
            tools.shared/*curated-only?* (curation/curated-content-only? metabot-id profile-id)]
    (f)))

(defn- read-uris
  "Run `read_resource` on `uris` as a tool of the Metabot with entity id `metabot-id` under `profile-id`."
  [metabot-id profile-id & uris]
  (as-metabot metabot-id profile-id #(:resources (read-resource/read-resource {:uris (vec uris)}))))

(defn- item-ids [resource]
  (into #{} (map :id) (get-in resource [:content :structured-output :items])))

(defn- denied? [resource]
  (boolean (some-> (:error resource) (str/includes? "only uses curated content"))))

(deftest read-resource-curated-only-tables-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Table {published :id} {:db_id db-id :name "published_orders" :schema "curated_schema"
                                                 :active true :is_published true :data_layer :final}
                   :model/Table {authoritative :id} {:db_id db-id :name "authoritative_people" :schema "curated_schema"
                                                     :active true :data_authority :authoritative}
                   :model/Table {raw :id} {:db_id db-id :name "raw_products" :schema "raw_schema" :active true}
                   :model/Metabot {curated-metabot :entity_id} {:name "curated metabot" :use_verified_content true}
                   :model/Metabot {open-metabot :entity_id} {:name "open metabot" :use_verified_content false}]
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
        (doseq [[metabot-id profile-id] [[open-metabot :internal] [nil nil] [curated-metabot :nlq]]]
          (is (not (denied? (first (read-uris metabot-id profile-id (str "metabase://table/" raw))))))
          (is (= #{published authoritative raw}
                 (item-ids (first (read-uris metabot-id profile-id
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
                   :model/Metabot {metabot-id :entity_id} {:name "curated metabot" :use_verified_content true}]
      (verify-card! verified-model)
      (testing "reads an uncurated metric only when what it's defined on is curated, as construct_notebook_query does"
        (is (denied? (first (read-uris metabot-id :internal (str "metabase://metric/" plain-metric)))))
        (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true :data_layer :final}
          (is (not (denied? (first (read-uris metabot-id :internal (str "metabase://metric/" plain-metric))))))))
      (testing "denies uncurated cards"
        (is (denied? (first (read-uris metabot-id :internal (str "metabase://model/" plain-model "/fields"))))))
      (testing "reads curated cards"
        (is (not (denied? (first (read-uris metabot-id :internal
                                            (str "metabase://model/" verified-model "/fields")))))))
      (testing "lists only curated cards"
        (let [models (item-ids (first (read-uris metabot-id :internal (str "metabase://database/" (mt/id) "/models"))))]
          (is (contains? models verified-model))
          (is (not (contains? models plain-model))))
        (is (= #{verified-model}
               (item-ids (first (read-uris metabot-id :internal (str "metabase://collection/" coll-id "/items"))))))))))

(deftest metric-read-judges-metric-cards-only-test
  (testing "the metric rule judges metric Cards with structured definitions, and nothing else passes through it"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Metabot {metabot-id :entity_id} {:name "curated metabot" :use_verified_content true}
                     :model/Card {native-question :id} {:type :question :name "native question"
                                                        :dataset_query (mt/native-query {:query "SELECT 1"})}
                     :model/Card {plain-model :id} {:type :model :name "plain model"
                                                    :dataset_query (orders-query)}
                     :model/Card {native-metric :id native-metric-eid :entity_id}
                     {:type :metric :name "native metric"
                      :dataset_query (mt/native-query {:query "SELECT count(*) FROM ORDERS"})}
                     :model/Card {verified-native-metric :id}
                     {:type :metric :name "verified native metric"
                      :dataset_query (mt/native-query {:query "SELECT count(*) FROM ORDERS"})}]
        (verify-card! verified-native-metric)
        (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true :data_layer :final}
          (let [read     (fn [id] (first (read-uris metabot-id :internal (str "metabase://metric/" id))))
                metadata (fn [id] (as-metabot metabot-id :internal
                                              #(:structured-output (metadata-tools/get-metadata {:metric-ids [id]}))))
                db-name  (t2/select-one-fn :name :model/Database :id (mt/id))
                query    (fn [metric-eid]
                           {:lib/type "mbql/query"
                            :stages   [{:lib/type     "mbql.stage/mbql"
                                        :source-table [db-name "PUBLIC" "ORDERS"]
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
                                      (as-metabot metabot-id :internal
                                                  #(construct/execute-representations-query
                                                    (query native-metric-eid)))))))
            (testing "a curated metric with a native definition is readable, being curated itself"
              (is (not (denied? (read verified-native-metric)))))))))))

(deftest curated-non-metric-card-through-metric-paths-test
  (testing "a curated Card named where a metric is expected passes on its own curation, as the unrestricted Metabot
            reads it through the same paths, and an uncurated question referenced as a metric fails closed"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {model-id :id} {:type :model :name "verified model" :dataset_query (orders-query)}
                     :model/Card {question-id :id} {:type :question :name "plain question"
                                                    :dataset_query (orders-query)}
                     :model/Metabot {metabot-id :entity_id} {:name "curated metabot" :use_verified_content true}]
        (verify-card! model-id)
        (testing "read_resource metric URI"
          (is (not (denied? (first (read-uris metabot-id :internal (str "metabase://metric/" model-id)))))))
        (testing "list_available_fields metric_ids"
          (is (not-any? #(str/includes? % "only uses curated content")
                        (as-metabot metabot-id :internal
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
                                                                      (lib/query mp (lib.metadata/table mp (mt/id :reviews)))
                                                                      (lib/count))}
                       :model/Metabot {metabot-id :entity_id} {:name "curated metabot" :use_verified_content true}]
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
              (let [[resource] (read-uris metabot-id :internal
                                          (str "metabase://question/" question-id "/fields/" rating))]
                (is (nil? (get-in resource [:content :structured-output :value_metadata])))))
            (testing "get_field_values doesn't either"
              (is (nil? (get-in (as-metabot metabot-id :internal
                                            #(metadata-tools/get-field-values-tool {:data_source "question"
                                                                                    :source_id   question-id
                                                                                    :field_id    rating}))
                                [:structured-output :value_metadata]))))))))))

(deftest covered-metric-as-source-card-test
  (testing "an uncurated metric that passes the metric rule may be a query's source card, as it may be read and used in
            an aggregation; one that doesn't pass is still rejected"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card {metric-id :id metric-eid :entity_id} {:type          :metric
                                                                        :name          "plain metric"
                                                                        :dataset_query (count-metric-query (orders-query))}
                     :model/Metabot {metabot-id :entity_id} {:name "curated metabot" :use_verified_content true}]
        (let [q         {:lib/type "mbql/query"
                         :stages   [{:lib/type "mbql.stage/mbql" :source-card metric-eid}]}
              construct (fn [metabot-id profile-id]
                          (as-metabot metabot-id profile-id #(construct/execute-representations-query q)))
              rejected? (fn []
                          (try
                            (construct metabot-id :internal)
                            false
                            (catch clojure.lang.ExceptionInfo e
                              (if (= :uncurated-source (:error (ex-data e))) true (throw e)))))]
          (testing "the query is valid without a restricted Metabot"
            (is (some? (:structured-output (construct nil nil)))))
          (testing "over a raw table the metric is rejected as a source"
            (is (rejected?)))
          (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true :data_layer :final}
            (testing "over a curated table it is readable"
              (is (not (denied? (first (read-uris metabot-id :internal (str "metabase://metric/" metric-id)))))))
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
                                                                    (orders-joined-query :reviews :product_id :product_id))}
                     :model/Metabot {metabot-id :entity_id} {:name "curated metabot" :use_verified_content true}]
        (verify-card! question-id)
        (let [dimensions (fn [metabot-id profile-id]
                           (get-in (first (read-uris metabot-id profile-id
                                                     (str "metabase://metric/" question-id "/dimensions")))
                                   [:content :structured-output]))]
          (testing "the curated-only Metabot doesn't"
            (let [so (dimensions metabot-id :internal)]
              (is (map? so))
              (is (nil? (:join-required-dimensions so))))))))))

(deftest inactive-table-reads-as-missing-test
  (testing "a deactivated table reads as missing, as it does for the unrestricted Metabot, not as uncurated"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Table {inactive :id} {:db_id (mt/id) :name "dropped_raw_table" :active false}
                     :model/Metabot {metabot-id :entity_id} {:name "curated metabot" :use_verified_content true}]
        (let [uri (str "metabase://table/" inactive)]
          (testing "read_resource"
            (let [[resource] (read-uris metabot-id :internal uri)]
              (is (some? (:error resource)))
              (is (not (denied? resource)))
              (is (= (:error (first (read-uris nil nil uri))) (:error resource)))))
          (testing "list_available_fields"
            (is (not-any? #(str/includes? % "only uses curated content")
                          (as-metabot metabot-id :internal
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
                                                                   (orders-joined-query :reviews :product_id :product_id))}
                     :model/Card {model-id :id} {:type :model :name "verified orders model"
                                                 :dataset_query (orders-query)}
                     :model/Metabot {metabot-id :entity_id} {:name "curated metabot" :use_verified_content true}]
        (verify-card! model-id)
        (let [mp         (mt/metadata-provider)
              on-model   (lib/query mp (lib.metadata/card mp model-id))
              product-id (some #(when (= "PRODUCT_ID" (:name %)) %) (lib/returned-columns on-model))]
          (mt/with-temp [:model/Card {bad-model-metric :id}
                         {:type          :metric
                          :name          "model joined to raw reviews"
                          :dataset_query (count-metric-query
                                          (lib/join on-model
                                                    (lib/join-clause (lib.metadata/table mp (mt/id :reviews))
                                                                     [(lib/= product-id
                                                                             (lib.metadata/field mp (mt/id :reviews :product_id)))])))}]
            (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true :data_layer :final}
              (let [listed (fn [uri]
                             (let [so (get-in (first (read-uris metabot-id :internal uri))
                                              [:content :structured-output])]
                               (is (map? so) uri)
                               (into #{} (map :id) (:metrics so))))]
                (testing "the failing metrics themselves are denied"
                  (is (denied? (first (read-uris metabot-id :internal (str "metabase://metric/" bad-metric)))))
                  (is (denied? (first (read-uris metabot-id :internal (str "metabase://metric/" bad-model-metric))))))
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
                       :model/Metabot {metabot-id :entity_id} {:name "curated metabot" :use_verified_content true}]
          (verify-card! verified-model)
          (doseq [[model id] [[:model/Card verified-model] [:model/Card plain-question] [:model/Table raw-table]]]
            (activity-feed/update-users-recent-views! (mt/user->id :crowberto) model id :view))
          (let [items (get-in (first (read-uris metabot-id :internal "metabase://user/recent-items"))
                              [:content :structured-output :items])]
            ;; key on type and id: a temp Card's id can coincide with a temp Table's
            (is (=? [{:type "model" :id verified-model}]
                    (filterv (comp #{["model" verified-model] ["question" plain-question] ["table" raw-table]}
                                   (juxt :type :id))
                             items)))))))))

(deftest ^:parallel curation-subject-test
  (testing "transforms can never be curated"
    (is (= ["transform" 1]
           (#'read-resource/curation-subject ["transform" "1" "sources"]))))
  (testing "navigation, dashboards, and table dependents aren't gated per entity"
    (is (nil? (#'read-resource/curation-subject ["databases"])))
    (is (nil? (#'read-resource/curation-subject ["dashboard" "1" "items"])))
    (is (nil? (#'read-resource/curation-subject ["table" "1" "derived"]))))
  (testing "tables and cards are judged as themselves"
    (is (= ["table" 1] (#'read-resource/curation-subject ["table" "1" "fields" "c75"])))
    (is (= ["metric" 2] (#'read-resource/curation-subject ["metric" "2" "dimensions"])))))

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
                   :model/Metabot {metabot-id :entity_id} {:name "curated metabot" :use_verified_content true}]
      (verify-card! verified-model)
      (verify-card! verified-metric)
      (verify-card! verified-join-metric)
      (let [db-name        (t2/select-one-fn :name :model/Database :id (mt/id))
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
            construct      (fn [metabot-id profile-id q]
                             (as-metabot metabot-id profile-id #(construct/execute-representations-query q)))
            rejected?      (fn [metabot-id profile-id q]
                             (try
                               (construct metabot-id profile-id q)
                               false
                               (catch clojure.lang.ExceptionInfo e
                                 (if (= :uncurated-source (:error (ex-data e)))
                                   true
                                   (throw e)))))
            accepted?      (fn [q] (some? (:structured-output (construct metabot-id :internal q))))]
        (testing "a raw table is rejected for a curated-only Metabot"
          (is (rejected? metabot-id :internal orders-query)))
        (testing "a raw table is queryable without a restricted Metabot, and for the nlq profile"
          (is (some? (:structured-output (construct nil nil orders-query))))
          (is (some? (:structured-output (construct metabot-id :nlq orders-query)))))
        (testing "a curated table is queryable"
          (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true :data_layer :final}
            (is (accepted? orders-query))
            (testing "along with the related tables it exposes, joined implicitly"
              (is (accepted? joined-query)))
            (testing "and the metrics defined on it, curated or not"
              (is (accepted? (metric-query plain-metric-eid)))
              (testing "as long as everything the metric's definition reads is curated or covered"
                (is (accepted? (metric-query related-join-metric-eid)))
                (is (rejected? metabot-id :internal (metric-query unrelated-join-metric-eid))))
              (testing "including a metric built on another uncurated metric over the curated table"
                (is (accepted? (metric-query nested-metric-eid)))))
            (testing "but a related table is still not a source of its own"
              (is (rejected? metabot-id :internal products-query))
              (testing "even when joined to the curated table"
                (is (rejected? metabot-id :internal products-joined-query))))))
        (testing "an uncurated metric defined on a curated model is accepted"
          (is (accepted? (assoc-in (query {:source-card verified-eid}) [:stages 0 :aggregation]
                                   [["metric" {} model-metric-eid]]))))
        (testing "a curated metric covers the raw table it's defined on, and that table's related tables"
          (is (accepted? (metric-query verified-metric-eid)))
          (is (accepted? (assoc-in (metric-query verified-metric-eid) [:stages 0 :breakout]
                                   (get-in joined-query [:stages 0 :breakout])))))
        (testing "an uncurated metric on a raw table is rejected"
          (is (rejected? metabot-id :internal (metric-query plain-metric-eid))))
        (testing "read_resource and construct_notebook_query agree on metrics over a raw table"
          (testing "a plain metric next to the verified one is rejected on both sides"
            (is (rejected? metabot-id :internal
                           (assoc-in orders-query [:stages 0 :aggregation]
                                     [["metric" {} verified-metric-eid] ["metric" {} plain-metric-eid]])))
            (is (denied? (first (read-uris metabot-id :internal (str "metabase://metric/" plain-metric))))))
          (testing "a plain metric built on the verified metric is accepted on both sides"
            (is (accepted? (metric-query nested-on-verified-eid)))
            (is (not (denied? (first (read-uris metabot-id :internal
                                                (str "metabase://metric/" nested-on-verified))))))))
        (testing "a table a curated metric only joins is not a source of its own"
          (is (rejected? metabot-id :internal
                         (assoc-in (query {:source-table [db-name "PUBLIC" "REVIEWS"]}) [:stages 0 :aggregation]
                                   [["metric" {} verified-join-metric-eid]]))))
        (testing "source cards must be curated"
          (is (accepted? (query {:source-card verified-eid})))
          (is (rejected? metabot-id :internal (query {:source-card plain-eid}))))))))

(defn- metric-chain!
  "Insert `n` metric Cards on ORDERS, each aggregating the previous one (the first counts rows), and return them
  innermost first."
  [n]
  (reduce (fn [cards i]
            (let [query (if-let [inner (peek cards)]
                          {:database (mt/id)
                           :type     :query
                           :query    {:source-table (mt/id :orders)
                                      :aggregation  [["metric" (:id inner)]]}}
                          (count-metric-query (orders-query)))]
              (conj cards (t2/insert-returning-instance! :model/Card
                                                         (merge (mt/with-temp-defaults :model/Card)
                                                                {:type          :metric
                                                                 :name          (str "chain metric " i)
                                                                 :dataset_query query})))))
          []
          (range n)))

(deftest metric-nesting-limit-test
  (testing "a chain of metric references deeper than the limit fails closed on both sides"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Metabot {metabot-id :entity_id} {:name "curated metabot" :use_verified_content true}]
        (mt/with-model-cleanup [:model/Card]
          (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true :data_layer :final}
            (let [limit     @#'curation/max-metric-nesting
                  chain     (metric-chain! (inc limit))
                  within    (nth chain (dec limit))
                  beyond    (peek chain)
                  db-name   (t2/select-one-fn :name :model/Database :id (mt/id))
                  query-on  (fn [{:keys [entity_id]}]
                              {:lib/type "mbql/query"
                               :stages   [{:lib/type     "mbql.stage/mbql"
                                           :source-table [db-name "PUBLIC" "ORDERS"]
                                           :aggregation  [["metric" {} entity_id]]}]})
                  construct (fn [q] (as-metabot metabot-id :internal #(construct/execute-representations-query q)))
                  rejected? (fn [q]
                              (try
                                (construct q)
                                false
                                (catch clojure.lang.ExceptionInfo e
                                  (if (= :uncurated-source (:error (ex-data e)))
                                    true
                                    (throw e)))))
                  read      (fn [{:keys [id]}] (first (read-uris metabot-id :internal (str "metabase://metric/" id))))]
              (testing "a chain at the limit is accepted"
                (is (not (rejected? (query-on within))))
                (is (not (denied? (read within)))))
              (testing "one deeper is rejected"
                (is (rejected? (query-on beyond)))
                (is (denied? (read beyond)))))))))))

(deftest metric-definition-walk-is-bounded-test
  (testing "judging a metric chain loads each definition once and stops at the nesting limit"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Metabot {metabot-id :entity_id} {:name "curated metabot" :use_verified_content true}]
        (mt/with-model-cleanup [:model/Card]
          (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true :data_layer :final}
            (let [limit    @#'curation/max-metric-nesting
                  chain    (metric-chain! (+ limit 5))
                  loads    (atom 0)
                  original lib.metadata/card]
              (mt/with-dynamic-fn-redefs [lib.metadata/card (fn [& args] (swap! loads inc) (apply original args))]
                (is (denied? (first (read-uris metabot-id :internal (str "metabase://metric/" (:id (peek chain)))))))
                (is (<= @loads (inc limit))
                    (str "loaded " @loads " definitions for a chain the limit should cut at " limit))))))))))

(deftest curated-metric-at-the-nesting-limit-test
  (testing "a curated metric passes on its own curation wherever it sits: the one the deepest walked definition
            references isn't judged as missing because the walk didn't load it"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Metabot {metabot-id :entity_id} {:name "curated metabot" :use_verified_content true}]
        (mt/with-model-cleanup [:model/Card :model/ModerationReview]
          (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true :data_layer :final}
            (let [limit @#'curation/max-metric-nesting
                  ;; chain[0] counts ORDERS and is verified; chain[1..limit] are uncurated, each on the previous one.
                  ;; Judging chain[limit] walks `limit` uncurated definitions and reaches chain[0] at depth `limit`.
                  chain (metric-chain! (inc limit))
                  top   (peek chain)]
              (verify-card! (:id (first chain)))
              (testing "read_resource"
                (is (not (denied? (first (read-uris metabot-id :internal (str "metabase://metric/" (:id top)))))))
                (testing "(one level shallower passes too)"
                  (is (not (denied? (first (read-uris metabot-id :internal
                                                      (str "metabase://metric/" (:id (nth chain (dec limit)))))))))))
              (testing "construct_notebook_query's rule"
                (is (= [] (curation/uncurated-query-sources
                           (lib/query (mt/metadata-provider)
                                      {:database (mt/id)
                                       :type     :query
                                       :query    {:source-table (mt/id :orders)
                                                  :aggregation  [["metric" (:id top)]]}}))))))))))))

(deftest read-resource-curated-check-ordering-test
  (testing "the curation check runs after the entity's existence and read checks, but before its handler"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Metabot {metabot-id :entity_id} {:name "curated metabot" :use_verified_content true}]
        (testing "a missing table reads as missing, not as uncurated"
          (let [[resource] (read-uris metabot-id :internal "metabase://table/2147483647")]
            (is (some? (:error resource)))
            (is (not (denied? resource)))))
        (testing "a missing transform reads as missing, not as uncurated"
          (let [[resource] (read-uris metabot-id :internal "metabase://transform/2147483647")]
            (is (some? (:error resource)))
            (is (not (denied? resource)))))
        (testing "a card on a routing destination database reads as missing, not as uncurated"
          (mt/with-temp [:model/Database {router-id :id}      {}
                         :model/Database {destination-id :id} {:router_database_id router-id}
                         :model/Card     {card-id :id}        {:type :model :database_id destination-id}]
            (let [[resource] (read-uris metabot-id :internal (str "metabase://model/" card-id))]
              (is (some? (:error resource)))
              (is (not (denied? resource))))))
        (testing "a denied URI does none of its handler's work (field values and fingerprints aren't computed)"
          (mt/with-dynamic-fn-redefs [field-stats/field-values
                                      (fn [& _] (throw (ex-info "handler ran for a denied URI" {})))]
            (let [uri (str "metabase://table/" (mt/id :orders) "/fields/" (mt/id :orders :total))]
              (is (denied? (first (read-uris metabot-id :internal uri)))))))))
    (testing "an unreadable table doesn't reveal whether it's curated"
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Table {published :id} {:db_id db-id :name "hidden_published" :active true
                                                   :is_published true :data_layer :final}
                     :model/Table {raw :id} {:db_id db-id :name "hidden_raw" :active true}
                     :model/Metabot {metabot-id :entity_id} {:name "curated metabot" :use_verified_content true}]
        (mt/with-no-data-perms-for-all-users!
          (mt/with-current-user (mt/user->id :rasta)
            (let [errors (mapv #(:error (first (read-uris metabot-id :internal (str "metabase://table/" %))))
                               [published raw])]
              (is (every? some? errors))
              (is (not-any? #(str/includes? % "only uses curated content") errors))
              (is (apply = errors)))))))))

(deftest read-resource-curated-action-uri-test
  (testing "an action dashcard keeps its backing model's uri only when that model is curated"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-actions [{model-id :id} {:type :model :dataset_query (orders-query)}
                        {:keys [action-id]} {:type :query :visualization_settings {}}]
        (mt/with-temp [:model/Dashboard {dash-id :id} {}
                       :model/DashboardCard _ {:dashboard_id dash-id :card_id model-id :action_id action-id
                                               :row 0 :col 0 :size_x 4 :size_y 1
                                               :visualization_settings {:button.label "Create Row"}}
                       :model/Metabot {metabot-id :entity_id} {:name "curated metabot" :use_verified_content true}]
          (let [action-uris (fn []
                              (into []
                                    (keep :uri)
                                    (get-in (first (read-uris metabot-id :internal
                                                              (str "metabase://dashboard/" dash-id "/items")))
                                            [:content :structured-output :items])))]
            (is (= [] (action-uris)))
            (verify-card! model-id)
            (is (= [(str "metabase://model/" model-id)] (action-uris)))))))))

(deftest metadata-tools-curated-only-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Metabot {metabot-id :entity_id} {:name "curated metabot" :use_verified_content true}
                   :model/Card {plain-metric :id} {:type :metric :name "plain metric"
                                                   :dataset_query (count-metric-query (orders-query))}]
      (as-metabot metabot-id :internal
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

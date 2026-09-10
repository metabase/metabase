(ns metabase.metabot.tools.curated-content-test
  "BOT-1649: with `use_verified_content` on, Metabot tools that read or query entities directly (`read_resource`,
  `construct_notebook_query`) stay within curated content, matching the `:curated` filter search applies."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.content-verification.core :as moderation]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.construct :as construct]
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

(defn- read-uris
  "Run `read_resource` on `uris` as a tool of the Metabot with entity id `metabot-id` under `profile-id`."
  [metabot-id profile-id & uris]
  (binding [tools.shared/*metabot-id* metabot-id
            tools.shared/*profile-id* profile-id]
    (:resources (read-resource/read-resource {:uris (vec uris)}))))

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
                 (item-ids (first (read-uris metabot-id profile-id (str "metabase://database/" db-id "/tables")))))))))))

(deftest read-resource-curated-only-cards-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Collection {coll-id :id} {:name "curation test collection"}
                   :model/Card {verified-model :id} {:type :model :name "verified model" :collection_id coll-id
                                                     :dataset_query (orders-query)}
                   :model/Card {plain-model :id} {:type :model :name "plain model" :collection_id coll-id
                                                  :dataset_query (orders-query)}
                   :model/Metabot {metabot-id :entity_id} {:name "curated metabot" :use_verified_content true}]
      (verify-card! verified-model)
      (testing "denies uncurated cards"
        (is (denied? (first (read-uris metabot-id :internal (str "metabase://model/" plain-model "/fields"))))))
      (testing "reads curated cards"
        (is (not (denied? (first (read-uris metabot-id :internal (str "metabase://model/" verified-model "/fields")))))))
      (testing "lists only curated cards"
        (let [models (item-ids (first (read-uris metabot-id :internal (str "metabase://database/" (mt/id) "/models"))))]
          (is (contains? models verified-model))
          (is (not (contains? models plain-model))))
        (is (= #{verified-model}
               (item-ids (first (read-uris metabot-id :internal (str "metabase://collection/" coll-id "/items"))))))))))

(deftest curation-subject-test
  (testing "transforms can never be curated"
    (is (= :metabase.metabot.tools.resources/never
           (#'read-resource/curation-subject ["transform" "1" "sources"]))))
  (testing "navigation, dashboards, and table dependents aren't gated per entity"
    (is (nil? (#'read-resource/curation-subject ["databases"])))
    (is (nil? (#'read-resource/curation-subject ["dashboard" "1" "items"])))
    (is (nil? (#'read-resource/curation-subject ["table" "1" "derived"]))))
  (testing "tables and cards are judged as themselves"
    (is (= ["table" 1] (#'read-resource/curation-subject ["table" "1" "fields" "c75"])))
    (is (= ["card" 2] (#'read-resource/curation-subject ["metric" "2" "dimensions"])))))

(deftest construct-query-curated-only-test
  (mt/with-current-user (mt/user->id :crowberto)
    (mt/with-temp [:model/Card {verified-model :id verified-eid :entity_id} {:type :model :name "verified model"
                                                                             :dataset_query (orders-query)}
                   :model/Card {plain-eid :entity_id} {:type :model :name "plain model"
                                                       :dataset_query (orders-query)}
                   :model/Metabot {metabot-id :entity_id} {:name "curated metabot" :use_verified_content true}]
      (verify-card! verified-model)
      (let [db-name      (t2/select-one-fn :name :model/Database :id (mt/id))
            stage        (fn [source] (merge {:lib/type "mbql.stage/mbql" :aggregation [["count" {}]]} source))
            query        (fn [source] {:lib/type "mbql/query" :stages [(stage source)]})
            orders-query (query {:source-table [db-name "PUBLIC" "ORDERS"]})
            joined-query (assoc-in orders-query [:stages 0 :breakout]
                                   [["field" {:source-field [db-name "PUBLIC" "ORDERS" "PRODUCT_ID"]}
                                     [db-name "PUBLIC" "PRODUCTS" "CATEGORY"]]])
            construct    (fn [metabot-id profile-id q]
                           (binding [tools.shared/*metabot-id* metabot-id
                                     tools.shared/*profile-id* profile-id]
                             (construct/execute-representations-query q)))
            rejected?    (fn [metabot-id profile-id q]
                           (try
                             (construct metabot-id profile-id q)
                             false
                             (catch clojure.lang.ExceptionInfo e
                               (if (= :uncurated-source (:error (ex-data e)))
                                 true
                                 (throw e)))))]
        (testing "a raw table is rejected for a curated-only Metabot"
          (is (rejected? metabot-id :internal orders-query)))
        (testing "a raw table is queryable without a restricted Metabot, and for the nlq profile"
          (is (some? (:structured-output (construct nil nil orders-query))))
          (is (some? (:structured-output (construct metabot-id :nlq orders-query)))))
        (testing "a curated table is queryable"
          (mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:is_published true :data_layer :final}
            (is (some? (:structured-output (construct metabot-id :internal orders-query))))
            (testing "but not when it implicitly joins an uncurated table"
              (is (rejected? metabot-id :internal joined-query)))))
        (testing "source cards must be curated"
          (is (some? (:structured-output (construct metabot-id :internal (query {:source-card verified-eid})))))
          (is (rejected? metabot-id :internal (query {:source-card plain-eid}))))))))

(ns metabase-enterprise.replacement.source-swap-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.dependencies.events]
   [metabase-enterprise.replacement.source-swap :as source-swap]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(comment
  metabase-enterprise.dependencies.events/keep-me)

(defn- wait-for-result-metadata
  "Poll until `result_metadata` is populated on the card, up to `timeout-ms` (default 5000)."
  ([card-id] (wait-for-result-metadata card-id 5000))
  ([card-id timeout-ms]
   (let [deadline (+ (System/currentTimeMillis) timeout-ms)]
     (loop []
       (let [metadata (t2/select-one-fn :result_metadata :model/Card :id card-id)]
         (if (seq metadata)
           metadata
           (if (< (System/currentTimeMillis) deadline)
             (do (Thread/sleep 200)
                 (recur))
             (throw (ex-info "Timed out waiting for result_metadata" {:card-id card-id})))))))))

(defn- card-with-query
  "Create a card map for the given table keyword."
  [card-name table-kw]
  (let [mp (mt/metadata-provider)]
    {:name                   card-name
     :database_id            (mt/id)
     :display                :table
     :query_type             :query
     :type                   :question
     :dataset_query          (lib/query mp (lib.metadata/table mp (mt/id table-kw)))
     :visualization_settings {}}))

(defn- native-card-with-query
  "Create a native card map for the given table keyword."
  [card-name table-kw]
  (let [mp (mt/metadata-provider)]
    {:name                   card-name
     :database_id            (mt/id)
     :display                :table
     :query_type             :native
     :type                   :question
     :dataset_query          (lib/native-query mp (str "SELECT * FROM " (name table-kw) " LIMIT 1"))
     :visualization_settings {}}))

(defn- card-sourced-from
  "Create a card map whose query sources `inner-card`."
  [card-name inner-card]
  (let [mp        (mt/metadata-provider)
        card-meta (lib.metadata/card mp (:id inner-card))]
    {:name                   card-name
     :database_id            (mt/id)
     :display                :table
     :query_type             :query
     :type                   :question
     :dataset_query          (lib/query mp card-meta)
     :visualization_settings {}}))

(defn- native-card-sourced-from
  "Create a native card map that references `inner-card` via {{#id}}."
  [card-name inner-card]
  (let [mp (mt/metadata-provider)]
    {:name                   card-name
     :database_id            (mt/id)
     :display                :table
     :query_type             :native
     :type                   :question
     :dataset_query          (lib/native-query mp (str "SELECT * FROM {{#" (:id inner-card) "}}"))
     :visualization_settings {}}))

(defmacro ^:private with-restored-card-queries
  "Snapshots every card's `dataset_query` before `body` and restores them
  afterwards, so that swap-source side-effects on pre-existing cards don't
  leak between tests."
  [& body]
  `(let [snapshot# (into {} (t2/select-fn->fn :id :dataset_query :model/Card))]
     (try
       ~@body
       (finally
         (doseq [[id# old-query#] snapshot#
                 :let [current# (t2/select-one-fn :dataset_query :model/Card :id id#)]
                 :when (and (some? old-query#) (not= old-query# current#))]
           (t2/update! :model/Card id# {:dataset_query old-query#}))))))

;;; ----------------------------------------- swap-card-in-native-query (pure) ------------------------------------------

(defn- make-native-query
  "Build a minimal pMBQL native dataset-query with the given SQL and template-tags."
  [sql template-tags]
  {:stages [{:lib/type      :mbql.stage/native
             :native        sql
             :template-tags template-tags}]})

(deftest swap-card-in-native-query-basic-test
  (testing "Simple card tag replacement"
    (let [query  (make-native-query
                  "SELECT * FROM {{#3}}"
                  {"#3" {:type :card :card-id 3 :name "#3" :display-name "#3"}})
          result (#'source-swap/swap-card-in-native-query query 3 99)]
      (is (= "SELECT * FROM {{#99}}"
             (get-in result [:stages 0 :native])))
      (is (= 99 (get-in result [:stages 0 :template-tags "#99" :card-id])))))

  (testing "Multiple card tags, only matching one is replaced"
    (let [query  (make-native-query
                  "SELECT * FROM {{#3}} JOIN {{#7}} ON 1=1"
                  {"#3" {:type :card :card-id 3 :name "#3" :display-name "#3"}
                   "#7" {:type :card :card-id 7 :name "#7" :display-name "#7"}})
          result (#'source-swap/swap-card-in-native-query query 3 99)]
      (is (= "SELECT * FROM {{#99}} JOIN {{#7}} ON 1=1"
             (get-in result [:stages 0 :native])))
      (is (= 99 (get-in result [:stages 0 :template-tags "#99" :card-id])))
      (is (= 7 (get-in result [:stages 0 :template-tags "#7" :card-id]))))))

(deftest swap-card-in-native-query-with-field-filters-test
  (testing "Card tag with field filter tags present"
    (let [query  (make-native-query
                  "SELECT * FROM {{#3}} WHERE {{created_at}}"
                  {"#3"        {:type :card :card-id 3 :name "#3" :display-name "#3"}
                   "created_at" {:type :dimension :name "created_at" :display-name "Created At"}})
          result (#'source-swap/swap-card-in-native-query query 3 99)]
      (is (= "SELECT * FROM {{#99}} WHERE {{created_at}}"
             (get-in result [:stages 0 :native])))
      (is (= 99 (get-in result [:stages 0 :template-tags "#99" :card-id])))
      (is (= "created_at"
             (get-in result [:stages 0 :template-tags "created_at" :name]))))))

(deftest swap-card-in-native-query-with-optional-clauses-test
  (testing "Card tag with optional clause containing field filter"
    (let [query  (make-native-query
                  "SELECT * FROM {{#3}} [[WHERE {{created_at}}]]"
                  {"#3"         {:type :card :card-id 3 :name "#3" :display-name "#3"}
                   "created_at" {:type :dimension :name "created_at" :display-name "Created At"}})
          result (#'source-swap/swap-card-in-native-query query 3 99)]
      (is (= "SELECT * FROM {{#99}} [[WHERE {{created_at}}]]"
             (get-in result [:stages 0 :native])))
      (is (= 99 (get-in result [:stages 0 :template-tags "#99" :card-id])))))

  (testing "Card tag inside optional clause"
    (let [query  (make-native-query
                  "SELECT * FROM foo [[JOIN {{#3}} ON 1=1]]"
                  {"#3" {:type :card :card-id 3 :name "#3" :display-name "#3"}})
          result (#'source-swap/swap-card-in-native-query query 3 99)]
      (is (= "SELECT * FROM foo [[JOIN {{#99}} ON 1=1]]"
             (get-in result [:stages 0 :native])))
      (is (= 99 (get-in result [:stages 0 :template-tags "#99" :card-id]))))))

(deftest swap-card-in-native-query-comment-test
  (testing "Card tag inside a line comment should NOT be replaced"
    (let [query  (make-native-query
                  "SELECT * FROM {{#3}}\n-- old: {{#3}}"
                  {"#3" {:type :card :card-id 3 :name "#3" :display-name "#3"}})
          result (#'source-swap/swap-card-in-native-query query 3 99)]
      (is (= "SELECT * FROM {{#99}}\n-- old: {{#3}}"
             (get-in result [:stages 0 :native]))
          "The tag in the comment should be left alone")))

  (testing "Card tag inside a block comment should NOT be replaced"
    (let [query  (make-native-query
                  "SELECT * FROM {{#3}} /* see also {{#3}} */"
                  {"#3" {:type :card :card-id 3 :name "#3" :display-name "#3"}})
          result (#'source-swap/swap-card-in-native-query query 3 99)]
      (is (= "SELECT * FROM {{#99}} /* see also {{#3}} */"
             (get-in result [:stages 0 :native]))
          "The tag in the block comment should be left alone"))))

(deftest swap-card-in-native-query-string-literal-test
  (testing "Card tag inside a SQL string literal is also replaced (parser does not distinguish string literals)"
    (let [query  (make-native-query
                  "SELECT * FROM {{#3}} WHERE col = '{{#3}}'"
                  {"#3" {:type :card :card-id 3 :name "#3" :display-name "#3"}})
          result (#'source-swap/swap-card-in-native-query query 3 99)]
      (is (= "SELECT * FROM {{#99}} WHERE col = '{{#99}}'"
             (get-in result [:stages 0 :native]))
          "Both tags are replaced since the parser treats string literal tags as params too"))))

(deftest swap-card-in-native-query-multiple-cards-test
  (testing "Multiple different card tags, replace only the target"
    (let [query  (make-native-query
                  "SELECT a.* FROM {{#3}} a JOIN {{#5}} b ON a.id = b.id JOIN {{#3}} c ON a.id = c.id"
                  {"#3" {:type :card :card-id 3 :name "#3" :display-name "#3"}
                   "#5" {:type :card :card-id 5 :name "#5" :display-name "#5"}})
          result (#'source-swap/swap-card-in-native-query query 3 99)]
      (is (= "SELECT a.* FROM {{#99}} a JOIN {{#5}} b ON a.id = b.id JOIN {{#99}} c ON a.id = c.id"
             (get-in result [:stages 0 :native])))
      (is (= 99 (get-in result [:stages 0 :template-tags "#99" :card-id])))
      (is (= 5 (get-in result [:stages 0 :template-tags "#5" :card-id]))))))

;;; ------------------------------------------------ swap-native-card-source! ------------------------------------------------

(deftest swap-native-card-source!-updates-query-test
  (testing "Card referencing the old card gets its query text and template tags updated"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "SELECT * FROM {{#999}}")}]
          (source-swap/swap-native-card-source! card-id 999 888)
          (let [updated-query (:dataset_query (t2/select-one :model/Card :id card-id))
                query         (lib/raw-native-query updated-query)
                tags          (lib/template-tags updated-query)]
            (is (str/includes? query "{{#888}}"))
            (is (not (str/includes? query "{{#999}}")))
            (is (contains? tags "#888"))
            (is (not (contains? tags "#999")))
            (is (= 888 (get-in tags ["#888" :card-id])))
            (is (= "#888" (get-in tags ["#888" :name])))
            (is (= "#888" (get-in tags ["#888" :display-name])))))))))

(deftest swap-native-card-source!-no-op-test
  (testing "Card NOT referencing the old card is unchanged"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "SELECT * FROM {{#777}}")}]
          (let [before (t2/select-one :model/Card :id card-id)]
            (source-swap/swap-native-card-source! card-id 999 888)
            (let [after (t2/select-one :model/Card :id card-id)]
              (is (= (:dataset_query before) (:dataset_query after))))))))))

(deftest swap-native-card-source!-updates-dependencies-test
  (testing "Dependencies are updated after swap"
    (mt/with-premium-features #{:dependencies}
      (mt/with-test-user :rasta
        (let [mp       (mt/metadata-provider)
              products (lib.metadata/table mp (mt/id :products))
              orders   (lib.metadata/table mp (mt/id :orders))]
          (mt/with-temp [:model/Card {old-source-id :id} {:dataset_query (lib/query mp products)}
                         :model/Card {new-source-id :id} {:dataset_query (lib/query mp orders)}
                         :model/Card {native-card-id :id :as native-card}
                         {:dataset_query (lib/native-query mp (str "SELECT * FROM {{#" old-source-id "}}"))}]
            ;; Seed initial dependencies
            (events/publish-event! :event/card-dependency-backfill {:object native-card})
            (is (contains?
                 (into #{} (map #(select-keys % [:to_entity_type :to_entity_id])
                                (t2/select :model/Dependency
                                           :from_entity_id native-card-id
                                           :from_entity_type :card)))
                 {:to_entity_type :card :to_entity_id old-source-id})
                "Before swap: dependency on old source should exist")
            ;; Perform the swap
            (source-swap/swap-native-card-source! native-card-id old-source-id new-source-id)
            (let [deps (into #{} (map #(select-keys % [:to_entity_type :to_entity_id])
                                      (t2/select :model/Dependency
                                                 :from_entity_id native-card-id
                                                 :from_entity_type :card)))]
              (is (contains? deps {:to_entity_type :card :to_entity_id new-source-id})
                  "After swap: dependency on new source should exist")
              (is (not (contains? deps {:to_entity_type :card :to_entity_id old-source-id}))
                  "After swap: dependency on old source should be gone"))))))))

;;; ------------------------------------------------ swap-source: card -> X ------------------------------------------------

(deftest swap-source-card-to-card-test
  (testing "swap-source card -> card: child card's source-card is updated"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-card-card@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [old-source (card/create-card! (card-with-query "Old source" :products) user)
                  new-source (card/create-card! (card-with-query "New source" :products) user)
                  child      (card/create-card! (card-sourced-from "Child card" old-source) user)]
              (source-swap/swap-source [:card (:id old-source)] [:card (:id new-source)])
              (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))]
                (is (= (:id new-source) (get-in updated-query [:stages 0 :source-card])))))))))))

(deftest swap-source-card-to-table-test
  (testing "swap-source card -> table: child card's source changes to source-table"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-card-table@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [old-source (card/create-card! (card-with-query "Old source" :products) user)
                  child      (card/create-card! (card-sourced-from "Child card" old-source) user)]
              (source-swap/swap-source [:card (:id old-source)] [:table (mt/id :products)])
              (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))]
                (is (= (mt/id :products) (get-in updated-query [:stages 0 :source-table])))
                (is (nil? (get-in updated-query [:stages 0 :source-card])))))))))))

(deftest swap-source-card-to-native-card-test
  (testing "swap-source card -> native card: child card's source-card is updated"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-card-native@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [old-source  (card/create-card! (card-with-query "Old source" :products) user)
                  native-card (card/create-card! (native-card-with-query "Native target" :products) user)
                  _           (wait-for-result-metadata (:id native-card))
                  child       (card/create-card! (card-sourced-from "Child card" old-source) user)]
              (source-swap/swap-source [:card (:id old-source)] [:card (:id native-card)])
              (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))]
                (is (= (:id native-card) (get-in updated-query [:stages 0 :source-card])))))))))))

;;; ------------------------------------------------ swap-source: native card -> X ------------------------------------------------

(deftest swap-source-native-card-to-card-test
  (testing "swap-source native card -> card: child card's source-card is updated"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-native-card@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [native-card (card/create-card! (native-card-with-query "Native source" :products) user)
                  _           (wait-for-result-metadata (:id native-card))
                  new-source  (card/create-card! (card-with-query "New source" :products) user)
                  child       (card/create-card! (card-sourced-from "Child card" native-card) user)]
              (source-swap/swap-source [:card (:id native-card)] [:card (:id new-source)])
              (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))]
                (is (= (:id new-source) (get-in updated-query [:stages 0 :source-card])))))))))))

(deftest swap-source-native-card-to-native-card-test
  (testing "swap-source native card -> native card: child card's source-card is updated"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-native-native@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [old-native (card/create-card! (native-card-with-query "Old native" :products) user)
                  _          (wait-for-result-metadata (:id old-native))
                  new-native (card/create-card! (native-card-with-query "New native" :products) user)
                  _          (wait-for-result-metadata (:id new-native))
                  child      (card/create-card! (card-sourced-from "Child card" old-native) user)]
              (source-swap/swap-source [:card (:id old-native)] [:card (:id new-native)])
              (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))]
                (is (= (:id new-native) (get-in updated-query [:stages 0 :source-card])))))))))))

(deftest swap-source-native-card-to-table-test
  (testing "swap-source native card -> table: child card's source changes to source-table"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-native-table@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [native-card (card/create-card! (native-card-with-query "Native source" :products) user)
                  _           (wait-for-result-metadata (:id native-card))
                  child       (card/create-card! (card-sourced-from "Child card" native-card) user)]
              (source-swap/swap-source [:card (:id native-card)] [:table (mt/id :products)])
              (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))]
                (is (= (mt/id :products) (get-in updated-query [:stages 0 :source-table])))
                (is (nil? (get-in updated-query [:stages 0 :source-card])))))))))))

;;; ------------------------------------------------ swap-source: table -> X ------------------------------------------------

(deftest swap-source-table-to-card-test
  (testing "swap-source table -> card: child card's source changes to source-card"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-table-card@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (with-restored-card-queries
              (let [new-source (card/create-card! (card-with-query "New source" :products) user)
                    child      (card/create-card! (card-with-query "Child card" :products) user)]
                (source-swap/swap-source [:table (mt/id :products)] [:card (:id new-source)])
                (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))]
                  (is (= (:id new-source) (get-in updated-query [:stages 0 :source-card])))
                  (is (nil? (get-in updated-query [:stages 0 :source-table]))))))))))))

(deftest swap-source-table-to-table-test
  (testing "swap-source table -> table: child card's source-table is updated"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-table-table@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (with-restored-card-queries
              (let [child (card/create-card! (card-with-query "Child card" :products) user)]
                (source-swap/swap-source [:table (mt/id :products)] [:table (mt/id :products)])
                (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))]
                  (is (= (mt/id :products) (get-in updated-query [:stages 0 :source-table]))))))))))))

(deftest swap-source-table-to-native-card-test
  (testing "swap-source table -> native card: child card's source changes to source-card"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-table-native@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (with-restored-card-queries
              (let [native-card (card/create-card! (native-card-with-query "Native target" :products) user)
                    _           (wait-for-result-metadata (:id native-card))
                    child       (card/create-card! (card-with-query "Child card" :products) user)]
                (source-swap/swap-source [:table (mt/id :products)] [:card (:id native-card)])
                (let [updated-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))]
                  (is (= (:id native-card) (get-in updated-query [:stages 0 :source-card])))
                  (is (nil? (get-in updated-query [:stages 0 :source-table]))))))))))))

;;; ------------------------------------------------ Native Query Card Reference Tests ------------------------------------------------
;;; These tests cover card→card replacement specifically in native SQL queries using {{#id}} syntax

(deftest swap-native-card-ref-with-slug-test
  (testing "Card reference with slug ({{#42-my-query-name}}) is replaced with new card's slug"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {new-card-id :id} {:name "New Target Query"}
                       :model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "SELECT * FROM {{#999-old-query-name}} WHERE x > 1")}]
          (source-swap/swap-native-card-source! card-id 999 new-card-id)
          (let [updated-query (:dataset_query (t2/select-one :model/Card :id card-id))
                query         (lib/raw-native-query updated-query)]
            ;; Should have new card ID with slugified name
            (is (str/includes? query (str "{{#" new-card-id "-new-target-query}}")))
            (is (not (str/includes? query "{{#999")))))))))

(deftest swap-native-card-ref-with-slug-template-tags-test
  (testing "Template tags are updated with slug to match SQL when swapping slugged card refs"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {products-id :id} {:name "All Products"
                                                      :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :products)))}
                       :model/Card {orders-a-id :id} {:name "All Orders A"
                                                      :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders)))}
                       :model/Card {orders-b-id :id} {:name "All Orders B"
                                                      :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :orders)))}
                       :model/Card {native-card-id :id}
                       {:dataset_query
                        (lib/native-query mp (str "SELECT p.*, o.* "
                                                  "FROM {{#" products-id "-all-products}} p "
                                                  "JOIN {{#" orders-a-id "-all-orders-a}} o ON p.id = o.product_id"))}]
          ;; Swap orders A -> orders B
          (source-swap/swap-native-card-source! native-card-id orders-a-id orders-b-id)
          (let [updated-card  (t2/select-one :model/Card :id native-card-id)
                updated-query (:dataset_query updated-card)
                sql           (lib/raw-native-query updated-query)
                template-tags (get-in updated-query [:stages 0 :template-tags])]
            ;; SQL should have the new slugged reference
            (is (str/includes? sql (str "{{#" orders-b-id "-all-orders-b}}")))
            (is (not (str/includes? sql (str "{{#" orders-a-id))))
            ;; Template tags should have matching key
            (is (contains? template-tags (str "#" orders-b-id "-all-orders-b")))
            (is (not (contains? template-tags (str "#" orders-a-id "-all-orders-a"))))
            ;; Products reference should be unchanged
            (is (str/includes? sql (str "{{#" products-id "-all-products}}")))
            (is (contains? template-tags (str "#" products-id "-all-products")))))))))

(deftest swap-native-card-ref-with-whitespace-test
  (testing "Card reference with whitespace ({{ #42 }}) is replaced correctly"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "SELECT * FROM {{ #999 }} WHERE x > 1")}]
          (source-swap/swap-native-card-source! card-id 999 888)
          (let [updated-query (:dataset_query (t2/select-one :model/Card :id card-id))
                query         (lib/raw-native-query updated-query)]
            (is (str/includes? query "{{#888}}"))
            (is (not (str/includes? query "#999")))))))))

(deftest swap-native-card-ref-multiple-test
  (testing "Multiple card references to the same card are all replaced"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "SELECT * FROM {{#999}} a JOIN {{#999}} b ON a.id = b.id")}]
          (source-swap/swap-native-card-source! card-id 999 888)
          (let [updated-query (:dataset_query (t2/select-one :model/Card :id card-id))
                query         (lib/raw-native-query updated-query)]
            (is (= 2 (count (re-seq #"\{\{#888\}\}" query))))
            (is (not (str/includes? query "{{#999}}")))))))))

(deftest swap-native-card-ref-in-cte-test
  (testing "Card reference in CTE is replaced correctly"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "WITH base AS {{#999}} SELECT * FROM base WHERE x > 1")}]
          (source-swap/swap-native-card-source! card-id 999 888)
          (let [updated-query (:dataset_query (t2/select-one :model/Card :id card-id))
                query         (lib/raw-native-query updated-query)]
            (is (str/includes? query "WITH base AS {{#888}}"))
            (is (not (str/includes? query "{{#999}}")))))))))

(deftest swap-native-card-ref-with-alias-test
  (testing "Card reference with alias ({{#42}} AS t) is replaced correctly"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "SELECT t.* FROM {{#999}} AS t WHERE t.x > 1")}]
          (source-swap/swap-native-card-source! card-id 999 888)
          (let [updated-query (:dataset_query (t2/select-one :model/Card :id card-id))
                query         (lib/raw-native-query updated-query)]
            (is (str/includes? query "{{#888}} AS t"))
            (is (not (str/includes? query "{{#999}}")))))))))

(deftest swap-native-card-ref-preserves-other-params-test
  (testing "Other template params are preserved when replacing card reference"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "SELECT * FROM {{#999}} WHERE status = {{status}} AND total > {{min_total}}")}]
          (source-swap/swap-native-card-source! card-id 999 888)
          (let [updated-query (:dataset_query (t2/select-one :model/Card :id card-id))
                query         (lib/raw-native-query updated-query)
                tags          (lib/template-tags updated-query)]
            (is (str/includes? query "{{#888}}"))
            (is (str/includes? query "{{status}}"))
            (is (str/includes? query "{{min_total}}"))
            (is (contains? tags "status"))
            (is (contains? tags "min_total"))))))))

(deftest swap-native-card-ref-different-cards-test
  (testing "Only the specified card reference is replaced, others are preserved"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "SELECT * FROM {{#999}} a JOIN {{#777}} b ON a.id = b.id")}]
          (source-swap/swap-native-card-source! card-id 999 888)
          (let [updated-query (:dataset_query (t2/select-one :model/Card :id card-id))
                query         (lib/raw-native-query updated-query)]
            (is (str/includes? query "{{#888}}"))
            (is (str/includes? query "{{#777}}"))
            (is (not (str/includes? query "{{#999}}")))))))))

(deftest swap-native-card-ref-in-subquery-test
  (testing "Card reference in subquery is replaced correctly"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "SELECT * FROM orders WHERE product_id IN (SELECT id FROM {{#999}})")}]
          (source-swap/swap-native-card-source! card-id 999 888)
          (let [updated-query (:dataset_query (t2/select-one :model/Card :id card-id))
                query         (lib/raw-native-query updated-query)]
            (is (str/includes? query "FROM {{#888}}"))
            (is (not (str/includes? query "{{#999}}")))))))))

(deftest swap-native-card-ref-in-optional-clause-test
  (testing "Card reference inside optional clause [[...{{#42}}...]] is replaced correctly"
    (mt/with-premium-features #{:dependencies}
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query
                                                  (lib/native-query mp "SELECT * FROM orders WHERE 1=1 [[AND product_id IN (SELECT id FROM {{#999}})]]\n")}]
          (source-swap/swap-native-card-source! card-id 999 888)
          (let [updated-query (:dataset_query (t2/select-one :model/Card :id card-id))
                query         (lib/raw-native-query updated-query)]
            (is (str/includes? query "{{#888}}"))
            (is (not (str/includes? query "{{#999}}")))))))))

;;; ------------------------------------------------ swap-source: transforms ------------------------------------------------

(defn- transform-sourced-from-card
  "Create a Transform map whose query sources `inner-card`."
  [transform-name inner-card]
  (let [mp (mt/metadata-provider)]
    {:source {:type "query"
              :query (lib/query mp (lib.metadata/card mp (:id inner-card)))}
     :name   transform-name
     :target {:database (mt/id) :table transform-name}}))

(defn- transform-sourced-from-table
  "Create a Transform map whose query sources a table."
  [transform-name table-kw]
  (let [mp (mt/metadata-provider)]
    {:source {:type "query"
              :query (lib/query mp (lib.metadata/table mp (mt/id table-kw)))}
     :name   transform-name
     :target {:database (mt/id) :table transform-name}}))

(deftest swap-source-card-to-card-with-transform-test
  (testing "swap-source card -> card: transform's source query is updated"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-card-card-transform@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency :model/Transform]
            (let [old-source (card/create-card! (card-with-query "Old source" :products) user)
                  new-source (card/create-card! (card-with-query "New source" :products) user)]
              (mt/with-temp [:model/Transform {transform-id :id} (transform-sourced-from-card "test_transform_c2c" old-source)]
                (source-swap/swap-source [:card (:id old-source)] [:card (:id new-source)])
                (let [updated-source (t2/select-one-fn :source :model/Transform :id transform-id)]
                  (is (= (:id new-source) (get-in updated-source [:query :stages 0 :source-card]))))))))))))

(deftest swap-source-table-to-card-with-transform-test
  (testing "swap-source table -> card: transform's source query changes to source-card"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-table-card-transform@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency :model/Transform]
            (with-restored-card-queries
              (let [new-source (card/create-card! (card-with-query "New source" :products) user)]
                (mt/with-temp [:model/Transform {transform-id :id} (transform-sourced-from-table "test_transform_t2c" :products)]
                  (source-swap/swap-source [:table (mt/id :products)] [:card (:id new-source)])
                  (let [updated-source (t2/select-one-fn :source :model/Transform :id transform-id)]
                    (is (= (:id new-source) (get-in updated-source [:query :stages 0 :source-card])))
                    (is (nil? (get-in updated-source [:query :stages 0 :source-table])))))))))))))

(deftest swap-source-card-to-table-with-transform-test
  (testing "swap-source card -> table: transform's source query changes to source-table"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-card-table-transform@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency :model/Transform]
            (let [old-source (card/create-card! (card-with-query "Old source" :products) user)]
              (mt/with-temp [:model/Transform {transform-id :id} (transform-sourced-from-card "test_transform_c2t" old-source)]
                (source-swap/swap-source [:card (:id old-source)] [:table (mt/id :products)])
                (let [updated-source (t2/select-one-fn :source :model/Transform :id transform-id)]
                  (is (= (mt/id :products) (get-in updated-source [:query :stages 0 :source-table])))
                  (is (nil? (get-in updated-source [:query :stages 0 :source-card]))))))))))))

(deftest swap-source-card-to-card-with-card-and-transform-test
  (testing "swap-source card -> card: both child card and transform are updated"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-card-card-both@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency :model/Transform]
            (let [old-source (card/create-card! (card-with-query "Old source" :products) user)
                  new-source (card/create-card! (card-with-query "New source" :products) user)
                  child      (card/create-card! (card-sourced-from "Child card" old-source) user)]
              (mt/with-temp [:model/Transform {transform-id :id} (transform-sourced-from-card "test_transform_both" old-source)]
                (source-swap/swap-source [:card (:id old-source)] [:card (:id new-source)])
                (let [updated-card-query (t2/select-one-fn :dataset_query :model/Card :id (:id child))
                      updated-source     (t2/select-one-fn :source :model/Transform :id transform-id)]
                  (is (= (:id new-source) (get-in updated-card-query [:stages 0 :source-card]))
                      "Child card's source-card should be updated")
                  (is (= (:id new-source) (get-in updated-source [:query :stages 0 :source-card]))
                      "Transform's source query source-card should be updated"))))))))))

;;; ----------------------------------------- DashboardCard column_settings upgrade ------------------------------------------

(def vis-settings {:column_settings
                   {"[\"name\",\"name\"]"
                    {:click_behavior
                     {:parameterMapping
                      ;; yes, this really is a keyword in the data that comes back
                      {(keyword (pr-str "[\"dimension\",[\"field\",37,{\"base-type\":\"type{:Text\",\"source-field\":25}],{\"stage-number\":0}]"))
                       {:source
                        {:type "column", :id "name", :name "name"},

                        :target
                        {:type "dimension",
                         :id
                         "[\"dimension\",[\"field\",37,{\"base-type\":\"type/Text\",\"source-field\":25}],{\"stage-number\":0}]",
                         :dimension
                         ["dimension"
                          [:field 37 {:base-type :type/Text, :source-field 25}]
                          {:stage-number 0}]},
                        :id
                        "[\"dimension\",[\"field\",37,{\"base-type\":\"type/Text\",\"source-field\":25}],{\"stage-number\":0}]"}},
                      :targetId 7048,
                      :linkType "question",
                      :type "link"}}}})

(deftest swap-source-card-to-card-updates-dashcard-column-settings-test
  (testing "swap-source card -> card: DashboardCard column_settings keys are upgraded"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-dashcard-cs@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [old-source (card/create-card! (card-with-query "Old source" :products) user)
                  new-source (card/create-card! (card-with-query "New source" :products) user)
                  child      (card/create-card! (card-sourced-from "Child card" old-source) user)]
              (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}
                             :model/DashboardCard {dashcard-id :id}
                             {:dashboard_id dashboard-id
                              :card_id (:id child)
                              :visualization_settings vis-settings}]
                (source-swap/swap-source [:card (:id old-source)] [:card (:id new-source)])
                ;; TODO (eric): Add assertions
                ))))))))

(deftest swap-source-no-column-settings-test
  (testing "swap-source: DashboardCards without column_settings are unaffected"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-dashcard-no-cs@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [old-source (card/create-card! (card-with-query "Old source" :products) user)
                  new-source (card/create-card! (card-with-query "New source" :products) user)
                  child      (card/create-card! (card-sourced-from "Child card" old-source) user)]
              (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}
                             :model/DashboardCard {dashcard-id :id}
                             {:dashboard_id dashboard-id
                              :card_id (:id child)
                              :visualization_settings {:some_setting "value"}}]
                (source-swap/swap-source [:card (:id old-source)] [:card (:id new-source)])
                (let [updated-viz (t2/select-one-fn :visualization_settings :model/DashboardCard :id dashcard-id)]
                  (is (= {:some_setting "value"} updated-viz)
                      "Visualization settings without column_settings should be unchanged"))))))))))

(deftest swap-source-name-based-column-settings-keys-preserved-test
  (testing "swap-source: name-based column_settings keys are not modified"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-dashcard-name-cs@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [old-source (card/create-card! (card-with-query "Old source" :products) user)
                  new-source (card/create-card! (card-with-query "New source" :products) user)
                  child      (card/create-card! (card-sourced-from "Child card" old-source) user)
                  name-key   (json/encode ["name" "MyColumn"])]
              (mt/with-temp [:model/Dashboard {dashboard-id :id} {:name "Test Dashboard"}
                             :model/DashboardCard {dashcard-id :id}
                             {:dashboard_id dashboard-id
                              :card_id (:id child)
                              :visualization_settings {:column_settings {name-key {:column_title "Custom"}}}}]
                (source-swap/swap-source [:card (:id old-source)] [:card (:id new-source)])
                (let [updated-viz (t2/select-one-fn :visualization_settings :model/DashboardCard :id dashcard-id)
                      updated-cs  (:column_settings updated-viz)]
                  (is (contains? updated-cs name-key)
                      "Name-based column settings key should be preserved")
                  (is (= {:column_title "Custom"} (get updated-cs name-key))
                      "Name-based column settings value should be preserved"))))))))))

;;; ------------------------------------------------ Mixed Chain Tests ------------------------------------------------
;;; These tests cover chains that mix MBQL and native queries

(deftest swap-source-mixed-chain-test
  (testing "swap-source propagates through: MBQL Model → Native Card → MBQL Card"
    (mt/dataset test-data
      (mt/with-premium-features #{:dependencies}
        (mt/with-temp [:model/User user {:email "swap-mixed-chain@test.com"}]
          (mt/with-model-cleanup [:model/Card :model/Dependency]
            (let [ ;; Chain: old-model → native-card ({{#id}}) → mbql-card (source-card)
                  old-model   (card/create-card! (card-with-query "Old Model" :products) user)
                  new-model   (card/create-card! (card-with-query "New Model" :products) user)
                  _           (wait-for-result-metadata (:id old-model))
                  native-card (card/create-card! (native-card-sourced-from "Native Card" old-model) user)
                  _           (wait-for-result-metadata (:id native-card))
                  mbql-card   (card/create-card! (card-sourced-from "MBQL Card" native-card) user)]
              ;; Swap the model at the root
              (source-swap/swap-source [:card (:id old-model)] [:card (:id new-model)])
              ;; Native card's {{#old-id}} should be updated to {{#new-id}}
              (let [native-query (t2/select-one-fn :dataset_query :model/Card :id (:id native-card))
                    native-sql   (get-in native-query [:stages 0 :native])]
                (is (str/includes? native-sql (str "{{#" (:id new-model) "}}"))
                    "Native card should reference new model")
                (is (not (str/includes? native-sql (str "{{#" (:id old-model) "}}")))
                    "Native card should not reference old model"))
              ;; MBQL card should still reference native-card (unchanged, it's not a direct dependent)
              (let [mbql-query (t2/select-one-fn :dataset_query :model/Card :id (:id mbql-card))]
                (is (= (:id native-card) (get-in mbql-query [:stages 0 :source-card]))
                    "MBQL card should still reference native card (unchanged)")))))))))

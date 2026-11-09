(ns metabase.serialization.card-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card.metadata :as card.metadata]
   [metabase.serialization.core :as serialization]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- query-count [thunk]
  (t2/with-call-count [call-count]
    (thunk)
    (call-count)))

(defn- venues-query []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/filter (lib/> (lib.metadata/field mp (mt/id :venues :price)) 1))
        (lib/breakout (lib.metadata/field mp (mt/id :venues :category_id))))))

(defn- extract-one [model-name entity]
  (let [[x] (into [] (serialization/export model-name [entity]))]
    (when (instance? Throwable x)
      (throw x))
    x))

(deftest card-round-trip-test
  (testing "a Card exports its query with references and imports back to the same query"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card       card          {:collection_id coll-id :dataset_query (venues-query)}]
      (let [exported (extract-one :model/Card card)
            db-name  (t2/select-one-fn :name :model/Database :id (mt/id))
            [row]    (serialization/import :model/Card [exported])]
        (is (=? {:dataset_query {:database db-name
                                 :stages   [{:source-table [db-name "PUBLIC" "VENUES"]}]}}
                exported))
        (is (not (contains? exported :database_id)))
        (is (=? {:collection_id coll-id
                 :dataset_query {:database (mt/id)
                                 :stages   [{:source-table (mt/id :venues)}]}}
                row))))))

(deftest extract-cards-query-count-test
  (testing "exporting Cards takes as many queries for many Cards as for few"
    (mt/with-temp [:model/Collection {coll-id :id} {}]
      (let [cards   (vec (for [i (range 8)]
                           (t2/insert-returning-instance! :model/Card {:name                   (str "Card " i)
                                                                       :collection_id          coll-id
                                                                       :creator_id             (mt/user->id :rasta)
                                                                       :display                :table
                                                                       :dataset_query          (venues-query)
                                                                       :visualization_settings {}})))
            extract #(into [] (serialization/export :model/Card %))]
        (try
          (is (every? map? (extract cards)))
          (is (= (query-count #(extract (take 2 cards)))
                 (query-count #(extract cards))))
          (finally
            (t2/delete! :model/Card :id [:in (map :id cards)])))))))

(deftest snippet-card-template-tag-test
  (testing "a snippet's card template tags carry the card's entity id on export, and the local id on import"
    (mt/with-temp [:model/Card               {card-id :id card-eid :entity_id} {}
                   :model/NativeQuerySnippet snippet {:name          "snippet"
                                                      :content       (str "SELECT * FROM {{#" card-id "-orders}}")
                                                      :template_tags {(str "#" card-id "-orders")
                                                                      {:type         :card
                                                                       :name         (str "#" card-id "-orders")
                                                                       :display-name "Orders"
                                                                       :card-id      card-id
                                                                       :id           "aaaa"}}}]
      (let [exported (extract-one :model/NativeQuerySnippet snippet)
            [row]    (serialization/import :model/NativeQuerySnippet [exported])]
        (is (= (str "SELECT * FROM {{#" card-eid "-orders}}") (:content exported)))
        (is (= (str "SELECT * FROM {{#" card-id "-orders}}") (:content row)))
        (is (=? {(str "#" card-id "-orders") {:card-id card-id}} (:template_tags row)))))))

(deftest document-links-test
  (testing "a document's card embeds and smart links export as entity paths and import back to ids"
    (mt/with-temp [:model/Card     {card-id :id card-eid :entity_id} {}
                   :model/Document document {:name         "doc"
                                             :content_type "application/json+vnd.prose-mirror"
                                             :document     {:type    "doc"
                                                            :content [{:type "cardEmbed" :attrs {"id" card-id}}
                                                                      {:type  "smartLink"
                                                                       :attrs {"entityId" (mt/id :venues)
                                                                               "model"    "table"}}]}}]
      (let [exported (extract-one :model/Document (t2/select-one :model/Document :id (:id document)))
            [row]    (serialization/import :model/Document [exported])]
        (is (=? {:document {:content [{:attrs {"id" [{:model "Card" :id card-eid}]}}
                                      {:attrs {"entityId" [{:model "Database"} {:model "Schema"} {:model "Table" :id "VENUES"}]}}]}}
                exported))
        (is (=? {:content [{:attrs {"id" card-id}}
                           {:attrs {"entityId" (mt/id :venues)}}]}
                (:document row)))))))

(deftest model-reimport-keeps-inferred-metadata-test
  (testing "re-importing an unchanged model keeps the metadata its query infers, with the overrides of its export"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card       {card-id :id} {:collection_id coll-id :type :model :dataset_query (venues-query)}]
      (let [card     (t2/select-one :model/Card :id card-id)
            exported (extract-one :model/Card (update card :result_metadata
                                                      #(mapv (fn [col] (assoc col :display_name (str "Model " (:name col)))) %)))]
        (serialization/load :model/Card [exported])
        (let [metadata (t2/select-one-fn :result_metadata :model/Card :id card-id)]
          (is (= (map :base_type (:result_metadata card)) (map :base_type metadata)))
          (is (not-any? #(= :type/* (:base_type %)) metadata))
          (is (every? #(str/starts-with? (:display_name %) "Model ") metadata)))
        (testing "and an import of the overrides it stores infers nothing"
          (let [inferred (atom 0)]
            (mt/with-dynamic-fn-redefs [card.metadata/infer-metadata-with-model-overrides
                                        (fn [& _] (swap! inferred inc) nil)]
              (serialization/load :model/Card [exported]))
            (is (zero? @inferred))))))))

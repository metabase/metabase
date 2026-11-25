(ns metabase.eid-translation.requests-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.serialization.core :as serialization]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest refs->ids-test
  (mt/with-temp [:model/Collection {coll-id :id coll-eid :entity_id} {}]
    (let [columns {:collection_id :model/Collection
                   :table_id      :model/Table
                   :field_id      :model/Field
                   :database_id   :model/Database
                   :creator_id    :model/User}]
      (testing "each ref of a column names its row by id: an entity id, a Table or Field ref, a Database name, an email"
        (is (= {:name          "x"
                :collection_id coll-id
                :table_id      (mt/id :venues)
                :field_id      (mt/id :venues :price)
                :database_id   (mt/id)
                :creator_id    (mt/user->id :crowberto)}
               (eid-translation/refs->ids {:name          "x"
                                           :collection_id coll-eid
                                           :table_id      [(:name (mt/db)) "PUBLIC" "VENUES"]
                                           :field_id      [(:name (mt/db)) "PUBLIC" "VENUES" "PRICE"]
                                           :database_id   (:name (mt/db))
                                           :creator_id    "crowberto@metabase.com"}
                                          columns))))
      (testing "a column holding a list has each of its refs replaced, and its numeric ids kept"
        (is (= {:collection_id [coll-id coll-id]}
               (eid-translation/refs->ids {:collection_id [coll-eid coll-id]} columns))))
      (testing "numeric ids, nils and absent columns stay as they are"
        (is (= {:collection_id coll-id :table_id nil}
               (eid-translation/refs->ids {:collection_id coll-id :table_id nil} columns)))))))

(deftest refs->ids-missing-row-test
  (testing "a ref that names no row is a 404"
    (doseq [[column ref] {:collection_id "abcdefghijklmnopqrstu"
                          :table_id      ["no such db" "PUBLIC" "VENUES"]
                          :database_id   "no such db"
                          :creator_id    "nobody@metabase.com"}]
      (testing column
        (is (=? {:status-code 404}
                (try
                  (eid-translation/refs->ids {column ref} {:collection_id :model/Collection
                                                           :table_id      :model/Table
                                                           :database_id   :model/Database
                                                           :creator_id    :model/User})
                  nil
                  (catch clojure.lang.ExceptionInfo e
                    (ex-data e)))))))))

(defn- export-column
  "`v`, the `column` of a `model` row `row`, as serialization exports it."
  [model column row v]
  (first ((get-in (serialization/spec model) [:transform column :export])
          serialization/app-db-store [(assoc row column v)] [v] {})))

(defn- decode-body-value
  "`v` decoded by `schema` as a request body's value is."
  [schema v]
  (mc/decode schema v (mtx/transformer {:name :api})))

(deftest structure-schema-test
  (let [mp       (mt/metadata-provider)
        source   {:type "query" :query (lib/query mp (lib.metadata/table mp (mt/id :venues)))}
        exported (export-column :model/Transform :source {} source)
        schema   (eid-translation/structure-schema :model/Transform :source :map)]
    (is (= [(:name (mt/db)) "PUBLIC" "VENUES"] (get-in exported [:query :stages 0 :source-table])))
    (testing "in entity id form, an exported structure decodes to the structure it names"
      (is (=? {:query {:database (mt/id) :stages [{:source-table (mt/id :venues)}]}}
              (eid-translation/do-with-entity-ids #(decode-body-value schema exported)))))
    (testing "otherwise it stays as it is"
      (is (= exported (decode-body-value schema exported))))))

(deftest structure-schema-row-test
  (testing "the import sees the columns of the row that the body does not give"
    (mt/with-temp [:model/Card {card-id :id card-eid :entity_id} {}]
      (let [row      {:content_type "application/json+vnd.prose-mirror"}
            document {:type    "doc"
                      :content [{:type "cardEmbed" :attrs {:id card-id :name nil}}]}
            exported (export-column :model/Document :document row document)]
        (is (= [{:model "Card" :id card-eid}] (get-in exported [:content 0 :attrs :id])))
        (is (= card-id
               (get-in (eid-translation/do-with-entity-ids
                        #(decode-body-value (eid-translation/structure-schema :model/Document :document row :map)
                                            exported))
                       [:content 0 :attrs :id])))))))

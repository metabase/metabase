(ns metabase-enterprise.serialization.v2.entity-ids-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.v2.backfill-ids :as serdes.backfill]
   [metabase-enterprise.serialization.v2.entity-ids :as v2.entity-ids]
   [metabase.models :refer [Collection Dashboard]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.time LocalDateTime)
   (java.sql DatabaseMetaData)))

(set! *warn-on-reflection* true)

(deftest seed-entity-ids-test
  (testing "Sanity check: should succeed before we go around testing specific situations"
    (is (true? (v2.entity-ids/seed-entity-ids!))))
  (testing "With a temp Collection with no entity ID"
    (let [now (LocalDateTime/of 2022 9 1 12 34 56)]
      (mt/with-temp! [Collection c {:name       "No Entity ID Collection"
                                    :slug       "no_entity_id_collection"
                                    :created_at now}]
        (t2/update! Collection (:id c) {:entity_id nil})
        (letfn [(entity-id []
                  (some-> (t2/select-one-fn :entity_id Collection :id (:id c)) str/trim))]
          (is (= nil
                 (entity-id)))
          (testing "Should return truthy on success"
            (is (= true
                   (v2.entity-ids/seed-entity-ids!))))
          (is (= "998b109c"
                 (entity-id))))
        (testing "Error: duplicate entity IDs"
          (mt/with-temp! [Collection c2 {:name       "No Entity ID Collection"
                                         :slug       "no_entity_id_collection"
                                         :created_at now}]
            (t2/update! Collection (:id c2) {:entity_id nil})
            (letfn [(entity-id []
                      (some-> (t2/select-one-fn :entity_id Collection :id (:id c2)) str/trim))]
              (is (= nil
                     (entity-id)))
              (testing "Should return falsey on error"
                (is (= false
                       (v2.entity-ids/seed-entity-ids!))))
              (is (= nil
                     (entity-id))))))))))

(deftest drop-entity-ids-test
  (mt/with-empty-h2-app-db
    (testing "With a temp Collection with an entity ID"
      (let [now (LocalDateTime/of 2022 9 1 12 34 56)]
        (mt/with-temp! [Collection c {:name       "No Entity ID Collection"
                                      :slug       "no_entity_id_collection"
                                      :created_at now}]
                       (letfn [(entity-id []
                                 (some-> (t2/select-one-fn :entity_id Collection :id (:id c)) str/trim))]
                         (is (some? (entity-id)))
                         (testing "Should return truthy on success"
                           (is (= true
                                  (v2.entity-ids/drop-entity-ids!))))
                         (is (nil? (entity-id)))))))
    (testing "empty table"
      (testing "has no entity ids"
        (mt/with-temp! [Collection _ {:name "No Entity ID Collection"
                                      :slug "no_entity_id_collection"}]
                       (is (nil? (t2/select-fn-set :entity-id Dashboard)))
                       (testing "but doesn't crash drop-entity-ids"
                         (is (= true
                                (v2.entity-ids/drop-entity-ids!)))
                         (is (nil? (t2/select-fn-set :entity-id Dashboard)))))))
    (testing "entity_id field is nullable everywhere so that drop-entity-ids will work for"
      (t2/with-connection [^java.sql.Connection conn]
        (doseq [m     (v2.entity-ids/toucan-models)
                :when (serdes.backfill/has-entity-id? m)
                :let  [rs (-> (.getMetaData conn)
                              (.getColumns nil nil (u/upper-case-en (name (t2/table-name m))) "ENTITY_ID"))]]
          (testing m
            (if (.next rs)
              (is (= DatabaseMetaData/columnNullable
                     ( .getInt rs "NULLABLE")))
              (is false "cannot get column information"))))))))

(ns metabase.eid-translation.responses-test
  (:require
   [clojure.test :refer :all]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.serialization.db :as serialization.db]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- as-json
  "`body` as an API response carries it: encoded to JSON and read back."
  [body]
  (json/decode+kw (json/encode body)))

(deftest ^:parallel missing-rows-keep-their-ids-test
  (testing "an id whose row is missing stays as it is, for every model, Databases and Users too"
    (let [table (t2/select-one :model/Table :id (mt/id :venues))
          body  (eid-translation/->entity-ids (assoc table :db_id Integer/MAX_VALUE :owner_user_id Integer/MAX_VALUE))]
      (is (=? {:id            vector?
               :db_id         Integer/MAX_VALUE
               :owner_user_id Integer/MAX_VALUE}
              (as-json body))))))

(deftest ^:parallel rows-without-entity-ids-test
  (testing "a row of a model without entity ids keeps its own id, but names the rows it references by their refs"
    (let [field-id (mt/id :venues :price)
          ref      [(:name (mt/db)) "PUBLIC" "VENUES" "PRICE"]]
      (is (=? {:id 12345 :field_id ref}
              (as-json (eid-translation/->entity-ids (t2/instance :model/FieldValues {:id 12345 :field_id field-id}))))))))

(deftest own-ref-from-the-row-test
  (testing "a row names itself by the entity id, name or email it holds, without reading it again"
    (let [eid   "abcdefghijklmnopqrstu"
          reads (atom 0)
          body  [(t2/instance :model/Card {:id Integer/MAX_VALUE :entity_id eid})
                 (t2/instance :model/Database {:id Integer/MAX_VALUE :name "a database"})
                 (t2/instance :model/User {:id Integer/MAX_VALUE :email "someone@example.com"})]]
      (is (=? [{:id eid :entity_id eid}
               {:id "a database" :name "a database"}
               {:id "someone@example.com" :email "someone@example.com"}]
              (mt/with-dynamic-fn-redefs [serialization.db/rows-by-pks (fn [& _] (swap! reads inc) [])]
                (as-json (eid-translation/->entity-ids body)))))
      (is (zero? @reads)))))

(deftest no-row-read-twice-test
  (testing "a rewrite reads each row it needs once, though the body and its structures name it many times"
    (mt/with-temp [:model/Card card {:dataset_query          (let [mp (mt/metadata-provider)]
                                                               (lib/filter (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                                                                           (lib/> (lib.metadata/field mp (mt/id :venues :price)) 1)))
                                     :parameters             [{:id "p" :type "category" :slug "p"
                                                               :target [:dimension [:field (mt/id :venues :price) nil]]}]
                                     :visualization_settings {:column_settings {(str "[\"ref\",[\"field\"," (mt/id :venues :price) ",null]]")
                                                                                {:column_title "Cost"}}}}]
      (let [reads   (atom [])
            rows-by (mt/original-fn #'serialization.db/rows-by-pks)
            body    (t2/select-one :model/Card :id (:id card))]
        (mt/with-dynamic-fn-redefs [serialization.db/rows-by-pks (fn [model pks columns]
                                                                   (swap! reads conj [model columns (set pks)])
                                                                   (rows-by model pks columns))]
          (eid-translation/->entity-ids body))
        (is (seq @reads))
        (is (= []
               (for [[[model columns] reads] (group-by (juxt first second) @reads)
                     :let  [pks (mapcat #(nth % 2) reads)]
                     :when (not= (count pks) (count (set pks)))]
                 [model columns (frequencies pks)])))))))

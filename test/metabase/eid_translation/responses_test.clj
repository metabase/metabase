(ns metabase.eid-translation.responses-test
  (:require
   [clojure.test :refer :all]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

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

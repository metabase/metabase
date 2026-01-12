(ns metabase.lib.test-util.uuid-dogs-metadata-provider
  (:require
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(def metadata-provider
  "A metadata provider that simulates the `uuid-dogs` test dataset."
  (lib.tu/mock-metadata-provider
   {:database meta/database
    :tables   [{:id   1
                :name "people"}
               {:id   2
                :name "dogs"}]
    :fields   [{:id            1
                :name          "id"
                :base-type     :type/UUID
                :semantic-type :type/PK
                :table-id      1}
               {:id        2
                :name      "name"
                :base-type :type/Text
                :table-id  1}
               {:id            3
                :name          "id"
                :base-type     :type/UUID
                :semantic-type :type/PK
                :table-id      2}
               {:id        4
                :name      "name"
                :base-type :type/Text
                :table-id  2}
               {:id                 5
                :name               "person-id"
                :base-type          :type/UUID
                :semantic-type      :type/FK
                :table-id           2
                :fk-target-field-id 1}]}))

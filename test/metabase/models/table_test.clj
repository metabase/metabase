(ns metabase.models.table-test
  (:require [clojure.test :refer :all]
            [metabase.models.table :refer [Table]]
            [metabase.test :as mt]
            [toucan.db :as db]))

(deftest slashes-in-schema-names-test
  (testing "Schema names should allow forward or back slashes (#8693, #12450)"
    (doseq [schema-name ["my\\schema"
                         "my\\\\schema"
                         "my/schema"
                         "my\\/schema"
                         "my\\\\/schema"]]
      (testing (format "Should be able to create/delete Table with schema name %s" (pr-str schema-name))
        (mt/with-temp Table [{table-id :id} {:schema schema-name}]
          (is (= schema-name
                 (db/select-one-field :schema Table :id table-id))))))))

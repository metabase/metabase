(ns metabase.lib.test-util.sad-toucan-incidents-metadata-provider
  (:require
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(defonce ^:private table-id-offset (rand-int 100))
(defonce ^:private field-id-offset (* table-id-offset 10))

(defn id
  "Like [[metabase.lib.test-metadata/id]] but specifically for this test dataset."
  ([]
   1)
  ([table-name]
   (+ (case table-name
        :incidents 1)
      table-id-offset))
  ([table-name field-name]
   (+ (case table-name
        :incidents (case field-name
                     :id        1
                     :severity  2
                     :timestamp 3))
      field-id-offset)))

(def metadata-provider
  "A metadata provider that simulates the `sad-toucan-incidents` test dataset."
  (lib.tu/mock-metadata-provider
   {:database meta/database
    :tables   [{:active          true
                :db-id           1
                :display-name    "Incidents"
                :id              (id :incidents)
                :name            "INCIDENTS"
                :schema          "PUBLIC"
                :visibility-type nil
                :lib/type        :metadata/table}]
    :fields   [{:active             true
                :base-type          :type/BigInteger
                :coercion-strategy  nil
                :database-type      "BIGINT"
                :description        nil
                :display-name       "ID"
                :effective-type     :type/BigInteger
                :fingerprint        nil
                :fk-target-field-id nil
                :id                 (id :incidents :id)
                :name               "ID"
                :nfc-path           nil
                :parent-id          nil
                :position           0
                :semantic-type      :type/PK
                :settings           nil
                :table-id           (id :incidents)
                :visibility-type    :normal
                :lib/type           :metadata/column}
               {:active             true
                :base-type          :type/Integer
                :coercion-strategy  nil
                :database-type      "INTEGER"
                :description        nil
                :display-name       "Severity"
                :effective-type     :type/Integer
                :fingerprint        nil
                :fk-target-field-id nil
                :id                 (id :incidents :severity)
                :name               "SEVERITY"
                :nfc-path           nil
                :parent-id          nil
                :position           1
                :semantic-type      nil
                :settings           nil
                :table-id           (id :incidents)
                :visibility-type    :normal
                :lib/type           :metadata/column}
               {:active             true
                :base-type          :type/BigInteger
                :coercion-strategy  :Coercion/UNIXMilliSeconds->DateTime
                :database-type      "BIGINT"
                :description        nil
                :display-name       "Timestamp"
                :effective-type     :type/Instant
                :fingerprint        nil
                :fk-target-field-id nil
                :id                 (id :incidents :timestamp)
                :name               "TIMESTAMP"
                :nfc-path           nil
                :parent-id          nil
                :position           2
                :semantic-type      nil
                :settings           nil
                :table-id           (id :incidents)
                :visibility-type    :normal
                :lib/type           :metadata/column}]}))

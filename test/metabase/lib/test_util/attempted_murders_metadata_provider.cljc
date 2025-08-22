(ns metabase.lib.test-util.attempted-murders-metadata-provider
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
        :attempts 1)
      table-id-offset))
  ([table-name field-name]
   (+ (case table-name
        :attempts (case field-name
                    :id             1
                    :date           2
                    :datetime       3
                    :datetime-ltz   4
                    :datetime-tz    5
                    :datetime-tz-id 6
                    :time           7
                    :time-ltz       8
                    :time-tz        9
                    :num-crows      10))
      field-id-offset)))

(def metadata-provider
  "A metadata provider that simulates the `attempted-murders` test dataset."
  (lib.tu/mock-metadata-provider
   {:database meta/database
    :tables   [{:active          true
                :db-id           1
                :display-name    "Attempts"
                :id              (id :attempts)
                :name            "ATTEMPTS"
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
                :id                 (id :attempts :id)
                :name               "ID"
                :nfc-path           nil
                :parent-id          nil
                :position           0
                :semantic-type      :type/PK
                :settings           nil
                :table-id           (id :attempts)
                :visibility-type    :normal
                :lib/type           :metadata/column}
               {:active             true
                :base-type          :type/Date
                :coercion-strategy  nil
                :database-type      "DATE"
                :description        nil
                :display-name       "Date"
                :effective-type     :type/Date
                :fingerprint        nil
                :fk-target-field-id nil
                :id                 (id :attempts :date)
                :name               "DATE"
                :nfc-path           nil
                :parent-id          nil
                :position           1
                :semantic-type      nil
                :settings           nil
                :table-id           (id :attempts)
                :visibility-type    :normal
                :lib/type           :metadata/column}
               {:active             true
                :base-type          :type/DateTime
                :coercion-strategy  nil
                :database-type      "TIMESTAMP"
                :description        nil
                :display-name       "Datetime"
                :effective-type     :type/DateTime
                :fingerprint        nil
                :fk-target-field-id nil
                :id                 (id :attempts :datetime)
                :name               "DATETIME"
                :nfc-path           nil
                :parent-id          nil
                :position           2
                :semantic-type      nil
                :settings           nil
                :table-id           (id :attempts)
                :visibility-type    :normal
                :lib/type           :metadata/column}
               {:active             true
                :base-type          :type/DateTimeWithLocalTZ
                :coercion-strategy  nil
                :database-type      "TIMESTAMP WITH TIME ZONE"
                :description        nil
                :display-name       "Datetime Ltz"
                :effective-type     :type/DateTimeWithLocalTZ
                :fingerprint        nil
                :fk-target-field-id nil
                :id                 (id :attempts :datetime-ltz)
                :name               "DATETIME_LTZ"
                :nfc-path           nil
                :parent-id          nil
                :position           3
                :semantic-type      nil
                :settings           nil
                :table-id           (id :attempts)
                :visibility-type    :normal
                :lib/type           :metadata/column}
               {:active             true
                :base-type          :type/DateTimeWithLocalTZ
                :coercion-strategy  nil
                :database-type      "TIMESTAMP WITH TIME ZONE"
                :description        nil
                :display-name       "Datetime Tz"
                :effective-type     :type/DateTimeWithLocalTZ
                :fingerprint        nil
                :fk-target-field-id nil
                :id                 (id :attempts :datetime-tz)
                :name               "DATETIME_TZ"
                :nfc-path           nil
                :parent-id          nil
                :position           4
                :semantic-type      nil
                :settings           nil
                :table-id           (id :attempts)
                :visibility-type    :normal
                :lib/type           :metadata/column}
               {:active             true
                :base-type          :type/DateTimeWithLocalTZ
                :coercion-strategy  nil
                :database-type      "TIMESTAMP WITH TIME ZONE"
                :description        nil
                :display-name       "Datetime Tz ID"
                :effective-type     :type/DateTimeWithLocalTZ
                :fingerprint        nil
                :fk-target-field-id nil
                :id                 (id :attempts :datetime-tz-id)
                :name               "DATETIME_TZ_ID"
                :nfc-path           nil
                :parent-id          nil
                :position           5
                :semantic-type      nil
                :settings           nil
                :table-id           (id :attempts)
                :visibility-type    :normal
                :lib/type           :metadata/column}
               {:active             true
                :base-type          :type/Time
                :coercion-strategy  nil
                :database-type      "TIME"
                :description        nil
                :display-name       "Time"
                :effective-type     :type/Time
                :fingerprint        nil
                :fk-target-field-id nil
                :id                 (id :attempts :time)
                :name               "TIME"
                :nfc-path           nil
                :parent-id          nil
                :position           6
                :semantic-type      nil
                :settings           nil
                :table-id           (id :attempts)
                :visibility-type    :normal
                :lib/type           :metadata/column}
               {:active             true
                :base-type          :type/Time
                :coercion-strategy  nil
                :database-type      "TIME"
                :description        nil
                :display-name       "Time Ltz"
                :effective-type     :type/Time
                :fingerprint        nil
                :fk-target-field-id nil
                :id                 (id :attempts :time-ltz)
                :name               "TIME_LTZ"
                :nfc-path           nil
                :parent-id          nil
                :position           7
                :semantic-type      nil
                :settings           nil
                :table-id           (id :attempts)
                :visibility-type    :normal
                :lib/type           :metadata/column}
               {:active             true
                :base-type          :type/Time
                :coercion-strategy  nil
                :database-type      "TIME"
                :description        nil
                :display-name       "Time Tz"
                :effective-type     :type/Time
                :fingerprint        nil
                :fk-target-field-id nil
                :id                 (id :attempts :time-tz)
                :name               "TIME_TZ"
                :nfc-path           nil
                :parent-id          nil
                :position           8
                :semantic-type      nil
                :settings           nil
                :table-id           (id :attempts)
                :visibility-type    :normal
                :lib/type           :metadata/column}
               {:active             true
                :base-type          :type/Integer
                :coercion-strategy  nil
                :database-type      "INTEGER"
                :description        nil
                :display-name       "Num Crows"
                :effective-type     :type/Integer
                :fingerprint        nil
                :fk-target-field-id nil
                :id                 (id :attempts :num-crows)
                :name               "NUM_CROWS"
                :nfc-path           nil
                :parent-id          nil
                :position           9
                :semantic-type      nil
                :settings           nil
                :table-id           (id :attempts)
                :visibility-type    :normal
                :lib/type           :metadata/column}]}))

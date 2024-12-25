(ns ^:mb/driver-tests metabase.driver.sql-jdbc.sync.describe-table-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.db.metadata-queries :as metadata-queries]
   [metabase.driver :as driver]
   [metabase.driver.mysql :as mysql]
   [metabase.driver.mysql-test :as mysql-test]
   [metabase.driver.sql :as driver.sql]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.describe-table :as sql-jdbc.describe-table]
   [metabase.driver.sql-jdbc.sync.interface :as sql-jdbc.sync.interface]
   [metabase.driver.util :as driver.u]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [metabase.test.data.sql :as sql.tx]
   [metabase.timeseries-query-processor-test.util :as tqpt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- uses-default-describe-table? [driver]
  (and (identical? (get-method driver/describe-table :sql-jdbc) (get-method driver/describe-table driver))
       (not (driver.u/supports? driver :describe-fields nil))))

(defn- uses-default-describe-fields? [driver]
  (and (identical? (get-method driver/describe-fields :sql-jdbc) (get-method driver/describe-fields driver))
       (driver.u/supports? driver :describe-fields nil)))

(defn- sql-jdbc-drivers-using-default-describe-table-or-fields-impl
  "All SQL JDBC drivers that use the default SQL JDBC implementation of `describe-table`, or `describe-fields`."
  []
  (set
   (filter
    (fn [driver]
      (or (uses-default-describe-table? driver)
          (uses-default-describe-fields? driver)))
    (descendants driver/hierarchy :sql-jdbc))))

(deftest ^:parallel describe-table-test
  (mt/test-driver :h2
    (assert (uses-default-describe-table? :h2)
            "Make sure H2 uses the default `describe-table` implementation")
    (is (= {:name "VENUES",
            :fields
            #{{:name                       "ID"
               :database-type              "BIGINT"
               :base-type                  :type/BigInteger
               :database-position          0
               :pk?                        true
               :database-required          false
               :database-is-auto-increment true
               :json-unfolding             false}
              {:name                       "NAME"
               :database-type              "CHARACTER VARYING"
               :base-type                  :type/Text
               :database-position          1
               :database-required          false
               :database-is-auto-increment false
               :json-unfolding             false}
              {:name                       "CATEGORY_ID"
               :database-type              "INTEGER"
               :base-type                  :type/Integer
               :database-position          2
               :database-required          false
               :database-is-auto-increment false
               :json-unfolding             false}
              {:name                       "LATITUDE"
               :database-type              "DOUBLE PRECISION"
               :base-type                  :type/Float
               :database-position          3
               :database-required          false
               :database-is-auto-increment false
               :json-unfolding             false}
              {:name                       "LONGITUDE"
               :database-type              "DOUBLE PRECISION"
               :base-type                  :type/Float
               :database-position          4
               :database-required          false
               :database-is-auto-increment false
               :json-unfolding             false}
              {:name                       "PRICE"
               :database-type              "INTEGER"
               :base-type                  :type/Integer
               :database-position          5
               :database-required          false
               :database-is-auto-increment false
               :json-unfolding             false}}}
           (driver/describe-table :h2 (mt/db) {:name "VENUES"})))))

(deftest describe-auto-increment-on-non-pk-field-test
  (testing "a non-pk field with auto-increment should be have metabase_field.database_is_auto_increment=true"
    (one-off-dbs/with-blank-db
      (doseq [statement [;; H2 needs that 'guest' user for QP purposes. Set that up
                         "CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';"
                         ;; Keep DB open until we say otherwise :)
                         "SET DB_CLOSE_DELAY -1;"
                         ;; create table & load data
                         "DROP TABLE IF EXISTS \"birds\";"
                         "CREATE TABLE \"employee_counter\" (\"id\" INTEGER AUTO_INCREMENT PRIMARY KEY, \"count\" INTEGER AUTO_INCREMENT, \"rank\" INTEGER NOT NULL)"
                         "GRANT ALL ON \"employee_counter\" TO GUEST;"]]
        (jdbc/execute! one-off-dbs/*conn* [statement]))
      (sync/sync-database! (mt/db))
      (is (= {:fields #{{:base-type                 :type/Integer
                         :database-is-auto-increment true
                         :database-position         0
                         :database-required         false
                         :database-type             "INTEGER"
                         :name                      "id"
                         :pk?                       true
                         :json-unfolding            false}
                        {:base-type                 :type/Integer
                         :database-is-auto-increment true
                         :database-position         1
                         :database-required         false
                         :database-type             "INTEGER"
                         :name                      "count"
                         :json-unfolding            false}
                        {:base-type                 :type/Integer
                         :database-is-auto-increment false
                         :database-position         2
                         :database-required         true
                         :database-type             "INTEGER"
                         :name                      "rank"
                         :json-unfolding            false}}
              :name "employee_counter"}
             (sql-jdbc.describe-table/describe-table :h2 (mt/id) {:name "employee_counter"}))))))

(defn- describe-fields-for-table [db table]
  (let [driver (driver.u/database->driver db)]
    (sort-by :database-position
             (if (driver.u/supports? driver :describe-fields db)
               (vec (m/mapply driver/describe-fields
                              driver
                              db
                              (cond-> {:table-names [(:name table)]}
                                (:schema table) (assoc :schema-names [(:schema table)]))))
               (:fields (driver/describe-table driver db table))))))

(defmethod driver/database-supports? [::driver/driver ::describe-pks]
  [driver _feature database]
  ;; This is a decent proxy for drivers that set the `pk?` metadata field.
  (driver/database-supports? driver :metadata/key-constraints database))

;; These drivers set the `:pk?` field even though they do no support key-constriants
(doseq [driver [:mongo :sqlite]]
  (defmethod driver/database-supports? [driver ::describe-pks]
    [_driver _feature _database]
    true))

(deftest describe-fields-shared-attributes-test
  (testing "common metadata attributes"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions)
      (is (=?
           [[0 false true (driver/database-supports? driver/*driver* ::describe-pks (mt/db))]
            [1 false false false]
            [2 false false false]
            [3 false false false]
            [4 false false false]
            [5 false false false]]
           (sort-by
            :first
            (map (juxt :database-position
                       :database-required
                       :database-is-auto-increment
                       (comp boolean :pk?))
                 (describe-fields-for-table (mt/db) (t2/select-one :model/Table :id (mt/id :venues))))))))
    (mt/test-drivers (mt/normal-drivers-without-feature :actions)
      (is (=?
           [[0 (driver/database-supports? driver/*driver* ::describe-pks (mt/db))]
            [1 false]
            [2 false]
            [3 false]
            [4 false]
            [5 false]]
           (sort-by
            :first
            (map (juxt :database-position (comp boolean :pk?))
                 (describe-fields-for-table (mt/db) (t2/select-one :model/Table :id (mt/id :venues))))))))))

(deftest database-types-fallback-test
  (mt/test-drivers (apply disj (sql-jdbc-drivers-using-default-describe-table-or-fields-impl)
                          (tqpt/timeseries-drivers))
    (let [org-result-set-seq jdbc/result-set-seq]
      (with-redefs [jdbc/result-set-seq (fn [& args]
                                          (map #(dissoc % :type_name) (apply org-result-set-seq args)))]
        (is (= #{{:name "longitude"   :base-type :type/Float}
                 {:name "category_id" :base-type :type/Integer}
                 {:name "price"       :base-type :type/Integer}
                 {:name "latitude"    :base-type :type/Float}
                 {:name "name"        :base-type :type/Text}
                 {:name "id"          :base-type :type/Integer}}
               (->> (describe-fields-for-table (mt/db) (t2/select-one :model/Table :id (mt/id :venues)))
                    (map (fn [{:keys [name base-type]}]
                           {:name      (u/lower-case-en name)
                            :base-type (if (or (isa? base-type :type/Integer)
                                               (isa? base-type :type/Decimal)) ; H2 DBs returns the ID as BigInt, Oracle as Decimal;
                                         :type/Integer
                                         base-type)}))
                    set)))))))

(deftest calculated-semantic-type-test
  (mt/test-drivers (apply disj (sql-jdbc-drivers-using-default-describe-table-or-fields-impl)
                          (tqpt/timeseries-drivers))
    (with-redefs [sql-jdbc.sync.interface/column->semantic-type (fn [_driver _database-type column-name]
                                                                  (when (= (u/lower-case-en column-name) "longitude")
                                                                    :type/Longitude))]
      (is (= [["longitude" :type/Longitude]]
             (->> (describe-fields-for-table (mt/db) (t2/select-one :model/Table :id (mt/id :venues)))
                  (filter :semantic-type)
                  (map (juxt (comp u/lower-case-en :name) :semantic-type))))))))

(deftest ^:parallel type-by-parsing-string
  (testing "type-by-parsing-string"
    (are [v expected] (= expected
                         (#'sql-jdbc.describe-table/type-by-parsing-string v))
      "bleh"                    java.lang.String
      "2017-01-13T17:09:42.411" java.time.LocalDateTime
      11111                     java.lang.Long)))

(deftest ^:parallel row->types-test
  (testing "none object rows ignored properly in JSON row->types (#21752, #44459)"
    (let [arr-row    {:bob (json/encode [:bob :cob :dob 123 "blob"])}
          obj-row    {:zlob (json/encode {:blob Long/MAX_VALUE})}
          string-row {:naked (json/encode "string")}]
      (is (= {} (#'sql-jdbc.describe-table/json-map->types string-row)))
      (is (= {} (#'sql-jdbc.describe-table/json-map->types arr-row)))
      (is (= {[:zlob "blob"] java.lang.Long} (#'sql-jdbc.describe-table/json-map->types obj-row)))))
  (testing "JSON json-map->types handles bigint OK (#22732)"
    (let [int-row   {:zlob (json/encode {"blob" (inc (bigint Long/MAX_VALUE))})}
          float-row {:zlob "{\"blob\": 12345678901234567890.12345678901234567890}"}]
      (is (= {[:zlob "blob"] clojure.lang.BigInt} (#'sql-jdbc.describe-table/json-map->types int-row)))
      ;; no idea how to force it to use BigDecimal here
      (is (= {[:zlob "blob"] Double} (#'sql-jdbc.describe-table/json-map->types float-row))))))

(deftest ^:parallel key-limit-test
  (testing "we don't read too many keys even from long jsons"
    (let [data (into {} (for [i (range (* 2 @#'sql-jdbc.describe-table/max-nested-field-columns))]
                          [(str "key" i) i]))]
      ;; inc the limit since we go 1 over the limit, see comment in `json->types`
      (is (= (inc @#'sql-jdbc.describe-table/max-nested-field-columns)
             (count (#'sql-jdbc.describe-table/json-map->types {:k (json/encode data)})))))))

(deftest ^:parallel get-table-pks-test
  ;; FIXME: this should works for all sql drivers
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
    (sql-jdbc.execute/do-with-connection-with-options
     driver/*driver*
     (mt/db)
     nil
     (fn [conn]
       (is (= ["id"]
              (sql-jdbc.describe-table/get-table-pks driver/*driver* conn "test-data" (t2/select-one :model/Table (mt/id :venues)))))))))

;;; ------------------------------------------- Tests for netsed field columns --------------------------------------------

(deftest ^:parallel json-details-only-test
  (testing "fields with base-type=type/JSON should have visibility-type=details-only, unlike other fields."
    (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
      (when-not (mysql/mariadb? (mt/db))
        (mt/dataset json
          (let [table (t2/select-one :model/Table :id (mt/id :json))]
            (sql-jdbc.execute/do-with-connection-with-options
             driver/*driver*
             (mt/db)
             nil
             (fn [^java.sql.Connection conn]
               (let [fields     (sql-jdbc.describe-table/describe-table-fields driver/*driver* conn table nil)
                     json-field (first (filter #(= (:name %) "json_bit") fields))
                     text-field (first (filter #(= (:name %) "bloop") fields))]
                 (is (= :details-only
                        (:visibility-type json-field)))
                 (is (nil? (:visibility-type text-field))))))))))))

(deftest ^:parallel describe-nested-field-columns-test
  (testing "json-map->types"
    (let [row   {:bob (json/encode {:dobbs {:robbs 123} :cobbs [1 2 3]})}
          types {[:bob "cobbs"] clojure.lang.PersistentVector
                 [:bob "dobbs" "robbs"] java.lang.Long}]
      (is (= types (#'sql-jdbc.describe-table/json-map->types row)))))
  (testing "JSON json-map->types handles bigint that comes in and gets interpreted as Java bigint OK (#22732)"
    (let [int-row   {:zlob (json/encode {"blob" (java.math.BigInteger. "123124124312134235234235345344324352")})}]
      (is (= #{{:name              "zlob → blob",
                :database-type     "decimal",
                :base-type         :type/BigInteger,
                :database-position 0,
                :json-unfolding    false
                :visibility-type   :normal,
                :nfc-path          [:zlob "blob"]}}
             (-> int-row
                 (#'sql-jdbc.describe-table/json-map->types)
                 (#'sql-jdbc.describe-table/field-types->fields)))))))

(deftest ^:parallel nested-field-column-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
    (mt/dataset json
      (when-not (mysql/mariadb? (mt/db))
        (testing "Nested field column listing"
          (is (= [:type/JSON :type/SerializedJSON]
                 (->> (sql-jdbc.sync/describe-table driver/*driver* (mt/db) {:name "json"})
                      :fields
                      (filter #(= (:name %) "json_bit"))
                      first
                      ((juxt :base-type :semantic-type)))))
          (is (= #{{:name "json_bit → 1234123412314",
                    :database-type "timestamp",
                    :base-type :type/DateTime,
                    :database-position 0,
                    :json-unfolding false,
                    :visibility-type :normal,
                    :nfc-path [:json_bit "1234123412314"]}
                   {:name "json_bit → boop",
                    :database-type "timestamp",
                    :base-type :type/DateTime,
                    :database-position 0,
                    :json-unfolding false,
                    :visibility-type :normal,
                    :nfc-path [:json_bit "boop"]}
                   {:name "json_bit → genres",
                    :database-type "text",
                    :base-type :type/Array,
                    :database-position 0,
                    :json-unfolding false,
                    :visibility-type :normal,
                    :nfc-path [:json_bit "genres"]}
                   {:name "json_bit → 1234",
                    :database-type "decimal",
                    :base-type :type/Integer,
                    :database-position 0,
                    :json-unfolding false,
                    :visibility-type :normal,
                    :nfc-path [:json_bit "1234"]}
                   {:name "json_bit → doop",
                    :database-type "text",
                    :base-type :type/Text,
                    :database-position 0,
                    :json-unfolding false,
                    :visibility-type :normal,
                    :nfc-path [:json_bit "doop"]}
                   {:name "json_bit → noop",
                    :database-type "timestamp",
                    :base-type :type/DateTime,
                    :database-position 0,
                    :json-unfolding false,
                    :visibility-type :normal,
                    :nfc-path [:json_bit "noop"]}
                   {:name "json_bit → zoop",
                    :database-type "timestamp",
                    :base-type :type/DateTime,
                    :database-position 0,
                    :json-unfolding false,
                    :visibility-type :normal,
                    :nfc-path [:json_bit "zoop"]}
                   {:name "json_bit → published",
                    :database-type "text",
                    :base-type :type/Text,
                    :database-position 0,
                    :json-unfolding false,
                    :visibility-type :normal,
                    :nfc-path [:json_bit "published"]}
                   {:name "json_bit → title",
                    :database-type "text",
                    :base-type :type/Text,
                    :database-position 0,
                    :json-unfolding false,
                    :visibility-type :normal,
                    :nfc-path [:json_bit "title"]}}
                 (sql-jdbc.sync/describe-nested-field-columns
                  driver/*driver*
                  (mt/db)
                  {:name "json" :id (mt/id "json")}))))))))

(deftest json-columns-with-values-are-not-object-test
  (testing "able sync a db with jsonb columns where value is an array or a string #44459"
    (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
      (mt/dataset (mt/dataset-definition
                   "naked_json"
                   ["json_table"
                    [{:field-name "array_col" :base-type :type/JSON}
                     {:field-name "string_col" :base-type :type/JSON}]
                    [["[1, 2, 3]" "\"just-a-string-in-a-json-column\""]]])

        (testing "there should be no nested fields"
          (is (= #{} (sql-jdbc.sync/describe-nested-field-columns
                      driver/*driver*
                      (mt/db)
                      {:name "json_table" :id (mt/id "json_table")}))))

        (sync/sync-database! (mt/db))
        (is (=? (if (mysql/mariadb? (mt/db))
                  #{{:name "id"
                     :base_type :type/Integer}
                    {:name "array_col"
                     :base_type :type/Text}
                    {:name "string_col"
                     :base_type :type/Text}}
                  #{{:name "id"
                     :base_type :type/Integer}
                    {:name "array_col"
                     :base_type :type/JSON}
                    {:name "string_col"
                     :base_type :type/JSON}})
                (t2/select-fn-set #(select-keys % [:name :base_type])
                                  :model/Field :table_id (mt/id "json_table"))))))))

(mt/defdataset big-json
  [["big_json_table"
    [{:field-name "big_json" :base-type :type/JSON}]
    [[(json/encode (into {} (for [x (range 300)] [x :dobbs])))]]]])

(deftest ^:parallel describe-big-nested-field-columns-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
    (mt/dataset big-json
      (when-not (mysql/mariadb? (mt/db))
        (testing "limit if huge. limit it and yell warning (#23635)"
          (is (= sql-jdbc.describe-table/max-nested-field-columns
                 (count
                  (sql-jdbc.sync/describe-nested-field-columns
                   driver/*driver*
                   (mt/db)
                   {:name "big_json_table" :id (mt/id "big_json_table")}))))
          (mt/with-log-messages-for-level [messages :warn]
            (sql-jdbc.sync/describe-nested-field-columns
             driver/*driver*
             (mt/db)
             {:name "big_json_table" :id (mt/id "big_json_table")})
            (is (str/includes?
                 (-> (messages) first :message)
                 "More nested field columns detected than maximum."))))))))

(deftest ^:parallel big-nested-field-column-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
    (mt/dataset json
      (when-not (mysql/mariadb? (mt/db))
        (testing "Nested field column listing, but big"
          (is (= sql-jdbc.describe-table/max-nested-field-columns
                 (count (sql-jdbc.sync/describe-nested-field-columns
                         driver/*driver*
                         (mt/db)
                         {:name "big_json" :id (mt/id "big_json")})))))))))

(mt/defdataset long-json
  [["long_json_table"
     ;; `short_json` and `long_json` have the same schema,
     ;; in the first row, both have an "a" key.
     ;; in the second row, both have a "b" key, except `long_json` has a longer value.
    [{:field-name "short_json", :base-type :type/JSON}
     {:field-name "long_json",  :base-type :type/JSON}]
    [[(json/encode {:a "x"}) (json/encode {:a "x"})]
     [(json/encode {:b "y"}) (json/encode {:b (apply str (repeat 10 "y"))})]]]])

(deftest long-json-sample-json-query-test
  (testing "Long JSON values should be omitted from the sample for describe-table (#45163)"
    (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
      (when-not (mysql/mariadb? (mt/db))
        (mt/with-temporary-setting-values [sql-jdbc.describe-table/nested-field-columns-value-length-limit
                                           (dec (count (json/encode {:b (apply str (repeat 10 "y"))})))]
          (mt/dataset long-json
            (sync/sync-database! (mt/db) {:scan :schema})
            (let [jdbc-spec   (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
                  table       (t2/select-one :model/Table :db_id (mt/id) :name "long_json_table")
                  json-fields (t2/select :model/Field :table_id (:id table) :name [:in ["short_json" "long_json"]])
                  pks         ["id"]
                  sample      (fn []
                                (let [rows (#'sql-jdbc.describe-table/sample-json-reducible-query driver/*driver* jdbc-spec table json-fields pks)]
                                  (into #{} (map #(update-vals % json/decode)) rows)))]
              (is (= #{{:short_json {"a" "x"}, :long_json {"a" "x"}}
                       {:short_json {"b" "y"}, :long_json nil}}
                     (sample)))
              (testing "If driver.sql/json-field-length is not implemented for the driver don't omit the long value"
                (letfn [(do-with-removed-method [thunk]
                          (let [original-method (get-method driver.sql/json-field-length driver/*driver*)]
                            (if (= original-method (get-method driver.sql/json-field-length :default))
                              (thunk)
                              (do (remove-method driver.sql/json-field-length driver/*driver*)
                                  (thunk)
                                  (defmethod driver.sql/json-field-length driver/*driver* [driver field]
                                    (original-method driver field))))))]
                  (do-with-removed-method
                   (fn []
                     (is (= #{{:short_json {"a" "x"}, :long_json {"a" "x"}}
                              {:short_json {"b" "y"}, :long_json {"b" "yyyyyyyyyy"}}}
                            (sample)))))))
              (testing "The resulting synced fields exclude the field that corresponds to the long value"
                (is (= #{"id"
                         "short_json"
                         "long_json"
                         "short_json → a"
                         "short_json → b"
                         "long_json → a"} ; note there is no "long_json → b" because it was excluded from the sample
                       (t2/select-fn-set :name :model/Field :table_id (:id table), :active true)))))))))))

(mt/defdataset json-unwrap-bigint-and-boolean
  "Used for testing mysql json value unwrapping"
  [["bigint-and-bool-table"
    [{:field-name "jsoncol" :base-type :type/JSON}]
    [["{\"mybool\":true, \"myint\":1234567890123456789}"]
     ["{\"mybool\":false,\"myint\":12345678901234567890}"]
     ["{\"mybool\":true, \"myint\":123}"]]]])

(deftest json-unwrapping-bigint-and-boolean
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
    (when-not (mysql/mariadb? (mt/db))
      (mt/dataset json-unwrap-bigint-and-boolean
        (sync/sync-database! (mt/db))
        (testing "Fields marked as :type/SerializedJSON are fingerprinted that way"
          (is (= #{{:name "id", :base_type :type/Integer, :semantic_type :type/PK}
                   {:name "jsoncol", :base_type :type/JSON, :semantic_type :type/SerializedJSON}
                   {:name "jsoncol → myint", :base_type :type/Number, :semantic_type :type/Category}
                   {:name "jsoncol → mybool", :base_type :type/Boolean, :semantic_type :type/Category}}
                 (mysql-test/db->fields (mt/db)))))
        (testing "Nested field columns are correct"
          (is (= #{{:name              "jsoncol → mybool"
                    :database-type     "boolean"
                    :base-type         :type/Boolean
                    :database-position 0
                    :json-unfolding    false
                    :visibility-type   :normal
                    :nfc-path          [:jsoncol "mybool"]}
                   {:name              "jsoncol → myint"
                    :database-type     "decimal"
                    :base-type         :type/Number
                    :database-position 0
                    :json-unfolding    false
                    :visibility-type   :normal
                    :nfc-path          [:jsoncol "myint"]}}
                 (sql-jdbc.sync/describe-nested-field-columns
                  driver/*driver*
                  (mt/db)
                  (t2/select-one :model/Table :db_id (mt/id) :name "bigint-and-bool-table")))))))))

(mt/defdataset json-int-turn-string
  "Used for testing mysql json value unwrapping"
  [["json_without_pk"
    [{:field-name "json_col" :base-type :type/JSON}]
    [["{\"int_turn_string\":1}"]
     ["{\"int_turn_string\":2}"]
     ["{\"int_turn_string\":3}"]
     ["{\"int_turn_string\":4}"]
     ["{\"int_turn_string\":5}"]
     ;; last row turn to a string
     ["{\"int_turn_string\":\"6\"}"]]]
   ["json_with_pk"
    [{:field-name "json_col" :base-type :type/JSON}]
    [["{\"int_turn_string\":1}"]
     ["{\"int_turn_string\":2}"]
     ["{\"int_turn_string\":3}"]
     ["{\"int_turn_string\":4}"]
     ["{\"int_turn_string\":5}"]
     ;; last row turn to a string
     ["{\"int_turn_string\":\"6\"}"]]]])

;; Tests for composite pks are in driver specific ns
;; metabase.driver.postgres-test/sync-json-with-composite-pks-test
;; metabase.driver.mysql-test/sync-json-with-composite-pks-test

(deftest json-fetch-last-on-table-with-ids-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-field-columns)
    (let [original-get-table-pks sql-jdbc.describe-table/get-table-pks]
      ;; all table defined by `mt/defdataset` will have an pk column my default
      ;; so we need a little trick to test case that a table doesn't have a pk
      (with-redefs [sql-jdbc.describe-table/get-table-pks      (fn [driver conn db-name-or-nil table]
                                                                 (condp = (:name table)
                                                                   "json_without_pk"
                                                                   []

                                                                   (original-get-table-pks driver conn db-name-or-nil table)))
                    metadata-queries/nested-field-sample-limit 4]
        (mt/dataset json-int-turn-string
          (when-not (mysql/mariadb? (mt/db))
            (sync/sync-database! (mt/db))
            (testing "if table has an pk, we fetch both first and last rows thus detect the change in type"
              (is (= [{:name              "json_col → int_turn_string"
                       :database-type     "text"
                       :base-type         :type/Text
                       :database-position 0
                       :json-unfolding    false
                       :visibility-type   :normal
                       :nfc-path          [:json_col "int_turn_string"]}]
                     (into [] (sql-jdbc.sync/describe-nested-field-columns
                               driver/*driver*
                               (mt/db)
                               (t2/select-one :model/Table :db_id (mt/id) :name "json_with_pk")))))
              (testing "if table doesn't have pk, we fail to detect the change in type but it still syncable"
                (is (= [{:name              "json_col → int_turn_string"
                         :database-type     "decimal"
                         :base-type         :type/Integer
                         :database-position 0
                         :json-unfolding    false
                         :visibility-type   :normal
                         :nfc-path          [:json_col "int_turn_string"]}]
                       (into [] (sql-jdbc.sync/describe-nested-field-columns
                                 driver/*driver*
                                 (mt/db)
                                 (t2/select-one :model/Table :db_id (mt/id) :name "json_without_pk")))))))))))))

(defn- describe-table-indexes
  [table]
  (let [database (mt/db)
        driver driver/*driver*
        lowercase-value (fn [index]
                          (update index :value #(if (string? %)
                                                  (u/lower-case-en %)
                                                  (map u/lower-case-en %))))]
    (if (driver/database-supports? driver :describe-indexes database)
      (into #{}
            (comp
             (map (fn [{:keys [field-name]}] {:type :normal-column-index :value field-name}))
             (map lowercase-value))
            (driver/describe-indexes driver database {:table-names [(:name table)]}))
      (into #{}
            (map lowercase-value)
            (driver/describe-table-indexes driver database table)))))

(defn- do-with-temporary-dataset [dataset thunk]
  (mt/dataset dataset
    (try
      (thunk)
      (finally
        ;; clean and destroy the db so this test is repeatable.
        (t2/delete! :model/Database (mt/id))
        (u/ignore-exceptions
          (tx/destroy-db! driver/*driver* dataset))))))

(deftest describe-table-indexes-test
  (mt/test-drivers (set/intersection (mt/normal-drivers-with-feature :index-info)
                                     (mt/sql-jdbc-drivers))
    (do-with-temporary-dataset
     (mt/dataset-definition "indexes"
                            ["single_index"
                             [{:field-name "indexed" :indexed? true :base-type :type/Integer}
                              {:field-name "not-indexed" :indexed? false :base-type :type/Integer}]
                             [[1 2]]]
                            ["composite_index"
                             [{:field-name "first" :indexed? false :base-type :type/Integer}
                              {:field-name "second" :indexed? false :base-type :type/Integer}]
                             [[1 2]]])
     (fn []
       (testing "single column indexes are synced correctly"
         (is (= #{{:type :normal-column-index :value "id"}
                  {:type :normal-column-index :value "indexed"}}
                (describe-table-indexes (t2/select-one :model/Table (mt/id :single_index))))))

       (testing "for composite indexes, we only care about the 1st column"
         (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
                        (sql.tx/create-index-sql driver/*driver* "composite_index" ["first" "second"]))
         (sync/sync-database! (mt/db))
         (is (= #{{:type :normal-column-index :value "id"}
                  {:type :normal-column-index :value "first"}}
                (describe-table-indexes (t2/select-one :model/Table (mt/id :composite_index))))))))))

(defmethod driver/database-supports? [::driver/driver ::unique-index]
  [_driver _feature _database]
  true)

(doseq [driver [:h2 :sqlite :sqlserver]]
  (defmethod driver/database-supports? [driver ::unique-index]
    [_driver _feature _database]
    false))

(deftest describe-table-indexes-unique-index-test
  (mt/test-drivers (set/intersection (mt/normal-drivers-with-feature :index-info ::unique-index)
                                     (mt/sql-jdbc-drivers))
    (do-with-temporary-dataset
     (mt/dataset-definition
      "advanced-indexes-unique"
      ["unique_index"
       [{:field-name "column" :indexed? false :base-type :type/Integer}]
       [[1 2]]])
     (fn []
       (testing "unique index"
         (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
                        (sql.tx/create-index-sql driver/*driver* "unique_index" ["column"] {:method "hash"}))
         (is (= #{{:type :normal-column-index :value "id"}
                  {:type :normal-column-index :value "column"}}
                (describe-table-indexes (t2/select-one :model/Table (mt/id :unique_index))))))))))

(deftest describe-table-indexes-hashed-index-test
  (mt/test-drivers (set/intersection (mt/normal-drivers-with-feature :index-info)
                                     (mt/sql-jdbc-drivers))
    (do-with-temporary-dataset
     (mt/dataset-definition
      "advanced-indexes-hashed"
      ["hashed_index"
       [{:field-name "column" :indexed? false :base-type :type/Integer}]
       [[1 2]]])
     (fn []
       (testing "hashed index"
         (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
                        (sql.tx/create-index-sql driver/*driver* "hashed_index" ["column"] {:unique? true}))
         (is (= #{{:type :normal-column-index :value "id"}
                  {:type :normal-column-index :value "column"}}
                (describe-table-indexes (t2/select-one :model/Table (mt/id :hashed_index))))))))))

(defmethod driver/database-supports? [::driver/driver ::clustered-index]
  [_driver _feature _database]
  false)

(defmethod driver/database-supports? [:postgres ::clustered-index]
  [_driver _feature _database]
  true)

(deftest describe-table-indexes-clustered-index-test
  (mt/test-drivers (set/intersection (mt/normal-drivers-with-feature :index-info ::clustered-index)
                                     (mt/sql-jdbc-drivers))
    (do-with-temporary-dataset
     (mt/dataset-definition
      "advanced-indexes-clustered"
      ["clustered_index"
       [{:field-name "column" :indexed? false :base-type :type/Integer}]
       [[1 2]]])
     (fn []
       (testing "clustered index"
         (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
                        (sql.tx/create-index-sql driver/*driver* "clustered_index" ["column"]))
         (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
                        "CLUSTER clustered_index USING idx_clustered_index_column;")
         (is (= #{{:type :normal-column-index :value "id"}
                  {:type :normal-column-index :value "column"}}
                (describe-table-indexes (t2/select-one :model/Table (mt/id :clustered_index))))))))))

;; FIXME: sqlsever supports conditional index too, but the sqlserver jdbc does not return filter_condition
;; for those indexes so we can't filter those out.
(defmethod driver/database-supports? [::driver/driver ::conditional-index]
  [_driver _feature _database]
  false)

(defmethod driver/database-supports? [:postgres ::conditional-index]
  [_driver _feature _database]
  true)

(deftest describe-table-indexes-conditional-index-test
  (mt/test-drivers (set/intersection (mt/normal-drivers-with-feature :index-info ::conditional-index)
                                     (mt/sql-jdbc-drivers))
    (do-with-temporary-dataset
     (mt/dataset-definition
      "advanced-indexes-conditional"
      ["conditional_index"
       [{:field-name "column" :indexed? false :base-type :type/Integer}]
       [[1 2]]])
     (fn []
       (testing "conditional index are ignored"
         (jdbc/execute! (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
                        (sql.tx/create-index-sql driver/*driver* "conditional_index" ["column"] {:condition "id > 2"}))
         (is (= #{{:type :normal-column-index :value "id"}}
                (describe-table-indexes (t2/select-one :model/Table (mt/id :conditional_index))))))))))

(defmethod driver/database-supports? [::driver/driver ::materialized-view-fields]
  [_driver _feature _database]
  true)

(defmethod driver/database-supports? [::driver/driver ::describe-view-fields]
  [_driver _feature _database]
  true)

(doseq [driver [:presto-jdbc
                :h2 ;; TODO
                :druid
                :druid-jdbc]]
  (defmethod driver/database-supports? [driver ::describe-view-fields]
    [_driver _feature _database]
    false))

(doseq [driver [:oracle ;; TODO Insufficient privileges
                :h2 ;; TODO
                :snowflake ;; Requires enterprise account
                :presto-jdbc
                :druid
                :druid-jdbc
                :mysql
                :sqlserver
                :mongo
                :sparksql
                :sqlite
                :athena]]
  (defmethod driver/database-supports? [driver ::describe-materialized-view-fields]
    [_driver _feature _database]
    false))

(deftest describe-view-fields
  (mt/test-drivers (set/union (mt/normal-drivers-with-feature ::describe-materialized-view-fields)
                              (mt/normal-drivers-with-feature ::describe-view-fields))
    (doseq [materialized? (cond-> []
                            (driver/database-supports? driver/*driver* ::describe-view-fields nil)
                            (conj false)
                            (driver/database-supports? driver/*driver* ::describe-materialized-view-fields nil)
                            (conj true))
            :let [view-name (if materialized? "orders_m" "orders_v")
                  table-name "orders"]]
      (try
        (testing (if materialized? "Materialized View" "View")
          (tx/drop-view! driver/*driver* (mt/db) view-name {:materialized? materialized?})
          (tx/create-view-of-table! driver/*driver* (mt/db) view-name table-name {:materialized? materialized?})
          (sync/sync-database! (mt/db) {:scan :schema})
          (let [orders-id (:id (tx/metabase-instance (tx/map->TableDefinition {:table-name table-name}) (mt/db)))
                orders-m-id (:id (tx/metabase-instance (tx/map->TableDefinition {:table-name view-name}) (mt/db)))
                non-view-fields (t2/select-fn-vec
                                 (juxt (comp u/lower-case-en :name) :base_type :database_position)
                                 :model/Field
                                 :table_id orders-id
                                 {:order-by [:database_position]})
                view-fields (t2/select-fn-vec
                             (juxt (comp u/lower-case-en :name) :base_type :database_position)
                             :model/Field
                             :table_id orders-m-id
                             {:order-by [:database_position]})]
            (is (some? orders-m-id))
            (is (some? orders-id))
            (is (= 9 (count view-fields)))
            (is (= non-view-fields view-fields))))
        (catch Exception e
          (is (nil? e) "This should not happen")
          (log/error e "Exception occurred."))
        (finally
          (tx/drop-view! driver/*driver* (mt/db) view-name {:materialized? materialized?}))))))

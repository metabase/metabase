(ns metabase.analyze.classifiers.history-test
  (:require
   [clojure.test :refer :all]
   [metabase.analyze.classifiers.history :as classifiers.history]
   [metabase.models.interface :as mi]
   [metabase.types.core :as types]))

(defn- field [id field-name base-type & {:as more}]
  (merge {:id id, :name field-name, :base_type base-type} more))

(defn- pk [id field-name base-type]
  (field id field-name base-type :semantic_type :type/PK :database_is_pk true))

(defn- infer
  ([fields]
   (infer "worker_history" fields))
  ([table-name fields]
   (classifiers.history/infer-history table-name :role/HistoryDimension fields)))

(defn- binding-of [fields]
  (:binding (infer fields)))

(deftest ^:parallel only-history-tables-test
  (let [fields [(pk 1 "id" :type/Integer)
                (field 2 "valid_from" :type/DateTime)
                (field 3 "valid_to" :type/DateTime)]]
    (testing "a table whose role is not a history dimension gets no binding, whatever its columns"
      (is (nil? (classifiers.history/infer-history "worker_history" :role/EntityDimension fields)))
      (is (nil? (classifiers.history/infer-history "worker_history" nil fields))))
    (is (some? (infer fields)))))

(deftest ^:parallel history-role-has-no-descendants-test
  (testing "infer-history compares the role with `=`, which is only right while nothing derives from it"
    (is (empty? (descendants types/table-role-hierarchy :role/HistoryDimension)))))

(deftest ^:parallel fivetran-history-mode-test
  (is (= {:scd_type   2
          :signal     "it has _fivetran_start and _fivetran_end, the Fivetran history mode columns"
          :confidence :high
          :binding    {:durable_key 1, :valid_from 2, :valid_to 3, :current_flag 4, :version nil}}
         (infer [(pk 1 "id" :type/Text)
                 (pk 2 "_fivetran_start" :type/DateTime)
                 (field 3 "_fivetran_end" :type/DateTime)
                 (field 4 "_fivetran_active" :type/Boolean)
                 (field 5 "_fivetran_synced" :type/DateTime)
                 (field 6 "title" :type/Text)]))))

(deftest ^:parallel dbt-snapshot-test
  (is (= {:scd_type   2
          :signal     "it has dbt_valid_from and dbt_valid_to, the dbt snapshot columns"
          :confidence :high
          :binding    {:durable_key 2, :valid_from 4, :valid_to 5, :current_flag nil, :version nil}}
         (infer [(pk 1 "dbt_scd_id" :type/Text)
                 (field 2 "id" :type/Integer)
                 (field 3 "dbt_updated_at" :type/DateTime)
                 (field 4 "dbt_valid_from" :type/DateTime)
                 (field 5 "dbt_valid_to" :type/DateTime)]))))

(deftest ^:parallel explicit-interval-test
  (testing "a valid-from and valid-to pair by name"
    (is (= {:scd_type   2
            :signal     "it has the date range columns effective_date and end_date"
            :confidence :high
            :binding    {:durable_key 2, :valid_from 3, :valid_to 4, :current_flag 5, :version nil}}
           (infer [(pk 1 "id" :type/Integer)
                   (field 2 "worker_id" :type/Integer)
                   (field 3 "effective_date" :type/Date)
                   (field 4 "end_date" :type/Date)
                   (field 5 "is_active" :type/Boolean)]))))
  (testing "columns typed as validity bounds count whatever their names"
    (is (=? {:signal  "it has the date range columns began and stopped"
             :binding {:valid_from 2, :valid_to 3}}
            (infer [(field 1 "worker_id" :type/Integer)
                    (field 2 "began" :type/DateTime :semantic_type :type/ValidFrom)
                    (field 3 "stopped" :type/DateTime :semantic_type :type/ValidTo)])))))

(deftest ^:parallel key-shape-test
  (testing "an ID plus updated_at in the key: the latest row per ID is current"
    (is (= {:scd_type   2
            :signal     "its key is id plus updated_at, so each row is a version and the latest row per id is current"
            :confidence :low
            :binding    {:durable_key 1, :valid_from 2, :valid_to nil, :current_flag nil, :version 2}}
           (infer [(pk 1 "id" :type/Integer)
                   (pk 2 "updated_at" :type/DateTime)
                   (field 3 "plan" :type/Text)]))))
  (testing "an ID plus a version counter, in either order"
    (is (= {:durable_key 2, :valid_from nil, :valid_to nil, :current_flag nil, :version 1}
           (binding-of [(pk 1 "version" :type/Integer)
                        (pk 2 "account_id" :type/Integer)
                        (field 3 "plan" :type/Text)]))))
  (testing "two dates in the key leave no ID to version"
    (is (=? {:confidence :low, :signal "it is a history table, so each row is a version"}
            (infer "accounts" [(pk 1 "day" :type/Date)
                               (pk 2 "loaded_at" :type/DateTime)])))))

(deftest ^:parallel name-and-role-signals-test
  (testing "a history-like name is a weak signal"
    (is (=? {:scd_type 2, :signal "its name account_history ends like a history table", :confidence :low}
            (infer "account_history" [(pk 1 "id" :type/Integer) (field 2 "plan" :type/Text)]))))
  (testing "with no signal of its own, the history role still makes each row a version"
    (is (= {:scd_type   2
            :signal     "it is a history table, so each row is a version"
            :confidence :low
            :binding    {:durable_key 1, :valid_from nil, :valid_to nil, :current_flag nil, :version nil}}
           (infer "accounts" [(pk 1 "id" :type/Integer) (field 2 "plan" :type/Text)])))))

(deftest ^:parallel current-value-columns-test
  (testing "a column holding the current value of a sibling column makes the table SCD type 6"
    (is (=? {:scd_type   6
             :signal     "current_title, department_current hold the current value on every version"
             :confidence :high
             :binding    {:valid_from 4, :valid_to 5}}
            (infer [(field 1 "worker_id" :type/Integer)
                    (field 2 "title" :type/Text)
                    (field 3 "current_title" :type/Text)
                    (field 4 "valid_from" :type/Date)
                    (field 5 "valid_to" :type/Date)
                    (field 6 "department" :type/Text)
                    (field 7 "department_current" :type/Text)]))))
  (testing "a current_ column without its sibling is just a column"
    (is (= 2 (:scd_type (infer [(field 1 "worker_id" :type/Integer)
                                (field 2 "current_title" :type/Text)
                                (field 3 "valid_from" :type/Date)
                                (field 4 "valid_to" :type/Date)]))))))

(deftest ^:parallel validity-columns-test
  (testing "start and end dates"
    (is (=? {:valid_from 3, :valid_to 4}
            (binding-of [(field 1 "deal_id" :type/Integer)
                         (field 2 "stage" :type/Text)
                         (field 3 "start_date" :type/Date)
                         (field 4 "end_date" :type/Date)]))))
  (testing "falls back to the table's own date for the start, skipping load and edit bookkeeping"
    (is (=? {:valid_from 3, :valid_to nil}
            (binding-of [(field 1 "deal_id" :type/Integer)
                         (field 2 "updated_at" :type/Date)
                         (field 3 "changed_on" :type/Date)
                         (field 4 "stage" :type/Text)]))))
  (testing "a load timestamp by type is bookkeeping too"
    (is (=? {:valid_from 3}
            (binding-of [(field 1 "deal_id" :type/Integer)
                         (field 2 "written" :type/DateTime :semantic_type :type/LoadTimestamp)
                         (field 3 "changed_on" :type/Date)]))))
  (testing "takes a bookkeeping date when it is the only one"
    (is (=? {:valid_from 2}
            (binding-of [(field 1 "deal_id" :type/Integer)
                         (field 2 "updated_at" :type/Date)]))))
  (testing "never uses the end date as the start"
    (is (=? {:valid_from nil, :valid_to 2}
            (binding-of [(field 1 "deal_id" :type/Integer)
                         (field 2 "ended_at" :type/Date)])))))

(deftest ^:parallel durable-key-test
  (testing "a column typed as the durable key wins"
    (is (=? {:durable_key 3}
            (binding-of [(pk 1 "id" :type/Integer)
                         (field 2 "account_id" :type/Integer)
                         (field 3 "worker_ref" :type/Text :semantic_type :type/DurableKey)]))))
  (testing "next to a surrogate key, a non-key `id` beats other IDs"
    (is (=? {:durable_key 3}
            (binding-of [(pk 1 "worker_sk" :type/Integer)
                         (field 2 "account_id" :type/Integer)
                         (field 3 "id" :type/Integer)]))))
  (testing "loader IDs are not the entity's"
    (is (=? {:durable_key 3}
            (binding-of [(pk 1 "worker_sk" :type/Integer)
                         (field 2 "dbt_scd_id" :type/Text)
                         (field 3 "worker_id" :type/Integer)]))))
  (testing "the primary key when nothing else fits"
    (is (=? {:durable_key 1}
            (binding-of [(pk 1 "code" :type/Text) (field 2 "plan" :type/Text)]))))
  (testing "nil when the table has no key at all"
    (is (=? {:durable_key nil}
            (binding-of [(field 1 "plan" :type/Text)])))))

(deftest ^:parallel current-flag-and-version-test
  (testing "by type before name"
    (is (=? {:current_flag 3, :version 5}
            (binding-of [(field 1 "worker_id" :type/Integer)
                         (field 2 "is_current" :type/Boolean)
                         (field 3 "now" :type/Boolean :semantic_type :type/CurrentRowFlag)
                         (field 4 "revision" :type/Integer)
                         (field 5 "rev" :type/Integer :semantic_type :type/Version)]))))
  (testing "by name"
    (is (=? {:current_flag 2, :version 3}
            (binding-of [(field 1 "worker_id" :type/Integer)
                         (field 2 "is_latest" :type/Boolean)
                         (field 3 "etag" :type/Text)]))))
  (testing "nil when no column fits"
    (is (=? {:current_flag nil, :version nil}
            (binding-of [(field 1 "worker_id" :type/Integer)
                         (field 2 "valid_from" :type/Date)
                         (field 3 "valid_to" :type/Date)])))))

(deftest ^:parallel field-instances-test
  (testing "synced Field instances are accepted as well as plain maps"
    (is (=? {:binding {:valid_from 2, :valid_to 3}}
            (infer [(mi/instance :model/Field {:id 1, :name "worker_id", :base_type :type/Integer})
                    (mi/instance :model/Field {:id 2, :name "valid_from", :base_type :type/Date})
                    (mi/instance :model/Field {:id 3, :name "valid_to", :base_type :type/Date})])))))

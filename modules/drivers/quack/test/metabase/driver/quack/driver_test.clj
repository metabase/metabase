(ns ^:mb/driver-tests metabase.driver.quack.driver-test
  "Tier C — driver tests through real Metabase (can-connect, describe-*, execute,
  feature declarations). Needs a live Quack server + the Metabase test harness."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.driver :as driver]
   [metabase.driver.quack.client :as client]
   [metabase.driver.quack.types :as types]
   [metabase.test :as mt]
   [metabase.test.data.quack :as qtd])
  (:import [java.net Socket]))

(set! *warn-on-reflection* true)

(def host (:host qtd/default-details))
(def port (:port qtd/default-details))
(def details qtd/default-details)
(def fake-db {:lib/type :metadata/database :details details})

(defn- reachable? []
  (try (with-open [_ (Socket. ^String host ^int port)] true)
       (catch Exception _ false)))

(use-fixtures :once
  (fn [t] (when (reachable?) (t))))

;;; ===========================================================================
;;; C1. can-connect? through the registered driver
;;; ===========================================================================

(deftest c1-can-connect-test
  (mt/test-driver :quack
    (is (true? (driver/can-connect? :quack details)))))

;;; ===========================================================================
;;; C2. describe-database*
;;; ===========================================================================

(deftest c2-describe-database-test
  (mt/test-driver :quack
    (let [tables (:tables (driver/describe-database* :quack fake-db))
          names  (set (map :name tables))]
      (is (contains? names "types") "seed samples.types is discovered")
      (is (contains? names "ints")))))

;;; ===========================================================================
;;; C3. describe-fields base-type mapping (per DuckDB type)
;;; ============================================================================

(deftest c3-base-type-mapping-test
  (testing "DuckDB logical type → Metabase base type (cross-referenced with quack-jdbc)"
    (is (= :type/Integer  (types/->base-type {:id 13 :name :INTEGER})))
    (is (= :type/BigInteger (types/->base-type {:id 14 :name :BIGINT})))
    (is (= :type/Boolean (types/->base-type {:id 10 :name :BOOLEAN})))
    (is (= :type/Text    (types/->base-type {:id 25 :name :VARCHAR})))
    (is (= :type/Decimal (types/->base-type {:id 21 :name :DECIMAL})))
    (is (= :type/Float   (types/->base-type {:id 23 :name :DOUBLE})))
    (is (= :type/Date    (types/->base-type {:id 15 :name :DATE})))
    (is (= :type/UUID    (types/->base-type {:id 54 :name :UUID})))
    (is (= :type/Array   (types/->base-type {:id 101 :name :LIST})))
    (is (= :type/Dictionary (types/->base-type {:id 100 :name :STRUCT})))
    ;; NEW/changed mappings:
    (is (= :type/DateTime (types/->base-type {:id 19 :name :TIMESTAMP}))
        "TIMESTAMP → DateTime (was wrongly :type/Time)")
    (is (= :type/DateTimeWithLocalTZ (types/->base-type {:id 32 :name :TIMESTAMP_TZ}))
        "TIMESTAMP_TZ → DateTimeWithLocalTZ")
    (is (= :type/* (types/->base-type {:id 27 :name :INTERVAL}))
        "INTERVAL → :type/* (was wrongly :type/Integer)")
    (is (= :type/Text (types/->base-type {:id 104 :name :ENUM}))
        "ENUM → Text")
    (is (= :type/BigInteger (types/->base-type {:id 50 :name :HUGEINT}))
        "HUGEINT → BigInteger (was :type/*)")
    (is (= :type/BigInteger (types/->base-type {:id 49 :name :UHUGEINT}))
        "UHUGEINT → BigInteger (was :type/*)")))

(deftest c3-describe-fields-returns-typed-fields-test
  ;; Exercise describe-fields directly (not under mt/test-driver, which swaps
  ;; in the test-data DB). The seed samples.types table covers the key types.
  (let [fields (driver/describe-fields :quack fake-db)
        by-name (->> fields
                     (filter #(and (= "types" (:table-name %))
                                   (= "samples" (:table-schema %))))
                     (map (juxt :name identity))
                     (into {}))]
    (is (seq by-name) "samples.types fields are discovered")
    (is (= :type/Boolean (:base-type (by-name "v_bool"))))
    (is (= :type/Integer (:base-type (by-name "v_integer"))))
    (is (= :type/Text    (:base-type (by-name "v_varchar"))))))

;;; ===========================================================================
;;; C4. execute-reducible-query (native)
;;; ============================================================================

(deftest c4-execute-native-test
  ;; execute-reducible-query requires the full QP store (a registered Metabase
  ;; Database + metadata provider), which only exists inside a real QP run.
  ;; Here we exercise the equivalent path directly through the client, which is
  ;; what execute-reducible-query calls under the hood.
  (mt/test-driver :quack
    (let [{:keys [cols rows]} (client/execute-query details "SELECT 42 AS answer")]
      (is (= ["answer"] (map :name cols)))
      (is (= [[42]] (reduce conj [] rows))))))

;;; ===========================================================================
;;; C5. database-supports? declarations are internally consistent
;;; ============================================================================

(deftest c5-feature-declarations-test
  (mt/test-driver :quack
    (is (true?  (driver/database-supports? :quack :describe-fields fake-db)))
    (is (true?  (driver/database-supports? :quack :now fake-db)))
    (is (false? (driver/database-supports? :quack :nested-fields fake-db)))
    (is (true?  (driver/database-supports? :quack :metadata/key-constraints fake-db)))
    (is (true?  (driver/database-supports? :quack :set-timezone fake-db)))
    ;; Group B feature parity (see docs/FEATURE-PARITY-PLAN.md):
    ;; each is now backed by a real ->honeysql/driver method or DuckDB behavior.
    (is (true?  (driver/database-supports? :quack :convert-timezone fake-db)))
    (is (true?  (driver/database-supports? :quack :split-part fake-db)))
    (is (true?  (driver/database-supports? :quack :expressions/integer fake-db)))
    (is (true?  (driver/database-supports? :quack :expressions/float fake-db)))
    (is (true?  (driver/database-supports? :quack :rename fake-db)))
    (is (true?  (driver/database-supports? :quack :atomic-renames fake-db)))
    (is (true?  (driver/database-supports? :quack :describe-is-nullable fake-db)))
    (is (false? (driver/database-supports? :quack :describe-is-generated fake-db)))
    (is (true?  (driver/database-supports? :quack :describe-default-expr fake-db)))
    ;; Group A one-liners
    (is (true?  (driver/database-supports? :quack :metadata/table-existence-check fake-db)))
    (is (true?  (driver/database-supports? :quack :uuid-type fake-db)))
    (is (true?  (driver/database-supports? :quack :identifiers-with-spaces fake-db)))
    (is (true?  (driver/database-supports? :quack :expression-literals fake-db)))
    ;; Uploads + actions
    (is (true?  (driver/database-supports? :quack :uploads fake-db)))
    (is (false? (driver/database-supports? :quack :upload-with-auto-pk fake-db)))
    (is (true?  (driver/database-supports? :quack :actions fake-db)))
    (is (true?  (driver/database-supports? :quack :actions/data-editing fake-db)))
    (is (true?  (driver/database-supports? :quack :actions/custom fake-db)))))

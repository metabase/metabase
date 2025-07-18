(ns ^:mb/memory metabase.memory.csv-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- readable [bytes]
  (cond (nil? bytes) "0 bytes"
        (zero? bytes) "0 bytes"
        :else
        (let [units ["b" "kb" "mb" "gb" "tb"]
              magnitude 1024.0]
          (loop [[unit & remaining] units
                 current (double bytes)]
            (if (and (seq remaining) (> current magnitude))
              (recur remaining (/ current magnitude))
              (format "%.1f %s" current unit))))))

(defn- consume
  [^java.io.InputStream is]
  (let [arr (byte-array 8024)]
    (loop [c 0, gas 5000000]
      (let [r (java.io.InputStream/.read is arr 0 (alength arr))]
        (cond (zero? gas)
              (throw (ex-info "Ran out of gas" {}))
              (neg? r) c
              :else (recur (+ c r) (dec gas)))))))

(def driver->query
  {:sqlite "WITH RECURSIVE generate_series(value) AS (
  SELECT 1
  UNION ALL
  SELECT value + 1 FROM generate_series WHERE value + 1 <= 1000000
)
SELECT replace(hex(zeroblob(1024)), '00', 'xx') FROM generate_series;"
   :postgres "SELECT repeat('x', 2048) FROM generate_series(1, 1000000)"
   :mysql "SELECT REPEAT('x', 2048)
FROM information_schema.columns c1
CROSS JOIN information_schema.columns c2
CROSS JOIN information_schema.columns c3
LIMIT 1000000"
   :bigquery-cloud-sdk "SELECT REPEAT('x', 2048) FROM UNNEST(GENERATE_ARRAY(1, 1000000)) AS num"
   :snowflake "SELECT REPEAT('x', 2048) FROM TABLE(GENERATOR(ROWCOUNT => 1000000))"
   :clickhouse "SELECT repeat('x', 2048)
FROM system.numbers
LIMIT 1000000;"
   })

(deftest large-csv-test
  (mt/test-drivers #{:postgres #_:mysql :sqlite #_:bigquery-cloud-sdk #_ :snowflake}
    (testing "Can download large CSVs without holding the entire results in memory #60733"
      (let [large-query (or (driver->query driver/*driver*)
                            (throw (ex-info "Driver doesn't implement big query"
                                            {:driver driver/*driver*
                                             :available (keys driver->query)})))
            result (mt/user-real-request :crowberto :post 200 "dataset/csv"
                                         {:request-options {:as :stream}}
                                         {:query (mt/native-query
                                                   {:query large-query})
                                          :format_rows true})
            size (consume result)]
        (is (> size 2000000000)
            (format "Only consumed %s but expected ~2gb" (readable size)))))))

(comment
  (mt/set-test-drivers! #{:postgres})
  (mt/set-test-drivers! #{:mysql})
  (mt/set-test-drivers! #{:sqlite})
  (mt/set-test-drivers! #{:clickhouse})
  (mt/set-test-drivers! #{:redshift})
  (mt/test-drivers #{:redshift}
    (mt/db)))

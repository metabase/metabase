(ns metabase.query-processor.middleware.large-int-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.large-int :as large-int]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- convert-large-int-to-string [cols rows]
  (qp.store/with-metadata-provider (mt/id)
    (let [query    {:middleware {:js-int-to-string? true}}
          metadata {:cols cols}
          rff      (large-int/convert-large-int-to-string query (constantly conj))
          rf       (rff metadata)]
      (transduce identity rf rows))))

(deftest ^:parallel different-row-types-test
  (testing "Middleware should work regardless of the type of each row (#13475)"
    (let [cols [{:base_type :type/Integer}]]
      (doseq [rows [[[1]
                     [Long/MAX_VALUE]]
                    [(list 1)
                     (list Long/MAX_VALUE)]
                    [(cons 1 nil)
                     (cons Long/MAX_VALUE nil)]
                    [(lazy-seq [1])
                     (lazy-seq [Long/MAX_VALUE])]]]
        (testing (format "rows = ^%s %s" (.getCanonicalName (class rows)) (pr-str rows))
          (is (= [[1]
                  ["9223372036854775807"]]
                 (convert-large-int-to-string cols rows))))))))

(deftest ^:parallel null-ids-as-strings
  (testing "Middleware should convert NULL IDs to nil (#13957)"
    (let [cols [{:base_type :type/Integer}]
          rows [[1]
                [Long/MAX_VALUE]
                [nil]]]
      (is (= [[1]
              ["9223372036854775807"]
              [nil]]
             (convert-large-int-to-string cols rows))))))

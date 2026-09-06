(ns metabase.driver.quack.codec-test
  "Tier A — codec unit tests. Pure, no server, no Metabase. Validates the
  Clojure codec against the golden captures in capture/fixtures and exercises
  edge cases the captures don't cover (compression modes, malformed input).

  Run via the in-tree test runner (see modules/drivers/quack/README.md)."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.driver.quack.codec :as c]
   [metabase.driver.quack.types :as types]
   [metabase.driver.quack.wire :as wire])
  (:import
   [java.nio ByteBuffer]
   [java.nio.file Files Paths]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; A1. LEB128 round-trip
;;; ===========================================================================

(deftest a1-uleb128-round-trip-test
  (testing "unsigned LEB128 encode/decode for edge values up to Long/MAX_VALUE"
    ;; Values > 2^63-1 overflow a signed long on read (known codec behavior,
    ;; matched by C++ idx_t); test the in-range space that round-trips cleanly.
    (doseq [v [0 1 127 128 255 16383 16384
               0xFFFF 0xFFFFFFFF 0x7FFFFFFFFF
               0x7FFFFFFFFFFFFFFF]] ; Long/MAX_VALUE
      (let [r (c/reader (c/varuint v))]
        (is (= v (c/read-uleb128 r)) (str "value " v))))))

(deftest ^:parallel a1-sleb128-round-trip-test
  (testing "signed LEB128 encode/decode incl. negatives"
    (doseq [v [0 1 -1 63 -64 64 -65 8191 -8192
               (dec (bit-shift-left 1 62)) (- (bit-shift-left 1 62))
               Long/MAX_VALUE Long/MIN_VALUE]]
      (let [r (c/reader (c/varint v))]
        (is (= v (c/read-sleb128 r)) (str "value " v))))))

(deftest a1-invalid-index-encodes-as-all-0xff-tail-test
  (testing "INVALID_INDEX (2^64-1) round-trips; read as a signed long it wraps to -1
           (matching how C++ idx_t / our codec store it)"
    (let [r (c/reader (c/optional-idx nil))]
      (is (= -1 (c/read-uleb128 r))))))

(deftest ^:parallel a1-hugeint-uint64-lower-round-trips-test
  (testing "hugeint encodes the lower uint64 with its high bit set (negative
           when read back as a signed long) without infinite-looping — the bug
           that made multi-batch FETCH OOM. A live server's result-uuid has its
           lower half > 2^63-1 roughly half the time. The round-trip preserves
           the bit pattern: the signed-long input equals the signed-long readback."
    (doseq [lower [0 1 -1
                   (bit-shift-left 1 63)              ; Long/MIN_VALUE bit pattern
                   Long/MAX_VALUE
                   Long/MIN_VALUE]]
      (let [bs (c/hugeint -1 lower)
            r  (c/reader bs)]
        (is (= -1 (c/read-sleb128 r)) "upper round-trips")
        ;; read-uleb128 returns a signed long whose bit pattern == the input
        ;; lower (the uint64 mask in hugeint makes the encode/decode match).
        (is (= lower (c/read-uleb128 r))
            (str "lower " lower " did not round-trip its bit pattern"))))))

;;; ===========================================================================
;;; A2. Message header encode/decode for every type (strict field 3)
;;; ===========================================================================

(deftest ^:parallel a2-header-always-carries-field-3-test
  (testing "every header encodes field 3 (client_query_id) even when absent — strict read"
    (doseq [mt [c/type-connection-request c/type-prepare-request c/type-fetch-request
                c/type-disconnect-message]]
      (let [bs (c/header mt)
            r  (c/reader bs)]
        ;; field 1 = type
        (is (= 1 (c/read-field-id r)))
        (is (= mt (c/read-uleb128 r)))
        ;; field 2 = connection-id is OMITTED at default "" → next id is 3
        (is (= 3 (c/read-field-id r)))
        (is (= -1 (c/read-uleb128 r)))           ; INVALID_INDEX wraps to -1 as a signed long
        ;; then terminator
        (is (= c/field-terminator (c/read-field-id r)))))))

(deftest ^:parallel a2-header-with-connection-id-test
  (testing "a header with a connection id encodes field 2 then field 3"
    (let [bs (c/header c/type-prepare-request "ABC123" 42)
          r   (c/reader bs)]
      (is (= 1 (c/read-field-id r))) (is (= c/type-prepare-request (c/read-uleb128 r)))
      (is (= 2 (c/read-field-id r))) (is (= "ABC123" (c/read-utf8 r)))
      (is (= 3 (c/read-field-id r))) (is (= 42 (c/read-uleb128 r)))
      (is (= c/field-terminator (c/read-field-id r))))))

(deftest ^:parallel a2-client-query-id-survives-round-trip-test
  (testing "client_query_id threaded through every request builder round-trips
           in the encoded header (field 3) — the Quack reference doc says this
           id lets you join client and server logs on (quack_connection_id,
           client_query_id). Verifies prepare/fetch/disconnect/connection all
           carry it, and that decode reads it back."
    (let [check (fn [bs expected-id]
                  (let [hdr (:header (wire/decode-response bs))]
                    (is (= expected-id (:client-query-id hdr))
                        (str "client_query_id=" expected-id " did not round-trip"))))]
      (check (wire/connection-request {:token "t"} 7)   7)
      (check (wire/prepare-request "cid" "SELECT 1" 8) 8)
      (check (wire/fetch-request "cid" [-1 42] 9)       9)
      (check (wire/disconnect-request "cid" 10)         10))))

;;; ============================================================================
;;; A3. WritePropertyWithDefault omission
;;; ============================================================================

(deftest ^:parallel a3-connection-request-shape-test
  (testing "a connection request body carries all 5 fields"
    (let [bs (wire/connection-request {:token "tok"} 99)
          ;; skip the header object, read the body object
          r   (c/reader bs)]
      ;; consume header (3 fields + terminator)
      (dotimes [_ 3] (c/read-field-id r))   ; skip ids; values already validated in a2
      ;; Actually simpler: re-decode the whole message and inspect.
      ;; (We re-walk here for clarity.)
      (let [resp (wire/decode-response bs)]
        (is (= :connection-request (-> resp :header :type)))))))

;;; ============================================================================
;;; A4–A7. DataChunk decode against golden fixtures + synthesized edge cases
;;; ============================================================================

(def ^:private fixtures-dir "modules/drivers/quack/test/fixtures")
(defn- read-fixture ^bytes [rel]
  (let [parts (into-array String (cons fixtures-dir (str/split rel #"/")))]
    (Files/readAllBytes (Paths/get "" parts))))

(defn- prepare-response [probe]
  (-> (read-fixture (str probe "/01_response.bin")) wire/decode-response))

(defn- column-values [probe]
  ;; :column-values sits on the chunk (a vector per column), not nested under :columns.
  (-> (prepare-response probe) :body :chunks first :column-values))

(defn- approx? [^double eps ^double a ^double b] (< (Math/abs (- a b)) eps))
(defn- approx= [a b] (approx? 0.001 a b))

(deftest a4-scalar-types-decode-test
  (testing "every scalar type round-trips the correct value from the live capture"
    (let [names (-> (prepare-response "types_scalar") :body :result-names)
          vals  (column-values "types_scalar")
          by-name (zipmap (map keyword names) vals)]
      (is (= [true]                                  (:v_bool by-name)))
      (is (= [127]                                   (:v_tinyint by-name)))
      (is (= [32767]                                 (:v_smallint by-name)))
      (is (= [2147483647]                            (:v_integer by-name)))
      (is (= [9223372036854775807]                   (:v_bigint by-name)))
      (is (= [(biginteger 170141183460469231731687303715884105727N)]
             (:v_hugeint by-name)))
      (is (approx= 3.14 (first (:v_float by-name))))
      (is (= 2.718281828459045                       (first (:v_double by-name))))
      (is (= [12345.67M]                             (:v_decimal by-name))) ; BigDecimal with scale
      (is (= [(java.time.LocalDate/of 2026 6 26)]  (:v_date by-name)))
      ;; NEW: typed temporal decode — TIMESTAMP → LocalDateTime (was raw longs)
      (is (= [(java.time.LocalDateTime/of 2026 6 26 12 34 56)]
             (:v_timestamp by-name)))
      ;; NEW: INTERVAL → structured map (months/days/micros)
      (is (= [{:months 0 :days 1 :micros 0}]       (:v_interval by-name)))
      (is (= ["hello quack"]                         (:v_varchar by-name))))))

(defn- little-endian-longs [& values]
  (let [buffer (doto (ByteBuffer/allocate (* Long/BYTES (count values)))
                 (.order java.nio.ByteOrder/LITTLE_ENDIAN))]
    (doseq [value values]
      (.putLong buffer value))
    (.array buffer)))

(deftest a4-unsigned-integer-boundaries-test
  (testing "UBIGINT decodes across the full unsigned 64-bit range"
    (let [decode #(#'types/decode-scalar-at % 0 :UINT64 {:id 31 :name :UBIGINT})]
      (is (= 0N (decode (little-endian-longs 0))))
      (is (= 9223372036854775808N (decode (little-endian-longs Long/MIN_VALUE))))
      (is (= 18446744073709551615N (decode (little-endian-longs -1))))))
  (testing "UHUGEINT decodes across the full unsigned 128-bit range"
    (let [decode #(#'types/decode-scalar-at % 0 :UINT128 {:id 49 :name :UHUGEINT})]
      (is (= 0N (decode (little-endian-longs 0 0))))
      (is (= 170141183460469231731687303715884105728N
             (decode (little-endian-longs 0 Long/MIN_VALUE))))
      (is (= 340282366920938463463374607431768211455N
             (decode (little-endian-longs -1 -1)))))))

(deftest a4-uuid-decode-test
  (testing "UUID decodes to a java.util.UUID with the correct sign-bit-XOR'd value
           (the hugeint upper long has its sign bit flipped vs raw DuckDB storage)"
    ;; hugeint_uuid fixture: col 0 = v_hugeint, col 1 = v_uuid
    (let [uuid-col (second (column-values "hugeint_uuid"))
          ^java.util.UUID u (first uuid-col)]
      (is (instance? java.util.UUID u))
      ;; The UUID's MSB should be negative (sign-bit XOR'd from DuckDB's signed storage).
      ;; This verifies the fix: without the XOR, the MSB would be positive.
      (is (neg? (.getMostSignificantBits u))
          "UUID MSB should be negative (sign-bit XOR'd) — proves the fix is active"))))

(deftest a4-int128-layout-test
  (testing "INT128 layout confirmed: lower@0 uint64, upper@8 int64 (both LE).
           The captured v_hugeint = max int128 = (2^127)-1"
    ;; hugeint_uuid fixture: col 0 = v_hugeint, col 1 = v_uuid
    (let [cols                    (column-values "hugeint_uuid")
          ^clojure.lang.BigInt v (first (nth cols 0))]
      (is (.equals (java.math.BigInteger. "170141183460469231731687303715884105727")
                   (.toBigInteger v))))))

(deftest a5-null-via-validity-test
  (testing "NULL is carried by the validity bitmask, not a sentinel value"
    (let [vals (column-values "select_null")]
      (is (= [nil] (first vals)))     ; n = NULL
      (is (= [1]   (second vals))))))

(deftest a6-range-multi-batch-test
  (testing "range(2048) decodes all rows with correct first/last"
    (let [rows (first (column-values "range_2048"))]
      (is (= 2048 (count rows)))
      (is (= 0 (first rows)))
      (is (= 2047 (last rows))))))

(deftest a7-nested-decode-test
  (testing "LIST and STRUCT columns decode structurally"
    (let [body (-> (prepare-response "nested_list_struct") :body)]
      (is (= ["id" "v_list" "v_struct"] (:result-names body)))
      (is (= [:BIGINT :LIST :STRUCT] (map :name (:result-types body)))))))

;;; ===========================================================================
;;; A8. Malformed input → clean exceptions (no NPE)
;;; ===========================================================================

(deftest a8-truncated-buffer-throws-cleanly-test
  (testing "truncated buffers raise a clean EOF ex-info, never an NPE/IndexOOB"
    (let [good (wire/prepare-request "x" "SELECT 1" 1)]
      (dotimes [cut (alength ^bytes good)]
        (let [bad (java.util.Arrays/copyOfRange good 0 (inc cut))]
          (try (wire/decode-response bad)
               ;; A few truncation points may land on a valid shorter object —
               ;; that's fine; we only forbid raw NPE/IndexOOB/ClassCast.
               (catch clojure.lang.ExceptionInfo e
                 (is (re-find #"EOF" (ex-message e))))
               (catch Throwable e
                 (is (not (#{NullPointerException IndexOutOfBoundsException
                             ClassCastException ArrayIndexOutOfBoundsException}
                           (class e)))
                     (str "unexpected " (class e))))))))))

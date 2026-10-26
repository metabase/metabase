(ns metabase.driver.quack.types
  "Decode LogicalType / DataChunk / Vector from the Quack binary stream into
  Clojure values. Ports capture/quack_codec.py. See PROTOCOL.md.

  read-prepare-response / read-fetch-response return:

      {:result-types [{:id 13 :name :INTEGER :physical :INT32 ...} ...]
       :result-names [\"x\" ...]
       :needs-more-fetch true/false                 ; prepare only
       :result-uuid [upper lower]                    ; prepare only
       :chunks [{:rows 1 :column-values [[42]]} ...]}"
  (:require
   [metabase.driver.quack.codec :as c]
   [metabase.util.performance :refer [get-in mapv]])
  (:import [java.nio ByteBuffer ByteOrder]))

(set! *warn-on-reflection* true)

;; enum tables (see PROTOCOL.md)
(def ^:private logical-type-id->name
  {1 :SQLNULL 3 :ANY 10 :BOOLEAN 11 :TINYINT 12 :SMALLINT 13 :INTEGER 14 :BIGINT
   15 :DATE 16 :TIME 17 :TIMESTAMP_SEC 18 :TIMESTAMP_MS 19 :TIMESTAMP 20 :TIMESTAMP_NS
   21 :DECIMAL 22 :FLOAT 23 :DOUBLE 25 :VARCHAR 26 :BLOB 27 :INTERVAL
   28 :UTINYINT 29 :USMALLINT 30 :UINTEGER 31 :UBIGINT 32 :TIMESTAMP_TZ
   39 :BIGNUM 49 :UHUGEINT 50 :HUGEINT 54 :UUID 60 :GEOMETRY
   100 :STRUCT 101 :LIST 102 :MAP 104 :ENUM 107 :UNION 108 :ARRAY})

(def ^:private extra-type-info->name
  {1 :GENERIC 2 :DECIMAL 3 :STRING 4 :LIST 5 :STRUCT 6 :ENUM 7 :UNBOUND
   9 :ARRAY 10 :ANY 11 :INTEGER_LITERAL 12 :TEMPLATE 13 :GEO})

(def ^:private vector-type->name {0 :FLAT 1 :FSST 2 :CONSTANT 3 :DICTIONARY 4 :SEQUENCE})

;; physical byte-size per element (nil = variable/nested)
(def ^:private phys->size {:BOOL 1 :INT8 1 :UINT8 1 :INT16 2 :UINT16 2
                           :INT32 4 :UINT32 4 :INT64 8 :UINT64 8
                           :FLOAT32 4 :FLOAT64 8 :INTERVAL 16 :INT128 16})

(defn- logical->physical
  "Resolve a logical type to its physical DuckDB storage type keyword.
  DECIMAL varies by width (≤4→INT16, ≤9→INT32, ≤18→INT64, else INT128); nested
  types → :NESTED; VARCHAR/BLOB → :VARCHAR."
  [{:keys [id] :as lt}]
  (cond
    (= id 21) (let [w (get-in lt [:type-info :width] 38)]
                (cond (<= w 4) :INT16 (<= w 9) :INT32 (<= w 18) :INT64 :else :INT128))
    (= id 10) :BOOL (= id 11) :INT8  (= id 28) :UINT8
    (= id 12) :INT16 (= id 29) :UINT16
    (= id 13) :INT32 (= id 30) :UINT32 (= id 15) :INT32
    (= id 14) :INT64 (= id 31) :UINT64 (= id 16) :INT64
    (#{17 18 19 20 32 33} id) :INT64
    (= id 22) :FLOAT32 (= id 23) :FLOAT64
    (= id 39) :INT128 (= id 49) :UINT128 (= id 50) :INT128 (= id 54) :INT128
    (= id 27) :INTERVAL
    (#{24 25 26} id) :VARCHAR
    (= id 36) :BIT
    (#{100 101 102 108} id) :NESTED
    :else nil))

(declare read-logical-type)

(defn- read-extra-type-info [^ByteBuffer b]
  (c/read-object
   (fn [fid acc bb]
     (condp = fid
       100 (assoc acc :type (get extra-type-info->name (c/read-uleb128 bb)))
       101 (assoc acc :alias (c/read-utf8 bb))
       103 (let [present (c/read-u8 bb)] (if (pos? present) (do (c/consume-object bb) acc) acc))
       200 (let [t (:type acc)]
             (cond
               (= t :DECIMAL) (assoc acc :width (c/read-uleb128 bb))
               (= t :STRING)  (assoc acc :collation (c/read-utf8 bb))
               (= t :LIST)    (assoc acc :child-type (read-logical-type bb))
               (= t :ARRAY)   (assoc acc :child-type (read-logical-type bb))
               (= t :STRUCT)  (assoc acc :child-types
                                     (c/read-list #(c/read-object
                                                    (fn [f a r]
                                                      (condp = f
                                                        0 (assoc a :name (c/read-utf8 r))
                                                        1 (assoc a :type (read-logical-type r))
                                                        (throw (ex-info "struct child field" {:fid f}))))
                                                    %1) bb))
               :else (throw (ex-info "type_info field 200 for type" {:type t}))))
       201 (let [t (:type acc)]
             (condp = t
               :DECIMAL (assoc acc :scale (c/read-uleb128 bb))
               :ARRAY   (assoc acc :size (c/read-uleb128 bb))
               (throw (ex-info "type_info field 201 for type" {:type t}))))
       (throw (ex-info "unknown ExtraTypeInfo field" {:fid fid}))))
   b {}))

(defn read-logical-type
  "Decode a LogicalType object (fields 100=id, 101=type-info pointer) and attach
  its :name and :physical type."
  [^ByteBuffer b]
  (let [lt (c/read-object
            (fn [fid acc bb]
              (condp = fid
                100 (assoc acc :id (c/read-uleb128 bb))
                101 (let [present (c/read-u8 bb)]
                      (if (pos? present) (assoc acc :type-info (read-extra-type-info bb)) acc))
                (throw (ex-info "unknown LogicalType field" {:fid fid}))))
            b {})]
    (assoc lt
           :name (get logical-type-id->name (:id lt))
           :physical (logical->physical lt))))

;; ---------------------------------------------------------------------------
;; Vector → column of values
;; ---------------------------------------------------------------------------
(declare read-vector decode-int64-logical)

(defn- bb ^ByteBuffer [^bytes bs] (-> (ByteBuffer/wrap bs) (.order ByteOrder/LITTLE_ENDIAN)))

(def ^:private uint64-mask (BigInteger. "18446744073709551615"))

(defn- unsigned-long
  "Interpret a signed Java `long` as its unsigned 64-bit value."
  ^BigInteger [^long value]
  (.and (BigInteger/valueOf value) uint64-mask))

(defn- uint64-at
  "Decode a UINT64 value from `buf` at byte offset `off`."
  ^clojure.lang.BigInt [^ByteBuffer buf off]
  (clojure.lang.BigInt/fromBigInteger (unsigned-long (.getLong buf off))))

(defn- hugeint-at
  "Decode an INT128/HUGEINT 16-byte LE value {uint64 lower@off, int64 upper@(+off 8)}
  read straight from `buf` at byte offset `off` into a clojure BigInt =
  (upper<<64)|lower. Offset-taking reader used by [[decode-scalar-at]] — it
  avoids the per-row 16-byte array copy the old whole-array decoder needed.
  Confirmed live — PROTOCOL.md §6."
  ^clojure.lang.BigInt [^ByteBuffer buf off]
  (let [lower (unsigned-long (.getLong buf off))
        upper (.getLong buf (+ off 8))]
    (clojure.lang.BigInt/fromBigInteger
     (.add (.shiftLeft (BigInteger/valueOf upper) 64) lower))))

(defn- uhugeint-at
  "Decode a UINT128/UHUGEINT value from `buf` at byte offset `off`."
  ^clojure.lang.BigInt [^ByteBuffer buf off]
  (let [^BigInteger lower (unsigned-long (.getLong buf off))
        ^BigInteger upper (unsigned-long (.getLong buf (+ off 8)))]
    (clojure.lang.BigInt/fromBigInteger (.add (.shiftLeft upper 64) lower))))

(defn- uuid-at
  "Decode the 16-byte INT128 layout at `buf:off` as a java.util.UUID. The
  hugeint `upper` int64 stores the UUID's most-sig bits with the sign bit
  flipped relative to DuckDB's signed storage, so XOR it back (matches
  quack-jdbc's uuidFromHugeIntParts). Offset-taking twin of [[hugeint-at]]."
  ^java.util.UUID [^ByteBuffer buf off]
  (let [lower (.getLong buf off)
        upper (.getLong buf (+ off 8))]
    (java.util.UUID. (bit-xor upper Long/MIN_VALUE) lower)))   ; flip the sign bit

(defn- micros->instant ^java.time.Instant [^long micros]
  (let [seconds (Math/floorDiv micros 1000000)
        micros-part (Math/floorMod micros 1000000)]
    (java.time.Instant/ofEpochSecond seconds (* (long micros-part) 1000))))

(defn- decode-scalar-at
  "Decode the `i`-th element of a FLAT data blob for physical type `phys` and
  logical type `lt`. DECIMAL (logical id 21) is dispatched first (its scale
  lives in type-info); the rest switch on physical type. NULLs are masked out
  by the caller ([[decode-column-values]]), not here.

  Hot path — runs once per non-null cell. The raw byte array is wrapped in ONE
  little-endian ByteBuffer here; the previous form re-wrapped it on every
  get/getInt/getLong call and copied 16 bytes per INT128/UUID cell. INT128 and
  UUID now read their two longs straight from that buffer via [[hugeint-at]] /
  [[uuid-at]], and single-byte reads use `aget` on the backing array (no
  reflection). The unhandled-physical-type fallback (e.g. :BIT) returns the
  raw backing bytes, matching the prior behavior."
  [^bytes raw ^long i phys {:keys [id] :as lt}]
  (let [^ByteBuffer buf (bb raw)
        size (phys->size phys 1)
        off  (* i size)]
    (if (= id 21)
      ;; DECIMAL: physical width varies (INT16/32/64/128); scale from type-info.
      (let [scale    (int (or (get-in lt [:type-info :scale]) 0))
            unscaled (case phys
                       :INT16  (biginteger (.getShort buf off))
                       :INT32  (biginteger (.getInt buf off))
                       :INT64  (biginteger (.getLong buf off))
                       :INT128 (.toBigInteger (hugeint-at buf off)))]
        (java.math.BigDecimal. unscaled scale))
      (condp = phys
        :BOOL    (pos? (aget raw off))
        :INT8    (aget raw off)
        :UINT8   (bit-and (aget raw off) 0xFF)
        :INT16   (.getShort buf off)
        :UINT16  (bit-and (.getShort buf off) 0xFFFF)
        :INT32   (if (= id 15)
                   (java.time.LocalDate/ofEpochDay (.getInt buf off))
                   (.getInt buf off))
        :UINT32  (Integer/toUnsignedLong (.getInt buf off))
        :INT64   (decode-int64-logical (.getLong buf off) lt)
        :UINT64  (uint64-at buf off)
        :FLOAT32 (.getFloat buf off)
        :FLOAT64 (.getDouble buf off)
        :INT128  (if (= id 54)
                   (uuid-at buf off)
                   (hugeint-at buf off))
        :UINT128 (uhugeint-at buf off)
        :INTERVAL {:months (.getInt buf off)
                   :days   (.getInt buf (+ off 4))
                   :micros (.getLong buf (+ off 8))}
        raw))))

(defn- decode-int64-logical
  "Decode an INT64 physical value to its java.time.* form by logical id.
  TIME/TIMESTAMP variants store microseconds/nanos/seconds since epoch; DATE is
  INT32 (handled in decode-scalar-at). Mirrors quack-jdbc's decodeInt64LogicalValue."
  [^long value {:keys [id]}]
  (case (int id)
    ;; TIME = microseconds since midnight
    16    (let [nanos (Math/multiplyExact value 1000)]
            (java.time.LocalTime/ofNanoOfDay (Math/floorMod nanos (* 24 60 60 1000000000))))
    ;; TIME_NS = nanoseconds since midnight
    35    (java.time.LocalTime/ofNanoOfDay value)
    ;; TIME_TZ — stored as a raw int64 bit pattern; return as-is
    34    value
    ;; TIMESTAMP_SEC
    17    (java.time.LocalDateTime/ofInstant (java.time.Instant/ofEpochSecond value) java.time.ZoneOffset/UTC)
    ;; TIMESTAMP_MS
    18    (java.time.LocalDateTime/ofInstant (java.time.Instant/ofEpochMilli value) java.time.ZoneOffset/UTC)
    ;; TIMESTAMP (microseconds)
    19    (java.time.LocalDateTime/ofInstant (micros->instant value) java.time.ZoneOffset/UTC)
    ;; TIMESTAMP_NS
    20    (let [secs (quot value 1000000000) nanos (rem value 1000000000)]
            (java.time.LocalDateTime/ofInstant
             (java.time.Instant/ofEpochSecond secs nanos) java.time.ZoneOffset/UTC))
    ;; TIMESTAMP_TZ (microseconds, UTC)
    32    (java.time.OffsetDateTime/ofInstant (micros->instant value) java.time.ZoneOffset/UTC)
    33    (java.time.OffsetDateTime/ofInstant (micros->instant value) java.time.ZoneOffset/UTC)
    ;; DECIMAL stored as INT64
    21    value
    value))

(defn- decode-column-values
  "Turn one decoded Vector into a vector of per-row Clojure values, honoring
  vector compression (FLAT/CONSTANT/SEQUENCE/DICTIONARY) and the validity bitmask for NULLs."
  [vec-data ^long count]
  (let [vt (or (:vector-type vec-data) :FLAT)]
    (cond
      (= vt :SEQUENCE)
      (let [start (:seq-start vec-data) inc (:seq-increment vec-data)]
        (vec (for [i (range count)] (+ start (* i inc)))))

      (= vt :CONSTANT)
      (let [single (decode-column-values (assoc vec-data :vector-type :FLAT) 1)]
        (vec (repeat count (first single))))

      (= vt :DICTIONARY)
      ;; sel_vector = count int32 LE indices into the child dictionary vector.
      ;; Nulls come from the dictionary itself (selected entry is nil), not a
      ;; parent validity mask. (quack-jdbc reads 4-byte sels; matches DuckDB sel_t.)
      (let [sel  ^bytes (:sel-vector vec-data)
            dict (:column-values (:child vec-data))]
        (vec (for [i (range count)]
               (let [off (* i 4)
                     idx (bit-or (bit-and (aget sel off) 0xFF)
                                 (bit-shift-left (bit-and (aget sel (inc off)) 0xFF) 8)
                                 (bit-shift-left (bit-and (aget sel (+ off 2)) 0xFF) 16)
                                 (bit-shift-left (bit-and (aget sel (+ off 3)) 0xFF) 24))]
                 (nth dict idx nil)))))

      :else
      (let [validity (:validity vec-data)
            present? (fn present? [i]
                       (if validity
                         (pos? (bit-and (bit-shift-right (aget ^bytes validity (quot i 8)) (rem i 8)) 1))
                         true))]
        (cond
          (:data-strings vec-data) (vec (for [i (range count)]
                                          (if (present? i) (nth (:data-strings vec-data) i) nil)))
          (:data-raw vec-data)     (let [phys (:physical vec-data) lt (:logical-type vec-data)]
                                     (vec (for [i (range count)]
                                            (if (present? i)
                                              (decode-scalar-at ^bytes (:data-raw vec-data) i phys lt)
                                              nil))))
          :else (vec (repeat count nil)))))))

(defn- flat-field-handler
  "Return a `read-object`-shaped field handler `(fid acc b)` for the FLAT Vector
  data fields (100-109), closed over `logical-type` and `count`.

  Shared by [[read-vector-flat-fields]] (explicit vector_type = FLAT) and the
  implicit-FLAT branch of [[read-vector]] (no field 90). Centralizing it removes
  ~40 lines of duplicated dispatch that had already drifted: the implicit path
  only recognized fields 100-104 as a first field / 100-106 in its loop, and
  routed field 103 to the :ARRAY branch unconditionally (mis-decoding a struct
  child vector). Both paths now use the full, correct handler."
  [logical-type count]
  (fn handle-flat-field [fid acc ^ByteBuffer b]
    (condp = fid
      100 (assoc acc :has-validity (pos? (c/read-u8 b)))
      101 (assoc acc :validity (c/read-blob b))
      102 (let [phys (:physical logical-type)]
            (if (or (phys->size phys) (nil? phys))
              (assoc acc :data-raw (c/read-blob b) :physical phys)
              (if (= phys :VARCHAR)
                (assoc acc :data-strings (c/read-list #(c/read-utf8 %) b))
                (throw (ex-info "field 102 on nested type" {:phys phys})))))
      103 (if (= (:name logical-type) :ARRAY)
            (assoc acc :array-size (c/read-uleb128 b))
            (let [child-types (get-in logical-type [:type-info :child-types] [])
                  n (c/read-uleb128 b)]
              (assoc acc :children
                     (loop [i 0 out (transient [])]
                       (if (>= i n) (persistent! out)
                           (recur (inc i)
                                  (conj! out (read-vector b count (get-in child-types [i :type] {})))))))))
      104 (assoc acc :list-size (c/read-uleb128 b))
      105 (assoc acc :entries
                 (c/read-list
                  #(c/read-object
                    (fn [f a r]
                      (condp = f
                        100 (assoc a :offset (c/read-uleb128 r))
                        101 (assoc a :length (c/read-uleb128 r))
                        (throw (ex-info "list entry" {:fid f}))))
                    %1) b))
      106 (assoc acc :child (read-vector b (:list-size acc) (get-in logical-type [:type-info :child-type] {})))
      107 (assoc acc :byte-data-length (c/read-uleb128 b))
      108 (assoc acc :length-data (c/read-blob b))
      109 (assoc acc :byte-data (c/read-blob b))
      (throw (ex-info "unknown Vector field" {:fid fid})))))

(defn- read-vector-flat-fields
  "Read the FLAT-path fields of a Vector object from `b` until the object
  terminator, returning the decoded data map (without :column-values). Thin
  loop over the shared [[flat-field-handler]]."
  [^ByteBuffer b count logical-type]
  (let [handler (flat-field-handler logical-type count)
        base    (assoc {} :logical-type logical-type :physical (:physical logical-type))]
    (loop [acc base]
      (let [fid (c/read-field-id b)]
        (if (== fid c/field-terminator)
          acc
          (recur (handler fid acc b)))))))

;; read-vector reads the Vector object's fields directly (not via read-object)
;; because DICT/CONSTANT have bare nested children. See below.

(defn read-vector
  "Decode a Vector object. Reads the object's fields directly (not via
  read-object) because DICT/CONSTANT have bare nested children that break the
  field-id-terminated-object model. Dispatches on vector compression mode."
  [^ByteBuffer b count logical-type]
  (let [base (assoc {} :logical-type logical-type :physical (:physical logical-type))
        first-fid (c/read-field-id b)]
    (if (not= first-fid 90)
      ;; FLAT with no explicit vector_type — `first-fid` is already a data
      ;; field. Seed the accumulator with it via the shared handler, then loop
      ;; the handler to the terminator. (Field 90 is the optional vector_type
      ;; selector; when absent the vector is implicitly FLAT.)
      (let [handler (flat-field-handler logical-type count)
            rest    (loop [acc (handler first-fid base b)]
                      (let [fid (c/read-field-id b)]
                        (if (== fid c/field-terminator)
                          acc
                          (recur (handler fid acc b)))))]
        (assoc rest :column-values (decode-column-values rest count)))
      ;; Field 90 present → read vector_type and dispatch.
      (let [vtype-id (c/read-uleb128 b)
            vtype (get vector-type->name vtype-id :FLAT)]
        (cond
          (= vtype :FSST)
          (throw (ex-info "FSST-compressed vectors are not yet supported" {:vtype :FSST}))

          (= vtype :SEQUENCE)
          (let [_ (c/read-field-id b)  start (c/read-sleb128 b)
                _ (c/read-field-id b)  incr (c/read-sleb128 b)
                _ (c/read-field-id b)   ; terminator
                data (assoc base :vector-type :SEQUENCE :seq-start start :seq-increment incr)]
            (assoc data :column-values (decode-column-values data count)))

          (= vtype :CONSTANT)
          (let [child (read-vector b 1 logical-type)   ; bare nested object, no field id
                _ (c/read-field-id b)                   ; parent terminator
                single-val (first (:column-values child))]
            (assoc base :vector-type :CONSTANT
                   :column-values (vec (repeat count single-val))))

          (= vtype :DICTIONARY)
          (let [_ (c/read-field-id b)  sel (c/read-blob b)
                _ (c/read-field-id b)  dict-count (c/read-uleb128 b)
                child (read-vector b dict-count logical-type)  ; bare nested object
                _ (c/read-field-id b)]   ; parent terminator
            (assoc base :vector-type :DICTIONARY :sel-vector sel :child child
                   :column-values (decode-column-values
                                   (assoc base :vector-type :DICTIONARY :sel-vector sel :child child)
                                   count)))

          :else
          ;; FLAT with explicit 90 — read remaining fields until terminator.
          (let [rest (read-vector-flat-fields b count logical-type)]
            (assoc rest :column-values (decode-column-values rest count))))))))

(defn- read-data-chunk [^ByteBuffer b]
  (let [chunk (c/read-object
               (fn [fid acc bb]
                 (condp = fid
                   100 (assoc acc :rows (c/read-uleb128 bb))
                   101 (assoc acc :types (c/read-list read-logical-type bb))
                   102 (let [types (:types acc) n (c/read-uleb128 bb)]
                         (assoc acc :columns
                                (loop [i 0 out (transient [])]
                                  (if (>= i n) (persistent! out)
                                      (recur (inc i)
                                             (conj! out (read-vector bb (:rows acc) (nth types i {}))))))))
                   (throw (ex-info "unknown DataChunk field" {:fid fid}))))
               b {})]
    (assoc chunk :column-values (mapv :column-values (:columns chunk)))))

(defn- read-data-chunk-wrapper [^ByteBuffer b]
  (let [present (c/read-u8 b)]
    (assert (pos? present) "expected present chunk")
    ;; field 300 wraps the chunk; return the chunk map directly.
    (c/read-object (fn [fid _acc bb]
                     (condp = fid
                       300 (read-data-chunk bb)
                       (throw (ex-info "unknown DataChunkWrapper field" {:fid fid}))))
                   b nil)))

(defn read-prepare-response
  "Decode a prepare response from the Quack binary stream."
  [^ByteBuffer b]
  (c/read-object
   (fn [fid acc bb]
     (condp = fid
       1 (assoc acc :result-types (c/read-list read-logical-type bb))
       2 (assoc acc :result-names (c/read-list #(c/read-utf8 %) bb))
       3 (assoc acc :needs-more-fetch (pos? (c/read-u8 bb)))
       4 (assoc acc :chunks (c/read-list read-data-chunk-wrapper bb))
       5 (assoc acc :result-uuid (c/read-hugeint bb))
       (throw (ex-info "unknown PrepareResponse field" {:fid fid}))))
   b {:needs-more-fetch false}))

(defn read-fetch-response
  "Decode a fetch response from the Quack binary stream."
  [^ByteBuffer b]
  (c/read-object
   (fn [fid acc bb]
     (condp = fid
       1 (assoc acc :chunks (c/read-list read-data-chunk-wrapper bb))
       2 (let [v (c/read-uleb128 bb)] (assoc acc :batch-index (when (not= v c/invalid-index) v)))
       (throw (ex-info "unknown FetchResponse field" {:fid fid}))))
   b {}))

;; ---------------------------------------------------------------------------
;; Post-processing: chunks → rows, and logical-type → Metabase base-type
;; ---------------------------------------------------------------------------
(defn chunk->rows
  "Transpose one decoded chunk's columns into a seq of row vectors."
  [{:keys [rows column-values]}]
  (when (pos? rows)
    (let [cols column-values]
      (for [i (range rows)] (mapv #(nth %1 i nil) cols)))))

(defn chunks->rows
  "Concatenate all chunk rows in a prepare/fetch body into a flat lazy seq."
  [body] (mapcat chunk->rows (:chunks body)))

(defn ->base-type
  "Map a decoded logical type to a Metabase :type/* keyword.
  Mappings cross-referenced against gizmodata/quack-jdbc's JdbcTypeMap."
  [{:keys [id]}]
  (case (int id)
    1  :type/*                    ; SQLNULL
    10 :type/Boolean
    (11 12 13 28 29 30) :type/Integer
    (14 31 39) :type/BigInteger
    49 :type/BigInteger           ; UHUGEINT (was :type/*)
    50 :type/BigInteger           ; HUGEINT  (was :type/*)
    54 :type/UUID
    15 :type/Date
    16 :type/Time
    (17 18 19 20) :type/DateTime
    32 :type/DateTimeWithLocalTZ  ; TIMESTAMP_TZ (was lumped with DateTime)
    33 :type/DateTimeWithLocalTZ  ; TIMESTAMP_TZ_NS
    21 :type/Decimal
    (22 23) :type/Float
    (24 25) :type/Text
    26 :type/*                    ; BLOB
    27 :type/*                    ; INTERVAL (was :type/Integer — wrong)
    36 :type/*                    ; BIT
    104 :type/Text                ; ENUM (was :type/* — JDBC maps to VARCHAR)
    60 :type/*                    ; GEOMETRY
    100 :type/Dictionary          ; STRUCT
    101 :type/Array               ; LIST
    102 :type/Dictionary          ; MAP
    108 :type/Array               ; ARRAY
    :type/*))

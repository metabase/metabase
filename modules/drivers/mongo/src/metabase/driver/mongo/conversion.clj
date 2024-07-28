(ns metabase.driver.mongo.conversion
  "This namespace contains utilities for conversion between mongo specific types and clojure.

   It is copy of monger's conversion namespace, that was adjusted for the needs of Document. Extensions that were
   previously implemented in our mongo driver were also moved into this namespace.

   [[to-document]] and [[from-document]] are meant to be used for transformation of clojure data into mongo aggregation
   pipelines and results back into clojure structures.

   TODO: Logic is copied from monger's conversions. It seems that lot of implementations are redundant. I'm not sure
         yet. We should consider further simplifying the namespace.
   TODO: Consider use of bson's encoders/decoders/codecs instead this code.
   TODO: Or consider adding types from org.bson package -- eg. BsonInt32. If we'd decide to go this way, we could
         transform ejson completely to clojure structures. That however requires deciding how to represent
         eg. ObjectIds (it could be eg. {$oid \"...\"} which would copy EJSON v2 way). [EJSON v2 doc](https://www.mongodb.com/docs/manual/reference/mongodb-extended-json/).
   TODO: Names of protocol functions and protocols are bit misleading as were in monger.

   TODOs should be addressed during follow-up of monger removal."
  (:require
   [flatland.ordered.map :as ordered-map]
   [java-time.api :as t]
   [metabase.query-processor.timezone :as qp.timezone]))

(set! *warn-on-reflection* true)

;;;; Protocols defined originally in monger, adjusted for `Document` follow.

(defprotocol ConvertFromDocument
  (from-document [input opts] "Converts given DBObject instance to a piece of Clojure data"))

(extend-protocol ConvertFromDocument
  nil
  (from-document [input _opts] input)

  Object
  (from-document [input _opts] input)

  org.bson.types.Decimal128
  (from-document [^org.bson.types.Decimal128 input _opts]
    ;; As per https://mongodb.github.io/mongo-java-driver/5.1/apidocs/bson/org/bson/types/Decimal128.html#bigDecimalValue()
    ;; org.bson.types.Decimal128/POSITIVE_ZERO is convertible to big decimal.
    (if (.equals input org.bson.types.Decimal128/NEGATIVE_ZERO)
      0M
      (.bigDecimalValue input)))

  java.util.List
  (from-document [^java.util.List input opts]
    (mapv #(from-document % opts) input))

  java.util.Date
  (from-document [t _]
    (t/instant t))

  org.bson.Document
  (from-document [input {:keys [keywordize] :or {keywordize false} :as opts}]
    (persistent! (reduce (if keywordize
                           (fn [m ^String k]
                             (assoc! m (keyword k) (from-document (.get input k) opts)))
                           (fn [m ^String k]
                             (assoc! m k (from-document (.get input k) opts))))
                         (transient (ordered-map/ordered-map))
                         (.keySet input)))))

(defprotocol ConvertToDocument
  (to-document [input] "Converts given piece of Clojure data to org.bson.Document usable by java driver."))

(extend-protocol ConvertToDocument
  nil
  (to-document [_input] nil)

  clojure.lang.Ratio
  (to-document [input] (double input))

  clojure.lang.Keyword
  (to-document [input] (.getName input))

  clojure.lang.Named
  (to-document [input] (.getName input))

  clojure.lang.IPersistentMap
  (to-document [input]
    (let [o (org.bson.Document.)]
      (doseq [[k v] input]
        (.put o (to-document k) (to-document v)))
      o))

  java.util.List
  (to-document [input] (mapv to-document input))

  java.util.Set
  (to-document [input] (mapv to-document input))

  Object
  (to-document [input] input))

;;;; Protocol extensions gathered from our mongo driver's code follow.

;; It seems to be the case that the only thing BSON supports is DateTime which is basically the equivalent
;; of Instant; for the rest of the types, we'll have to fake it. (Cam)
(extend-protocol ConvertToDocument
  java.time.Instant
  (to-document [t]
    (org.bson.BsonDateTime. (t/to-millis-from-epoch t)))

  java.time.LocalDate
  (to-document [t]
    (to-document (t/local-date-time t (t/local-time 0))))

  java.time.LocalDateTime
  (to-document [t]
    ;; QP store won't be bound when loading test data for example.
    (to-document (t/instant t (t/zone-id (try
                                           (qp.timezone/results-timezone-id)
                                           (catch Throwable _
                                             "UTC"))))))

  java.time.LocalTime
  (to-document [t]
    (to-document (t/local-date-time (t/local-date "1970-01-01") t)))

  java.time.OffsetDateTime
  (to-document [t]
    (to-document (t/instant t)))

  java.time.OffsetTime
  (to-document [t]
    (to-document (t/offset-date-time (t/local-date "1970-01-01") t (t/zone-offset t))))

  java.time.ZonedDateTime
  (to-document [t]
    (to-document (t/instant t))))

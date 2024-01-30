(ns metabase.driver.mongo.conversion
  "This namespace contains utilities for conversion between mongo specific types and clojure friendly types.

   TODO: proper docstring

   Currently it contains:
   - mostly copy of monger's `conversion` namespace, adjusted for the purposes of more modern `org.bson.Document` and
   - its extensions gathered from our mongo driver.

   Namespace was added as part of mongo java driver upgrade (and monger removal). Code here should be subject
   of further refator (eg. while addressing https://github.com/metabase/metabase/issues/38181). Priority was to address
   escalation at the time of writing.
   
   Why the refactoring concerns?
   - Mongo java driver (bson package) uses encoders and decoders for transformations between mongo and java (potentially clojure)
     types.
   - It may be that some of the conversion code is not neccessary anymore (or for our purposes) -- We are using this
     to convert aggregation pipelines into .
   - Name of the protocols (previously From/ToBDObject) is misleading -- eg. maps are converted to `Document`, but
     other values are converted just to the form digestible by mongo, eg. keywords to strings, date/time values to
     instant."
  (:require
   [flatland.ordered.map :as ordered-map]
   [java-time.api :as t]
   [metabase.query-processor.timezone :as qp.timezone]))

;;;; TODO: avoid laziness here completely!
;;;; TODO: 

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
    (.bigDecimalValue input))

  java.util.List
  (from-document [^java.util.List input opts]
    (mapv #(from-document % opts) input))

  java.util.Date
  (from-document [t _]
                 (t/instant t))

  ;; TODO: maybe move this to function which would initialize arguments
  org.bson.Document
  (from-document [input {:keys [keywordize] :or {keywordize true} :as opts}]
    (reduce (if keywordize
              (fn [m ^String k]
                (assoc m (keyword k) (from-document (.get input k) opts)))
              (fn [m ^String k]
                (assoc m k (from-document (.get input k) opts))))
            (ordered-map/ordered-map)
            (.keySet input))))

(defprotocol ConvertToDocument
  (^org.bson.Document to-document [input] 
    "Converts given piece of Clojure data to org.bson.Document usable by java driver."))

(extend-protocol ConvertToDocument
  nil
  (to-document [input]
    nil)

  String
  (to-document [^String input]
    input)

  Boolean
  (to-document [^Boolean input]
    input)

  java.util.Date
  (to-document [^java.util.Date input]
    input)

  clojure.lang.Ratio
  (to-document [^clojure.lang.Ratio input]
    (double input))

  clojure.lang.Keyword
  (to-document [^clojure.lang.Keyword input] (.getName input))

  clojure.lang.Named
  (to-document [^clojure.lang.Named input] (.getName input))

  clojure.lang.IPersistentMap
  (to-document [^cloure.lang.IPersistentMap input]
    (let [o (org.bson.Document.)]
      (doseq [[k v] input]
        (.put o (to-document k) (to-document v)))
      o))

  java.util.List
  (to-document [^java.util.List input] (map to-document input))

  java.util.Set
  (to-document [^java.util.Set input] (map to-document input))

  com.mongodb.DBObject
  (to-document [^com.mongodb.DBObject input] input)

  com.mongodb.DBRef
  (to-document [^com.mongodb.DBRef dbref]
    dbref)

  Object
  (to-document [input]
    input))

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

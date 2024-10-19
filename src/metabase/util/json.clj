(ns metabase.util.json
  "Functions for encoding and decoding JSON that abstract away the underlying implementation."
  (:require [jsonista.core :as jsonista])
  (:import clojure.lang.IType
           com.fasterxml.jackson.core.JsonGenerator))

(set! *warn-on-reflection* true)

(defn- byte-array-encoder
  "For binary arrays ([B), hex-encode their first four bytes, e.g. \"0xC42360D7\"."
  [arr ^JsonGenerator generator]
  (.writeString generator ^String (apply format "0x%02X%02X%02X%02X" (take 4 arr))))

;; Always fall back to `.toString` instead of barfing. In some cases we should be able to improve upon this behavior;
;; `.toString` may just return the Class and address, e.g. `some.Class@72a8b25e`
;; The following are known few classes where `.toString` is the optimal behavior:
;; *  `org.postgresql.jdbc4.Jdbc4Array` (Postgres arrays)
;; *  `org.bson.types.ObjectId`         (Mongo BSON IDs)
;; *  `java.sql.Date`                   (SQL Dates -- .toString returns YYYY-MM-DD)
(defn- fallback-object-encoder [obj ^JsonGenerator generator]
  (.writeString generator (str obj)))

(defonce ^:private encoders
  (atom {(Class/forName "[B") byte-array-encoder
         IType fallback-object-encoder
         ;; Object               fallback-object-encoder
         }))

(defn object-mapper
  "Create a new Jackson ObjectMapper object using the default global encoders. For supported options, see
  `jsonista.core/object-mapper`."
  [options-map]
  (jsonista/object-mapper (-> options-map
                              (assoc :encoders @encoders)
                              (update :do-not-fail-on-empty-beans #(if (nil? %) true %)))))

(def ^:private global-mapper
  "Jsonista doesn't have a concept of a \"global\" object mapper like Cheshire does, so we simulate it here. The object
  mapper defined in this namespace must be used for all encoding and decoding work around Metabase, and hence, the
  functions from this namespace should be used everywhere instead of jsonista.core functions."
  (atom (object-mapper {})))

(def ^:private global-mapper-keywordize-keys
  (atom (object-mapper {:decode-key-fn true})))

(defn add-encoder
  "Register `encoder` for `class` in `global-mapper`."
  [class encoder]
  (swap! encoders assoc class encoder)
  (reset! global-mapper (object-mapper {}))
  (reset! global-mapper-keywordize-keys (object-mapper {:decode-key-fn true})))

(defn encode
  "Return a JSON-encoding String for the given object. 1-arity uses `global-mapper`."
  (^String [obj]
   (jsonista/write-value-as-string obj @global-mapper))
  (^String [obj mapper]
   (jsonista/write-value-as-string obj mapper)))

(defn encode-to
  "Encode a value as JSON and write using the provided WriteValue instance.
  By default, File, OutputStream, DataOutput and Writer are supported. Uses `global-mapper`."
  [to obj]
  (jsonista/write-value to obj @global-mapper))

(defn decode
  "Decode a value from a JSON from anything that satisfies Jsonista's ReadValue protocol. By default, File, URL, String,
  Reader and InputStream are supported. Uses `global-mapper`."
  ([source]
   (jsonista/read-value source @global-mapper))
  ([source key-fn]
   (jsonista/read-value source (object-mapper {:decode-key-fn key-fn}))))

(defn decode+kw
  "Decode a value from a JSON from anything that satisfies Jsonista's ReadValue protocol, keywordizing the map keys. By
  default, File, URL, String, Reader and InputStream are supported. Uses `global-mapper-keywordize-keys`."
  [source]
  (jsonista/read-value source @global-mapper-keywordize-keys))

(ns metabase.util.json
  "Functions for encoding and decoding JSON that abstract away the underlying implementation."
  (:require
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [cheshire.core :as cheshire]
   [cheshire.factory]
   [cheshire.generate :as json.generate]
   [clojure.java.io :as io])
  (:import
   (com.fasterxml.jackson.core JsonGenerator)
   (java.io InputStream Reader)
   (java.util Base64)))

(set! *warn-on-reflection* true)

(defn add-encoder
  "Register a custom `encoder` for `class`."
  [class encoder]
  (json.generate/add-encoder class encoder))

(defn create-generator
  "Returns JsonGenerator for given writer."
  [writer]
  (cheshire/create-generator writer))

;; Tell the JSON middleware to use a date format that includes milliseconds (why?)
(def default-date-format "Default date formatter for JSON serialization." "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")

(alter-var-root #'cheshire.factory/default-date-format (constantly default-date-format))
(alter-var-root #'json.generate/*date-format* (constantly default-date-format))

(defn generate
  "Call `cheshire.generate/generate`."
  [jg obj date-format ex key-fn]
  (json.generate/generate jg obj date-format ex key-fn))

(defn generate-map
  "Encode a clojure map to the json generator."
  [m jg]
  (json.generate/encode-map m jg))

(defn generate-nil
  "Encode null to the json generator."
  [_ ^JsonGenerator jg]
  (.writeNull jg))

(defn raw-json-generator
  "Wrap a string so it will be spliced directly into resulting JSON as-is. Analogous to HoneySQL `raw`."
  [^String s]
  (reify json.generate/JSONable
    (to-json [_ generator]
      (.writeRawValue ^JsonGenerator generator s))))

(defn has-custom-encoder?
  "Return true if the type of the given value has a registered custom implementation of JSONable."
  [value]
  (contains? (:impls json.generate/JSONable) (type value)))

(defn write-string
  "Encode string to the json generator."
  [^JsonGenerator jg ^String str]
  (json.generate/write-string jg str))

(defn encode
  "Return a JSON-encoding String for the given object."
  (^String [obj]
   (cheshire/generate-string obj))
  (^String [obj opt-map]
   (cheshire/generate-string obj opt-map)))

(defn encode-to
  "Encode a value as JSON and write to the given Writer object."
  [obj writer opt-map]
  (cheshire/generate-stream obj writer opt-map))

(defn decode
  "Decode a value from a JSON from a string, InputStream, or Reader."
  ([source] (decode source nil))
  ([source key-fn]
   (cond (string? source) (cheshire/parse-string source key-fn)
         (instance? Reader source) (cheshire/parse-stream source key-fn)
         (instance? InputStream source) (cheshire/parse-stream (io/reader source) key-fn)
         (nil? source) nil
         :else (throw (ex-info (str "Unsupported source type: " (type source)) {})))))

(defn decode+kw
  "Decode a value from a JSON from a string, InputStream, or Reader, keywordizing map keys."
  [source]
  (decode source true))

;;; Binary data encoding support

(defn bytes->base64
  "Convert byte array to base64 string for JSON encoding."
  [^bytes byte-array]
  (when byte-array
    (.encodeToString (Base64/getEncoder) byte-array)))

(defn base64->bytes
  "Convert base64 string back to byte array for filtering/querying."
  [^String base64-str]
  (when base64-str
    (.decode (Base64/getDecoder) base64-str)))

(defn bytes->hex
  "Convert byte array to hexadecimal string representation."
  [^bytes byte-array]
  (when byte-array
    (str "0x" (apply str (map #(format "%02x" %) byte-array)))))

;; Register encoder for byte arrays to be serialized as base64 strings
(add-encoder (Class/forName "[B") ; byte array class
             (fn [byte-array ^JsonGenerator jg]
               (.writeString jg (bytes->base64 byte-array))))

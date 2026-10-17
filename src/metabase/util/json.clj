(ns metabase.util.json
  "Functions for encoding and decoding JSON that abstract away the underlying implementation."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [s-exp.oda :as oda])
  (:import
   (clojure.lang AFunction RestFn)
   (java.io InputStream OutputStream Reader Writer)
   (java.lang.reflect Method)))

(set! *warn-on-reflection* true)

(defonce ^:private encoders
  ;; {Class fn}, handed to oda as-is: it caches resolutions per map, so it only changes when an encoder is added.
  (atom {}))

(defonce ^:private fallback-encoder
  ;; Encoder registered for `Object`. oda would apply an `Object` encoder to every value, natively writable ones
  ;; included, so it is kept apart and only used for values oda cannot write.
  (atom nil))

(defn- one-arg-callable?
  "False when `f` is a fn that cannot be called with one argument. Only plain fns can be checked: other callables
  (multimethods, ...) are assumed to be callable."
  [f]
  (let [f (if (var? f) @f f)]
    (cond
      (instance? RestFn f)
      (<= (.getRequiredArity ^RestFn f) 1)

      (instance? AFunction f)
      (boolean (some (fn [^Method m]
                       (and (= "invoke" (.getName m))
                            (= 1 (.getParameterCount m))))
                     (.getDeclaredMethods (class f))))

      :else
      true)))

(defn add-encoder
  "Register `encoder`, a fn of an instance of `class` returning the value to write in its place (e.g. a String).

  It takes precedence over the built-in encoding of `class` (records, byte arrays, java.time...), and applies to
  subclasses and implementations of `class` that have no encoder of their own, like protocol dispatch. The returned
  value is written without re-applying this encoder, so it may be the instance itself.

  An encoder for `Object` is the exception: it is only used for values that cannot be written otherwise."
  [^Class class encoder]
  (when-not (one-arg-callable? encoder)
    ;; encoders used to be fns of [value json-generator] that wrote to a Jackson generator: fail where they are
    ;; registered rather than on the first value they should encode
    (throw (IllegalArgumentException.
            (str "JSON encoder for " (.getName class) " must take one argument, the value to encode, and return the"
                 " value to write in its place. Encoders of [value json-generator] are no longer supported."))))
  (if (= class Object)
    (reset! fallback-encoder encoder)
    (swap! encoders assoc class encoder)))

(defn has-custom-encoder?
  "Return true if the type of the given value has a registered custom encoder."
  [value]
  (contains? @encoders (type value)))

;; Tell the JSON middleware to use a date format that includes milliseconds (why?)
(def default-date-format "Default date formatter for JSON serialization." "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")

(defn- default-fn
  "Called by oda on values it cannot write: non-finite floating point numbers, written as strings like Jackson does
  (`\"NaN\"`), and values of types without an encoder."
  [x]
  (cond
    (or (instance? Double x) (instance? Float x)) (str x)
    @fallback-encoder (@fallback-encoder x)
    :else (throw (ex-info (str "Cannot JSON encode object of class: " (.getName (class x)))
                          {:class (class x)}))))

(defn- map-key
  "Writes map keys oda has no encoding for (nil, dates, collections...) as their `str`, like cheshire did."
  [k]
  (if (or (keyword? k) (string? k))
    k
    (str k)))

(defn- write-opts
  [opt-map]
  {:encoders @encoders
   :default-fn default-fn
   :key-fn map-key
   :date-format default-date-format
   :pretty (:pretty opt-map)})

(defn encode
  "Return a JSON-encoding String for the given object.

  Options:
  * `:pretty` - when true, indent the output one map entry per line, like Jackson's default pretty printer."
  (^String [obj]
   (oda/write-str obj (write-opts nil)))
  (^String [obj opt-map]
   (oda/write-str obj (write-opts opt-map))))

(defn encode-to
  "Encode a value as JSON and write it to `out`, an OutputStream (UTF-8) or a Writer, and return `out`. Neither
  flushes nor closes `out`. See [[encode]] for options."
  [obj out opt-map]
  (if (instance? OutputStream out)
    (oda/write obj out (write-opts opt-map))
    (.write ^Writer out (encode obj opt-map)))
  out)

(defn- parse-opts
  [key-fn]
  {:key-fn (cond
             (true? key-fn) keyword
             key-fn key-fn)})

(defn- read-one
  "Read the first JSON value from `rdr`, a Reader or InputStream, or nil if it is empty."
  [rdr key-fn]
  (oda/read (oda/reader rdr (parse-opts key-fn)) {:eof-value nil}))

(defn- blank-bytes?
  [^bytes bs]
  (loop [i 0]
    (if (= i (alength bs))
      true
      (case (aget bs i)
        (32 9 10 13) (recur (inc i))
        false))))

(defn- parse-bytes
  "Parse the UTF-8 JSON in `bs`, or nil if it is blank."
  [^bytes bs key-fn]
  (when-not (blank-bytes? bs)
    (oda/parse bs (parse-opts key-fn))))

(defn decode
  "Decode a value from JSON in a string, byte array, InputStream (UTF-8), or Reader. Blank input decodes to nil.

  Prefer an InputStream to a Reader over the same bytes: oda parses bytes, so it reads a whole InputStream at once
  and parses it about twice as fast as it can transcode a Reader's chars back to bytes as it goes.

  `key-fn` transforms map keys: `true` keywordizes them, otherwise it is a fn of the key String."
  ([source] (decode source nil))
  ([source key-fn]
   (cond (string? source) (when-not (str/blank? source)
                            (oda/parse ^String source (parse-opts key-fn)))
         (instance? Reader source) (read-one source key-fn)
         (instance? InputStream source) (with-open [^InputStream is source]
                                          (parse-bytes (.readAllBytes is) key-fn))
         (nil? source) nil
         (bytes? source) (parse-bytes source key-fn)
         :else (throw (ex-info (str "Unsupported source type: " (type source)) {})))))

(defn decode+kw
  "Decode a value from a JSON from a string, InputStream, or Reader, keywordizing map keys."
  [source]
  (decode source true))

(defn decode-document+kw
  "Decode the single JSON value that makes up string `s`, keywordizing map keys.
  Throws if anything other than whitespace follows that value."
  [^String s]
  (decode s true))

(defn- parse-charset
  "Parse charset from content-type header, e.g. 'application/json; charset=utf-8' -> 'utf-8'.
   Returns nil if no charset is specified."
  [content-type]
  (when content-type
    (second (re-find #"(?i)charset=([^\s;]+)" content-type))))

(defn- decode-with-encoding
  "Decode JSON from body, respecting the charset from content-type header."
  [body content-type]
  (let [encoding (parse-charset content-type)]
    (if (and (instance? InputStream body)
             encoding
             (not (.equalsIgnoreCase "UTF-8" ^String encoding)))
      (with-open [r (io/reader body :encoding encoding)]
        (read-one r true))
      (decode body true))))

(defn decode-body
  "Given a response map, decodes body if headers indicate it's a JSON response, or just slurps if it's not a string."
  [res]
  (let [ctype (get-in res [:headers "content-type"])]
    (cond
      (some-> ctype (str/starts-with? "application/json")) (update res :body decode-with-encoding ctype)
      (string? (:body res))                                res
      :else                                                (update res :body slurp))))

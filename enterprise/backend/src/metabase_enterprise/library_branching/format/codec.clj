(ns metabase-enterprise.library-branching.format.codec
  "The `Codec` protocol, and the reader of the YAML form of a document.

  A document is plain data: maps with keyword keys, vectors, strings, integers, finite doubles, booleans and nil. A
  codec turns an item into a document and back; `writer/write-yaml` and [[read-yaml]] turn a document into the bytes
  of a file and back, so every kind gets its canonical bytes from one writer."
  (:require
   [clj-yaml.core :as yaml])
  (:import
   (java.nio ByteBuffer)
   (java.nio.charset CharacterCodingException CodingErrorAction StandardCharsets)))

(set! *warn-on-reflection* true)

(defprotocol Codec
  "The file form of one kind, as a document. Pure. Laws: `(decode c (encode c id item))` = `[id item]`, and `encode`
  is a function of `id` and `item` only."
  (kind [codec]
    "The kind keyword of the items of this codec.")
  (encode [codec id item]
    "The document of item `item` with identity `id`: a map whose `:kind` is the name of [[kind]], with the identity,
    the place and every content attribute of the item. An attribute at its default value is omitted.")
  (decode [codec doc]
    "`[id item]` of document `doc`, whose `:kind` is the name of [[kind]]. Reads only `doc`; an absent key decodes to
    its default. Throws an ex-info of type ::invalid ([[invalid!]]) when `doc` is not a document of this kind.")
  (schema [codec]
    "The Malli schema of the items of this kind."))

(defn invalid!
  "Throws the ex-info of type ::invalid, with `reason`, that [[decode]] throws for a document not of its kind."
  [reason]
  (throw (ex-info reason {:type ::invalid :reason reason})))

(defn by-kind
  "`{kind codec}` of the codecs `codecs`. Throws when two codecs have one kind."
  [codecs]
  (reduce (fn [m c]
            (let [k (kind c)]
              (when (contains? m k)
                (throw (ex-info (str "Two codecs have the kind " k) {:kind k})))
              (assoc m k c)))
          {}
          codecs))

;;; ---------------------------------------------------- The reader ---------------------------------------------------

(defn- unreadable!
  ([reason] (unreadable! reason nil))
  ([reason cause] (throw (ex-info reason {:type ::unreadable :reason reason} cause))))

(defn- utf-8-text
  ^String [^bytes b]
  (try
    (str (.decode (doto (.newDecoder StandardCharsets/UTF_8)
                    (.onMalformedInput CodingErrorAction/REPORT)
                    (.onUnmappableCharacter CodingErrorAction/REPORT))
                  (ByteBuffer/wrap b)))
    (catch CharacterCodingException e
      (unreadable! "The file is not UTF-8 text." e))))

(defn- ->document
  [x]
  (cond
    (map? x)        (into {} (map (fn [[k v]]
                                    (if (string? k)
                                      [(keyword k) (->document v)]
                                      (unreadable! (str "A key is not a string: " (pr-str k))))))
                          x)
    (sequential? x) (mapv ->document x)
    (or (string? x)
        (boolean? x)
        (nil? x))   x
    (int? x)        (long x)
    (instance? java.math.BigInteger x) (bigint x)
    (and (double? x)
         (Double/isFinite x)) x
    :else           (unreadable! (str "A value is not text, a number, a boolean or null: " (pr-str x)))))

(def ^:private nesting-depth-limit
  ;; SnakeYAML's default of 50 is too shallow for deeply nested MBQL; this is the limit of `metabase.util.yaml`.
  10000)

(defn parse
  "The YAML documents of `text`, as a vector. A syntax error, a duplicate key and a tag that is not a YAML type throw
  here."
  [^String text]
  ;; clj-yaml reads the documents lazily; `vec` makes a parse error throw inside the caller's `try`.
  (vec (yaml/parse-string text :keywords false :load-all true :allow-duplicate-keys false
                          :nesting-depth-limit nesting-depth-limit)))

(defn read-yaml
  "The document of the YAML bytes `b`. Throws an ex-info of type ::unreadable when `b` is not UTF-8 text that holds
  exactly one YAML document of the document model. A duplicate key, a key that is not a string, a timestamp, binary
  data, a set and a double that is not finite are outside the model."
  [^bytes b]
  (let [docs (try
               (parse (utf-8-text b))
               (catch clojure.lang.ExceptionInfo e
                 (if (= ::unreadable (:type (ex-data e)))
                   (throw e)
                   (unreadable! (str "The file is not YAML: " (ex-message e)) e)))
               (catch Exception e
                 (unreadable! (str "The file is not YAML: " (ex-message e)) e)))]
    (if (= 1 (count docs))
      (->document (first docs))
      (unreadable! (str "The file holds " (count docs) " YAML documents, not one.")))))

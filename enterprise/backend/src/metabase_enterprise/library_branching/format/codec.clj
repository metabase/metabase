(ns metabase-enterprise.library-branching.format.codec
  "The `Codec` protocol, and the canonical YAML form of a document.

  A document is plain data: maps with keyword keys, vectors, strings, integers, finite doubles, booleans and nil. A
  codec turns an item into a document and back; [[write-yaml]] and [[read-yaml]] turn a document into the bytes of a
  file and back, so every kind gets its canonical bytes from one writer."
  (:require
   [clojure.string :as str]
   [metabase.util.yaml :as u.yaml])
  (:import
   (java.io StringWriter)
   (java.nio ByteBuffer)
   (java.nio.charset CharacterCodingException CodingErrorAction StandardCharsets)
   (org.yaml.snakeyaml DumperOptions DumperOptions$FlowStyle DumperOptions$LineBreak DumperOptions$ScalarStyle)
   (org.yaml.snakeyaml.emitter Emitter)
   (org.yaml.snakeyaml.nodes MappingNode Node NodeTuple ScalarNode SequenceNode Tag)
   (org.yaml.snakeyaml.resolver Resolver)
   (org.yaml.snakeyaml.serializer Serializer)))

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

;;; ---------------------------------------------------- The writer ---------------------------------------------------

(defn- outside-model!
  [x]
  (throw (ex-info (str "A value is not in the document model: " (pr-str x) " (" (some-> x class .getName) ")")
                  {:value x})))

(defn- key-name
  [k]
  (if (keyword? k) (subs (str k) 1) (outside-model! k)))

(defn- key-order
  "The written order of the keys of a map: kind, then id, then the others in the order of their text."
  [k]
  (case k
    "kind" [0 ""]
    "id"   [1 ""]
    [2 k]))

(declare yaml-text)

(defn canonical
  "The canonical form of document `x`, one value for each class of equal documents: a map is a vector of
  `[key-text value]` pairs in [[key-order]] with the metadata `::map`; a set is a vector in the order of the YAML text
  of its elements; an integer is a long or a bigint; a double is never -0.0. Throws for a value outside the document
  model."
  [x]
  (cond
    (map? x)     (with-meta (mapv (fn [[k v]] [k (canonical v)]) (sort-by (comp key-order key) (update-keys x key-name)))
                            {::map true})
    (set? x)     (vec (sort-by yaml-text (map canonical x)))
    (vector? x)  (mapv canonical x)
    (string? x)  x
    (boolean? x) x
    (nil? x)     x
    (int? x)     (long x)
    (or (instance? clojure.lang.BigInt x)
        (instance? java.math.BigInteger x)) (bigint x)
    (and (double? x)
         (Double/isFinite x)) (if (zero? x) 0.0 x)
    :else        (outside-model! x)))

(def ^:private ^DumperOptions dumper-options
  (doto (DumperOptions.)
    (.setDefaultFlowStyle DumperOptions$FlowStyle/AUTO)
    (.setDefaultScalarStyle DumperOptions$ScalarStyle/PLAIN)
    (.setAllowUnicode true)
    (.setLineBreak DumperOptions$LineBreak/UNIX)
    (.setIndent 2)
    (.setIndicatorIndent 0)
    (.setWidth 80)
    (.setSplitLines true)
    (.setExplicitStart false)
    (.setExplicitEnd false)))

(def ^:private unicode-line-break
  ;; SnakeYAML writes these characters raw in a single-quoted scalar, and a reader folds them to a space.
  #"[\u0085\u2028\u2029]")

(defn scalar-style
  "The style that the writer asks for string `s`: double-quoted for text with a Unicode line break, a literal block for
  text with a line break, else plain. The emitter quotes a string that the asked style cannot hold."
  [^String s]
  (cond
    (re-find unicode-line-break s) DumperOptions$ScalarStyle/DOUBLE_QUOTED
    (str/includes? s "\n")        DumperOptions$ScalarStyle/LITERAL
    :else                          DumperOptions$ScalarStyle/PLAIN))

(defn- key-style
  [^String k]
  (if (re-find unicode-line-break k) DumperOptions$ScalarStyle/DOUBLE_QUOTED DumperOptions$ScalarStyle/PLAIN))

(defn- scalar-node
  ^Node [^Tag tag ^String text style]
  (ScalarNode. tag text nil nil style))

(defn- flow-style
  "Flow style (`[a, b]`, `{a: 1}`) for a collection of scalars only; block style for every other collection."
  ^DumperOptions$FlowStyle [nodes]
  (if (every? #(instance? ScalarNode %) nodes) DumperOptions$FlowStyle/FLOW DumperOptions$FlowStyle/BLOCK))

(defn- ->node
  "The YAML node of canonical form `x`."
  ^Node [x]
  (cond
    (::map (meta x)) (let [tuples (mapv (fn [[k v]]
                                          (NodeTuple. (scalar-node Tag/STR k (key-style k)) (->node v)))
                                        x)]
                       (MappingNode. Tag/MAP
                                     ^java.util.List tuples
                                     (flow-style (mapcat (fn [^NodeTuple t] [(.getKeyNode t) (.getValueNode t)])
                                                         tuples))))
    (vector? x)      (let [nodes (mapv ->node x)]
                       (SequenceNode. Tag/SEQ ^java.util.List nodes (flow-style nodes)))
    (string? x)      (scalar-node Tag/STR x (scalar-style x))
    (boolean? x)     (scalar-node Tag/BOOL (str x) DumperOptions$ScalarStyle/PLAIN)
    (nil? x)         (scalar-node Tag/NULL "null" DumperOptions$ScalarStyle/PLAIN)
    (integer? x)     (scalar-node Tag/INT (str x) DumperOptions$ScalarStyle/PLAIN)
    :else            (scalar-node Tag/FLOAT (str x) DumperOptions$ScalarStyle/PLAIN)))

(defn- yaml-text
  "The YAML text of canonical form `x`."
  ^String [x]
  (let [w (StringWriter.)
        s (Serializer. (Emitter. w dumper-options) (Resolver.) dumper-options nil)]
    (.open s)
    (.serialize s (->node x))
    (.close s)
    (str w)))

(defn write-yaml
  "The canonical YAML bytes of document `doc`, UTF-8 with a final newline. Equal documents give equal bytes. A set
  stands for a vector of its elements. Throws for a value outside the document model."
  ^bytes [doc]
  (.getBytes (yaml-text (canonical doc)) StandardCharsets/UTF_8))

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

(defn parse
  "The YAML documents of `text`. A duplicate key and a tag that is not a YAML type throw."
  [^String text]
  (u.yaml/parse-string text :keywords false :load-all true :allow-duplicate-keys false))

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

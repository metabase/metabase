(ns metabase-enterprise.library-branching.format.writer
  "The canonical bytes of the format: of a document ([[write-yaml]]) and of a snapshot as a tree ([[encode-tree]]).
  Equal values give equal bytes."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.library-branching.format.codec :as codec]
   [metabase-enterprise.library-branching.format.layout :as layout]
   [metabase-enterprise.library-branching.format.tree :as tree])
  (:import
   (java.io StringWriter)
   (java.nio.charset StandardCharsets)
   (java.security MessageDigest)
   (org.yaml.snakeyaml DumperOptions DumperOptions$FlowStyle DumperOptions$LineBreak DumperOptions$ScalarStyle)
   (org.yaml.snakeyaml.emitter Emitter)
   (org.yaml.snakeyaml.nodes MappingNode Node NodeTuple ScalarNode SequenceNode Tag)
   (org.yaml.snakeyaml.resolver Resolver)
   (org.yaml.snakeyaml.serializer Serializer)))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------- Documents ----------------------------------------------------

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
  #"[\u0085  ]")

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

(defn- block-root
  "`node` in block style when it is a collection: a file is never one line of flow style."
  ^Node [^Node node]
  (when-not (instance? ScalarNode node)
    (.setFlowStyle ^org.yaml.snakeyaml.nodes.CollectionNode node DumperOptions$FlowStyle/BLOCK))
  node)

(defn- yaml-text
  "The YAML text of canonical form `x`."
  ^String [x]
  (let [w (StringWriter.)
        s (Serializer. (Emitter. w dumper-options) (Resolver.) dumper-options nil)]
    (.open s)
    (.serialize s (block-root (->node x)))
    (.close s)
    (str w)))

(defn write-yaml
  "The canonical YAML bytes of document `doc`, UTF-8 with a final newline. Equal documents give equal bytes. A set
  stands for a vector of its elements. Throws for a value outside the document model."
  ^bytes [doc]
  (.getBytes (yaml-text (canonical doc)) StandardCharsets/UTF_8))

;;; ------------------------------------------------------ Trees ------------------------------------------------------

(defn- encode-file
  ^bytes [c id item]
  (let [doc (codec/encode c id item)]
    (when-not (= (name (codec/kind c)) (:kind doc))
      (throw (ex-info (str "The codec of the kind " (codec/kind c) " gave a document of another kind.")
                      {:kind (codec/kind c) :doc-kind (:kind doc)})))
    (write-yaml doc)))

(defn encode-tree
  "`{path bytes}` of snapshot `s`, with the codecs `codecs`: each item at the path that `layout/layout` gives, and the
  format version file at `tree/format-path`. Equal snapshots give equal trees. Throws when a kind of `s` has no codec,
  or when `s` has a place outside it or a containment cycle."
  ([codecs s]
   (encode-tree codecs s #{}))
  ([codecs s _taken]
   (let [by-kind (codec/by-kind codecs)
         paths   (layout/layout codecs s)]
     (into {tree/format-path (write-yaml {:format tree/format-version})}
           (map (fn [[id item]] [(get paths id) (encode-file (get by-kind (:kind item)) id item)]))
           s))))

(defn- sha-256-hex
  ^String [^bytes b]
  (format "%064x" (BigInteger. 1 (.digest (MessageDigest/getInstance "SHA-256") b))))

(defn item-digests
  "`{identity digest}` of snapshot `s`, with the codecs `codecs`: the SHA-256 of the canonical bytes of the file of each
  item, as 64 lower-case hex digits. Two items of one identity have equal digests iff they are equal. Throws when a
  kind of `s` has no codec."
  [codecs s]
  (let [by-kind (codec/by-kind codecs)]
    (into {}
          (map (fn [[id item]]
                 [id (sha-256-hex (encode-file (or (get by-kind (:kind item))
                                                   (throw (ex-info (str "No codec for the kind " (:kind item))
                                                                   {:kind (:kind item)})))
                                               id
                                               item))]))
          s)))

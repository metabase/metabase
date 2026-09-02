(ns metabase.util.deserialization-allowlist
  "A composable allow-list for Java deserialization.

  `ObjectInputStream.readObject` will reconstruct any serializable class on the classpath, not just the
  ones a caller stores. JEP 290's `ObjectInputFilter` lets you declare which classes a stream is
  expected to contain and reject the rest before they're constructed. This namespace provides that for
  EDN-shaped data (keywords, strings, numbers, maps/sets/vectors), which serializes to a small fixed
  set of Clojure/JDK classes — [[clojure-data-prefixes]]. Callers that wrap their data (Quartz in a
  `JobDataMap`, say) add their own prefixes on top via [[allow-list-filter]].

  Apply the filter to a single `ObjectInputStream` you control — not process-wide — so it constrains
  only your reads. Leaf namespace (JDK only), usable from any module."
  (:import
   (java.io ByteArrayInputStream InputStream ObjectInputFilter ObjectInputFilter$Status ObjectInputStream)))

(set! *warn-on-reflection* true)

(def clojure-data-prefixes
  "Class-name prefixes the EDN value space serializes to. By package, not exact class, because Clojure's
  collections use private inner classes (`PersistentHashMap$BitmapIndexedNode` and friends) not worth
  enumerating. Add your own wrapper prefixes on top when calling [[allow-list-filter]]."
  ["clojure.lang."   ; Keyword, Persistent{Array,Hash}Map/Set/Vector, BigInt, Ratio, … and inner nodes
   "java.lang."      ; String, Long, Integer, Double, Boolean, Character, …
   "java.util."      ; HashMap/ArrayList/… when a caller passes raw JDK collections
   "java.math."      ; BigDecimal, BigInteger
   "java.time."])    ; the java.time value types

(defn- element-class
  "Peel array dimensions off `c`, returning the ultimate element `Class`."
  ^Class [^Class c]
  (loop [^Class k c]
    (if (.isArray k) (recur (.componentType k)) k)))

(defn allow-list-filter
  "An `ObjectInputFilter` allowing only classes under one of `prefixes` (plus primitive array elements),
  rejecting everything else. `prefixes` is the full allow-list — e.g.
  `(conj clojure-data-prefixes \"my.wrapper.\")`. Attach via `.setObjectInputFilter` to one stream you
  control; not for process-wide use."
  ^ObjectInputFilter [prefixes]
  (let [prefixes (vec prefixes)]
    (reify ObjectInputFilter
      (checkInput [_ info]
        (let [c (.serialClass info)]
          (if (nil? c)
            ObjectInputFilter$Status/ALLOWED        ; no class to check (array lengths, back-refs, …)
            (let [element (element-class c)]
              (if (or (.isPrimitive element)
                      (let [n (.getName element)]
                        (some #(.startsWith n ^String %) prefixes)))
                ObjectInputFilter$Status/ALLOWED
                ObjectInputFilter$Status/REJECTED))))))))

(defn read-object
  "Read one object from `in` through an [[allow-list-filter]] of `allowed-prefixes`, closing the stream.
  A class outside the allow-list throws `InvalidClassException` rather than being constructed. Returns
  nil for a nil or empty stream."
  [^InputStream in allowed-prefixes]
  (when (and in
             (not (and (instance? ByteArrayInputStream in)
                       (zero? (.available ^ByteArrayInputStream in)))))
    (with-open [ois (doto (ObjectInputStream. in)
                      (.setObjectInputFilter (allow-list-filter allowed-prefixes)))]
      (.readObject ois))))

(defn read-object-bytes
  "Like [[read-object]] but from a byte array. Returns nil for nil or empty `ba`."
  [^bytes ba allowed-prefixes]
  (when (and ba (pos? (alength ba)))
    (read-object (ByteArrayInputStream. ba) allowed-prefixes)))

(ns metabase-enterprise.serialization.metadata-file-import.parsers.yaml
  "Streaming YAML parser for the metadata file importer. Walks SnakeYAML's
  event iterator (`Yaml.parse(reader)`), advances to a named array, and emits
  its items in batches via a callback. Items are built with a small recursive
  descent over events; memory bounded by the in-flight item plus the current
  batch buffer.

  Mirrors the public shape of [[metabase-enterprise.serialization.metadata-file-import.parsers.json]].
  Aliases (`*name`) and tagged scalars are not supported — the export side
  never emits them."
  (:import
   (java.io Reader)
   (java.util Iterator)
   (org.yaml.snakeyaml Yaml)
   (org.yaml.snakeyaml.events AliasEvent DocumentStartEvent MappingEndEvent
                              MappingStartEvent ScalarEvent SequenceEndEvent
                              SequenceStartEvent StreamStartEvent)))

(set! *warn-on-reflection* true)

(defn- coerce-scalar
  "Coerce a YAML scalar event to a Clojure value. Plain (unquoted) scalars get
  YAML 1.1 type inference: empty / `~` / `null` → nil; `true`/`false` (case
  variants) → Boolean; integer-shaped → Long; decimal-shaped → Double; otherwise
  → String. Quoted scalars stay String."
  [^ScalarEvent ev]
  (let [v (.getValue ev)]
    (if-not (.isPlain ev)
      v
      (cond
        (or (= v "") (= v "~") (= v "null") (= v "Null") (= v "NULL")) nil
        (or (= v "true") (= v "True") (= v "TRUE")) true
        (or (= v "false") (= v "False") (= v "FALSE")) false
        (re-matches #"-?\d+" v)         (Long/parseLong v)
        (re-matches #"-?\d+\.\d+" v)    (Double/parseDouble v)
        :else v))))

(declare ^:private read-from-event)

(defn- read-mapping
  "Build a Clojure map (keyword keys) from events between `MappingStartEvent`
  (already consumed by caller) and the matching `MappingEndEvent`."
  [^Iterator iter]
  (loop [acc (transient {})]
    (let [ev (.next iter)]
      (cond
        (instance? MappingEndEvent ev)
        (persistent! acc)

        (instance? ScalarEvent ev)
        (let [k (keyword (.getValue ^ScalarEvent ev))
              v (read-from-event iter (.next iter))]
          (recur (assoc! acc k v)))

        :else
        (throw (ex-info (format "Expected scalar mapping key, got %s"
                                (.getSimpleName (class ev)))
                        {:kind :bad_shape, :got (.getSimpleName (class ev))}))))))

(defn- read-sequence
  "Build a Clojure vector from events between `SequenceStartEvent` (already
  consumed by caller) and the matching `SequenceEndEvent`."
  [^Iterator iter]
  (loop [acc (transient [])]
    (let [ev (.next iter)]
      (if (instance? SequenceEndEvent ev)
        (persistent! acc)
        (recur (conj! acc (read-from-event iter ev)))))))

(defn- read-from-event
  "Build a Clojure value rooted at the already-fetched `ev`. For composite events,
  consumes additional events from `iter` until the matching close event."
  [^Iterator iter ev]
  (condp instance? ev
    ScalarEvent        (coerce-scalar ev)
    MappingStartEvent  (read-mapping iter)
    SequenceStartEvent (read-sequence iter)
    AliasEvent         (throw (ex-info "YAML aliases (*name) are not supported"
                                       {:kind :unsupported_alias}))
    (throw (ex-info (format "Unexpected YAML event %s"
                            (.getSimpleName (class ev)))
                    {:kind :bad_shape, :got (.getSimpleName (class ev))}))))

(defn- skip-value!
  "Consume events for one value rooted at `ev`. Used to advance past unrelated
  top-level keys' values without materializing them."
  [^Iterator iter ev]
  (cond
    (instance? ScalarEvent ev)        nil
    (instance? MappingStartEvent ev)  (loop []
                                        (let [next-ev (.next iter)]
                                          (when-not (instance? MappingEndEvent next-ev)
                                            (skip-value! iter (.next iter))
                                            (recur))))
    (instance? SequenceStartEvent ev) (loop []
                                        (let [next-ev (.next iter)]
                                          (when-not (instance? SequenceEndEvent next-ev)
                                            (skip-value! iter next-ev)
                                            (recur))))
    :else (throw (ex-info (format "Unexpected YAML event %s while skipping"
                                  (.getSimpleName (class ev)))
                          {:kind :bad_shape}))))

(defn- advance-to-array!
  "Advance `iter` from start-of-input through the top-level mapping to the
  `SequenceStartEvent` for `target-key`. Throws `:bad_shape` if the document
  doesn't begin with a mapping or the value at `target-key` isn't a sequence;
  throws `:missing_key` if the key is absent."
  [^Iterator iter ^String target-key]
  ;; consume StreamStart, DocumentStart, top-level MappingStart
  (let [e1 (.next iter)]
    (when-not (instance? StreamStartEvent e1)
      (throw (ex-info "Malformed YAML: expected StreamStartEvent"
                      {:kind :bad_shape}))))
  (let [e2 (.next iter)]
    (when-not (instance? DocumentStartEvent e2)
      (throw (ex-info "Malformed YAML: expected DocumentStartEvent"
                      {:kind :bad_shape}))))
  (let [e3 (.next iter)]
    (when-not (instance? MappingStartEvent e3)
      (throw (ex-info "Expected YAML document to begin with a mapping"
                      {:kind :bad_shape, :target-key target-key}))))
  (loop []
    (let [ev (.next iter)]
      (cond
        (instance? MappingEndEvent ev)
        (throw (ex-info (format "Key %s not found in top-level mapping" (pr-str target-key))
                        {:kind :missing_key, :key target-key}))

        (instance? ScalarEvent ev)
        (let [k (.getValue ^ScalarEvent ev)
              vt (.next iter)]
          (cond
            (and (= k target-key) (instance? SequenceStartEvent vt))
            nil  ;; arrived

            (= k target-key)
            (throw (ex-info (format "Value of %s must be a sequence" (pr-str target-key))
                            {:kind :bad_shape, :key target-key}))

            :else
            (do (skip-value! iter vt)
                (recur))))

        :else
        (throw (ex-info (format "Unexpected event %s in top-level mapping"
                                (.getSimpleName (class ev)))
                        {:kind :bad_shape}))))))

(defn- consume-sequence-as-batches!
  "After SequenceStartEvent has been consumed, walk sequence items into batches
  of `[line-num row]` tuples (up to `batch-size`), calling `process-batch!` per
  batch. Returns when SequenceEndEvent is consumed."
  [^Iterator iter array-key batch-size process-batch!]
  (loop [batch    (transient [])
         line-num 0]
    (let [ev (.next iter)]
      (cond
        (instance? SequenceEndEvent ev)
        (when (pos? (count batch))
          (process-batch! (persistent! batch)))

        (instance? MappingStartEvent ev)
        (let [item       (read-mapping iter)
              ln         (inc line-num)
              next-batch (conj! batch [ln item])]
          (if (>= (count next-batch) batch-size)
            (do (process-batch! (persistent! next-batch))
                (recur (transient []) ln))
            (recur next-batch ln)))

        (instance? AliasEvent ev)
        (throw (ex-info "YAML aliases (*name) are not supported"
                        {:kind :unsupported_alias, :key array-key}))

        :else
        (throw (ex-info (format "Unexpected event %s in array %s"
                                (.getSimpleName (class ev)) (pr-str array-key))
                        {:kind :bad_shape, :key array-key}))))))

(defn stream-array-batches!
  "Walk `reader` to the sequence at top-level `array-key` (string or keyword),
  then invoke `(process-batch! batch)` for each successive batch of `[line-num
  row]` tuples (up to `batch-size` per batch). `line-num` is 1-indexed and
  continues across batch boundaries. Items are parsed into Clojure maps with
  keyword keys. Caller manages the lifecycle of `reader`."
  [^Reader reader array-key batch-size process-batch!]
  (let [iter (.iterator (.parse (Yaml.) reader))]
    (advance-to-array! iter (name array-key))
    (consume-sequence-as-batches! iter array-key batch-size process-batch!)))

(defn stream-keyed-arrays!
  "Walk `reader` once over a top-level YAML mapping. For each top-level key
  matching a keyword in `handlers` (a map of keyword → fn-of-batch), invoke
  the handler for each successive batch of `[line-num row]` tuples (up to
  `batch-size`). Other top-level keys are skipped. `line-num` is 1-indexed
  per sequence and continues across batch boundaries within a sequence.

  Mirrors the JSON parser's `stream-keyed-arrays!`: collapses N separate file
  passes (one per known key) into a single walk. Throws `:bad_shape` if the
  document doesn't begin with a mapping or if a known key's value isn't a
  sequence. Missing keys are silently OK."
  [^Reader reader batch-size handlers]
  (let [iter (.iterator (.parse (Yaml.) reader))]
    ;; consume StreamStart, DocumentStart, top-level MappingStart
    (let [e1 (.next iter)]
      (when-not (instance? StreamStartEvent e1)
        (throw (ex-info "Malformed YAML: expected StreamStartEvent"
                        {:kind :bad_shape}))))
    (let [e2 (.next iter)]
      (when-not (instance? DocumentStartEvent e2)
        (throw (ex-info "Malformed YAML: expected DocumentStartEvent"
                        {:kind :bad_shape}))))
    (let [e3 (.next iter)]
      (when-not (instance? MappingStartEvent e3)
        (throw (ex-info "Expected YAML document to begin with a mapping"
                        {:kind :bad_shape}))))
    (loop []
      (let [ev (.next iter)]
        (cond
          (instance? MappingEndEvent ev)
          nil

          (instance? ScalarEvent ev)
          (let [k          (.getValue ^ScalarEvent ev)
                handler-fn (get handlers (keyword k))
                vt         (.next iter)]
            (if handler-fn
              (do (when-not (instance? SequenceStartEvent vt)
                    (throw (ex-info (format "Value of %s must be a sequence" (pr-str k))
                                    {:kind :bad_shape, :key k})))
                  (consume-sequence-as-batches! iter k batch-size handler-fn)
                  (recur))
              (do (skip-value! iter vt)
                  (recur))))

          :else
          (throw (ex-info (format "Unexpected event %s in top-level mapping"
                                  (.getSimpleName (class ev)))
                          {:kind :bad_shape})))))))

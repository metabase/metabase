;; The interface encapsulating the various search engine backends.
(ns metabase.search.engine
  (:require
   [clojure.string :as str]
   [metabase.search.settings :as settings]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(def ^:private default-engine-precedence
  "The engines to use as the default, in decreasing order of preference.
  The first supported one wins, unless overridden by the [[settings/search-engine]] setting."
  [:search.engine/semantic
   :search.engine/appdb
   :search.engine/in-place])

(defmulti supported-engine?
  "Can this instance run the given engine?
  Implementations must be pure capability checks: app-db type, premium features, required infrastructure.
  They must not read [[settings/search-engine]], which selects among the supported engines."
  {:arglists '([engine])}
  identity)

(defmethod supported-engine? :default [engine]
  (throw (ex-info (format "Unknown search engine: %s" engine)
                  {:engine engine})))

(defmulti dependencies
  "Engines whose indexes this engine needs in order to serve queries.
  Semantic, for example, mixes appdb results into its own and falls back to appdb when its index is unavailable."
  {:arglists '([engine])}
  identity)

(defmethod dependencies :default [_] nil)

(defmulti results
  "Return a reducible of the search result matching a given query."
  {:arglists '([search-context])}
  :search-engine)

(defmulti model-set
  "Return a set of the models which have at least one result for the given query."
  {:arglists '([search-context])}
  :search-engine)

(defmulti diagnose
  "Explain why `(expected-model, expected-id)` does not appear in the index/query stages this engine owns.
  Returns `{:type ..., :details ...}` for the first engine-owned stage that drops it
  (`:missing-from-index`, `:filtered`, or `:not-matching`), or `{:type :candidate, :details ...}` if it passes
  every engine-owned stage.
  Engine-independent stages (`:not-searchable`, terminal `:matched`/`:ranked-out`) are handled by the caller in
  [[metabase.search.debug]].

  The `:filtered` `:details` `:excluded-by` value names the filter that dropped the row; shared keys (e.g. `:models`,
  `:created-by`, `:archived?`) are consistent across engines. Access-control exclusions are also reported under
  `:filtered` here — `:collection-permissions`/`:table-permissions`/`:permissions` (appdb) or `:permissions`
  (semantic) — and [[metabase.search.debug]] promotes those to `:not-permitted`; engines should check them before
  structural filters so access denial wins."
  {:arglists '([search-context expected-model expected-id])}
  (fn [{engine :search-engine} _ _] engine))

(defmulti score "For legacy search: perform the in-memory ranking"
  {:arglists '([search-context result])}
  (fn [{engine :search-engine} _]
    engine))

(defmethod score :default [_search-ctx result]
  {:result (dissoc result :score)
   :score  (:score result)})

(defmulti update!
  "Updates the existing search index by consuming the documents from the given reducible.
  Returns a map of the number of documents indexed in each model"
  {:arglists '([search-engine document-reducible])}
  (fn [search-engine _document-reducible]
    search-engine))

(defmulti delete!
  "Removes the documents from the search index.
  Returns a map of the number of documents deleted in each model"
  {:arglists '([search-engine model ids])}
  (fn [search-engine _model _ids]
    search-engine))

(defmulti init!
  "Ensure that the search index exists, and is ready to take search queries.
   Returns a map of the number of documents indexed in each model"
  {:arglists '([engine opts])}
  (fn [engine _opts]
    engine))

(defmulti reindex!
  "Perform a full refresh of the given engine's index."
  {:arglists '([engine opts])}
  (fn [engine _opts] engine))

(defmulti reset-tracking!
  "Stop tracking the current indexes. Used when resetting the appdb."
  {:arglists '([engine])}
  identity)

(defmulti sync-from-restored-db!
  "Reconcile in-memory search state with what's currently in the database.
   Used after snapshot restore where the DB already contains valid index data.
   Engines that store their index in the appdb can skip reindexing."
  {:arglists '([engine])}
  identity)

(defn known-engines
  "List the possible search engines defined for this version, whether this instance supports them or not."
  []
  ;; If we end up with more "abstract" nodes, we may want a better way to filter them out.
  (keys (dissoc (methods supported-engine?) :default)))

(defn known-engine?
  "Is the engine, or an engine it derives from, registered?"
  [engine]
  (let [registered? #(contains? (methods supported-engine?) %)]
    (boolean (some registered? (cons engine (ancestors engine))))))

(def ^:private warned-engine-values
  "Values already warned about, so misconfiguration warns once rather than on every call."
  (atom #{}))

(defn- warn-once! [value message]
  (when-not (contains? @warned-engine-values value)
    (swap! warned-engine-values conj value)
    (log/warn message)))

(def ^:private legacy-engine-names
  "Renamed engines that may still arrive via old configuration or long-lived cookies."
  {"fulltext" "appdb"})

(defn canonical-engine
  "Coerce an engine name (string or keyword) to its canonical engine keyword.
  Resolves legacy names and tolerates the qualified search.engine/ prefix the API echoes in responses.
  Every configuration and request boundary must canonicalize through this, so that engine identities
  compare with =.
  Malformed values yield an unknown engine named after the raw value, never an empty keyword."
  [value]
  (let [raw         (name value)
        stripped    (str/replace raw #"^search\.engine/" "")
        engine-name (if (str/blank? stripped) raw stripped)]
    (keyword "search.engine" (get legacy-engine-names engine-name engine-name))))

(defn- validated-engine
  "Coerce a configured engine name to a known engine keyword.
  Unknown values return nil with a one-time warning, so a typo in MB_SEARCH_ENGINE cannot break search."
  [value]
  (when value
    (let [engine (canonical-engine value)]
      (if (known-engine? engine)
        engine
        (warn-once! value (format "Ignoring unknown search engine: %s" value))))))

(defn- configured-engine []
  ;; The raw setting value, not the public getter: [[settings/search-engine]] resolves its default via
  ;; [[default-engine]], so reading it here would recurse.
  (validated-engine (settings/configured-search-engine)))

(defn supported-engines
  "List the search engines that are supported, in order of usage preference.
   The configured engine comes first, if it is supported."
  []
  (let [configured        (configured-engine)
        potential-engines (cond->> default-engine-precedence
                            configured (cons configured))]
    ;; Drop engines that are not yet registered: the search-engine setting can be read before
    ;; metabase.search.init loads the engine implementations, and supported-engine? throws on unknown engines.
    (distinct (filter supported-engine? (filter known-engine? potential-engines)))))

(defn additional-engines
  "The supported engines force-enabled by [[settings/additional-search-engines]]."
  []
  (->> (settings/additional-search-engines)
       (map str/trim)
       (remove str/blank?)
       (keep validated-engine)
       (filter supported-engine?)))

(defmulti disjunction
  "Given multiple terms to search for, reduce this to a search expression that matches any of them in a single search.
   If this is not possible, return a list of terms to be searched for separately."
  {:arglists '([search-engine terms])}
  (fn [search-engine _terms] search-engine))

(defn default-engine
  "The engine that serves requests with no explicit engine argument.
  The configured override when supported, otherwise the first supported engine in the precedence."
  []
  (let [configured (configured-engine)
        default    (first (supported-engines))]
    (when (and configured (not= configured default))
      (warn-once! [:unsupported configured]
                  (format "Configured search engine %s is not supported on this instance, using %s instead"
                          configured default)))
    default))

(defn log-resolution!
  "Log the engine that serves search."
  []
  (log/infof "Search will be served by the %s engine" (default-engine)))

(defn active-engines
  "The engines for which we maintain an index, default engine first.
  The default engine and any [[settings/additional-search-engines]], plus their supported [[dependencies]].
  Excludes :search.engine/in-place, which does not use an index."
  []
  (if-let [default (default-engine)]
    (->> (concat [default] (additional-engines))
         (mapcat #(cons % (filter supported-engine? (filter known-engine? (dependencies %)))))
         distinct
         (remove #{:search.engine/in-place}))
    []))

(defn engine-status
  "Whether the engine can serve queries, and if not, why: :ok, :unknown, :unsupported, or :inactive.
  In-place needs no index, so it serves whenever supported; other engines must be in [[active-engines]].
  Membership is exact: callers must resolve engine aliases before asking."
  [engine]
  (cond
    (not (known-engine? engine))            :unknown
    (not (supported-engine? engine))        :unsupported
    (or (= engine :search.engine/in-place)
        (contains? (set (active-engines)) engine)) :ok
    :else                                   :inactive))

(defn fallback-engine
  "The engine to mix results with and fall back to when `engine` cannot serve alone.
  Prefers engines with a maintained index over merely supported ones."
  [engine]
  (u/seek #(not= engine %) (concat (active-engines) (supported-engines))))

(defmethod disjunction :default [_ terms] terms)

(defmethod disjunction nil [_ terms]
  (disjunction (default-engine) terms))

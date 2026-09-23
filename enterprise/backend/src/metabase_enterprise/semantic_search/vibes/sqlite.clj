(ns metabase-enterprise.semantic-search.vibes.sqlite
  "The `vibes` SQLite functions and the `RERANK BASED ON VIBES` connection hook.

      vibes(prompt, candidate_id, roster_json) -> REAL   P(candidate matches prompt), batched: one Jev call per
                                                         distinct (prompt, roster), then a lookup per row
      vibes(prompt, candidate_text)            -> REAL   pointwise, one Jev call per distinct (prompt, text)
      vibes_info()                             -> TEXT   JSON: enabled flag, model, cache stats
      vibes_rewrite(sql)                       -> TEXT   the rewritten statement (debugging)

  `roster_json` is a JSON object keyed by candidate id. Every failure (disabled, no key, Jev down, malformed roster,
  id not answered) is NULL, never an error, so `ORDER BY vibes(...) DESC, distance` degrades to vector order.

  Everything is per-connection: [[install!]] registers the functions on a raw sqlite-jdbc connection and returns it
  wrapped so statements ending in `RERANK BASED ON VIBES` are rewritten (see `vibes.rewrite`)."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.semantic-search.db.sqlite-functions :as sqlite-functions]
   [metabase-enterprise.semantic-search.vibes.jev :as jev]
   [metabase-enterprise.semantic-search.vibes.prompt :as prompt]
   [metabase-enterprise.semantic-search.vibes.rewrite :as rewrite]
   [metabase-enterprise.semantic-search.vibes.settings :as vibes.settings]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (java.lang.reflect InvocationHandler InvocationTargetException Method Proxy)
   (java.security MessageDigest)
   (java.sql Connection PreparedStatement Statement)
   (org.sqlite SQLiteConnection)))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------------- Cache -----------------------------------------------------

(def ^:private ttl-ms
  "How long a scored roster stays valid."
  (* 5 60 1000))

(def ^:private failure-ttl-ms
  "How long a failed scoring (nil) is remembered, so the rows of one statement -- and immediate retries -- don't each
  wait out the Jev timeout."
  (* 30 1000))

(def ^:private max-entries 256)

(defonce ^:private cache
  ;; {:entries {key {:scores {id noul}|nil, :at ms}}, :stats {:hits n :misses n :calls n}}
  (atom {:entries {} :stats {:hits 0 :misses 0 :calls 0}}))

(defn reset-cache!
  "Forget every cached score and zero the stats."
  []
  (reset! cache {:entries {} :stats {:hits 0 :misses 0 :calls 0}}))

(defn- now-ms
  ;; not primitive-hinted: tests redefine it
  []
  (System/currentTimeMillis))

(defn- sha1 ^String [^String s]
  (let [digest (.digest (MessageDigest/getInstance "SHA-1") (.getBytes s "UTF-8"))]
    (str/join (map #(format "%02x" %) digest))))

(defn- cache-key [model prompt roster-json]
  [model prompt/question-version (sha1 prompt) (sha1 roster-json)])

(defn- live?
  [{:keys [scores at]} now]
  (< (- now at) (if (nil? scores) failure-ttl-ms ttl-ms)))

(defn- evict
  "`entries` without expired ones, and without the oldest when still at capacity."
  [entries now]
  (let [entries (into {} (filter #(live? (val %) now)) entries)]
    (if (< (count entries) max-entries)
      entries
      (dissoc entries (key (apply min-key #(:at (val %)) entries))))))

(defn- cached-scores
  "`[found? scores]` for `k`."
  [k]
  (let [now   (now-ms)
        entry (get-in @cache [:entries k])]
    (if (and entry (live? entry now))
      (do (swap! cache update-in [:stats :hits] inc)
          [true (:scores entry)])
      (do (swap! cache update-in [:stats :misses] inc)
          [false nil]))))

(defn- remember! [k scores]
  (let [now (now-ms)]
    (swap! cache (fn [c]
                   (-> c
                       (update :entries evict now)
                       (assoc-in [:entries k] {:scores scores :at now}))))
    scores))

;;; ---------------------------------------------------- Scoring ----------------------------------------------------

(defn- jev-opts []
  {:url        (vibes.settings/vibes-api-url)
   :api-key    (vibes.settings/vibes-api-key)
   :model      (vibes.settings/vibes-model)
   :timeout-ms (vibes.settings/vibes-timeout-ms)})

(defn- parse-roster
  "The roster as `{id-string candidate-map}`, or nil (with a warning) when it isn't a JSON object of objects."
  [roster-json]
  (let [roster (try
                 (json/decode roster-json)
                 (catch Exception _ ::malformed))]
    (if (and (map? roster) (every? map? (vals roster)))
      roster
      (do (log/warnf "vibes: roster is not a JSON object of candidates (%s)"
                     (subs (str roster-json) 0 (min 80 (count (str roster-json)))))
          nil))))

(defn score-roster
  "`{id-string noul}` for the candidates of `roster-json` against `prompt`, from the cache or one Jev call; nil when
  vibes are disabled or scoring failed."
  [prompt roster-json]
  (when (and (vibes.settings/vibes-enabled) (string? prompt) (string? roster-json))
    (let [{:keys [model] :as opts} (jev-opts)
          k (cache-key model prompt roster-json)
          [found? scores] (cached-scores k)]
      (if found?
        scores
        (do (swap! cache update-in [:stats :calls] inc)
            (remember! k (some-> (parse-roster roster-json)
                                 (as-> roster (jev/score-candidates! prompt roster opts)))))))))

(defn- id-key
  "Roster keys are JSON object keys, i.e. strings; an INTEGER id argument must match `\"12\"`."
  [id]
  (cond
    (nil? id)    nil
    (number? id) (str (long id))
    :else        (str id)))

(defn vibes
  "The `vibes` scalar: `(prompt id roster-json)` batched, or `(prompt text)` pointwise. Never throws."
  ([prompt text]
   (when (some? text)
     (vibes prompt "0" (json/encode {"0" {"text" (str text)}}))))
  ([prompt id roster-json]
   (try
     (when (some? id)
       (some-> (score-roster prompt roster-json)
               (get (id-key id))))
     (catch Throwable t
       (log/warn t "vibes: scoring failed")
       nil))))

(defn info
  "Enabled flag, model and cache stats, as a map."
  []
  (let [{:keys [entries stats]} @cache]
    (merge {:enabled (boolean (vibes.settings/vibes-enabled))
            :model   (vibes.settings/vibes-model)
            :version prompt/question-version
            :entries (count entries)}
           stats)))

;;; ----------------------------------------------- Connection hook ------------------------------------------------

(defn- column-labels
  "The output column labels of `select`, by preparing it (no execution) on `conn`."
  [^Connection conn ^String select]
  (with-open [ps (.prepareStatement conn select)]
    (let [md (.getMetaData ps)]
      (mapv #(.getColumnLabel md (int %)) (range 1 (inc (.getColumnCount md)))))))

(defn rewrite
  "`sql` with a trailing `RERANK BASED ON VIBES` clause rewritten (column labels resolved on `conn`), or `sql`
  itself when it has none."
  [^Connection conn sql]
  (if (rewrite/candidate? sql)
    (or (rewrite/rewrite-rerank sql (partial column-labels conn)) sql)
    sql))

(defn- invoke-target
  "Call `method` on `target`, rethrowing what it throws rather than the reflective wrapper."
  [target ^Method method args]
  (try
    (.invoke method target args)
    (catch InvocationTargetException e
      (throw (.getCause e)))))

(defn- jdbc-proxy
  "An `iface` proxy over `target` whose calls go to `(handle target method args)`."
  [^Class iface target handle]
  (Proxy/newProxyInstance
   (.getClassLoader iface)
   (into-array Class [iface])
   (reify InvocationHandler
     (invoke [_ _ method args]
       (handle target method args)))))

(defn- rewrite-first-arg
  "`args` with a leading SQL string rewritten."
  [conn ^objects args]
  (if (and args (pos? (alength args)) (string? (aget args 0)))
    (doto (aclone args) (aset 0 (rewrite conn (aget args 0))))
    args))

(def ^:private statement-sql-methods
  #{"execute" "executeQuery" "executeUpdate" "executeLargeUpdate" "addBatch"})

(defn- wrap-statement [conn ^Class iface stmt]
  (jdbc-proxy iface stmt
              (fn [target ^Method method args]
                (invoke-target target method
                               (if (statement-sql-methods (.getName method))
                                 (rewrite-first-arg conn args)
                                 args)))))

(defn wrap-connection
  "`conn` behind a `java.sql.Connection` proxy that rewrites statements ending in `RERANK BASED ON VIBES` before
  they are prepared or executed. Rewriting prepares the select once more on `conn` to read its column labels."
  ^Connection [^Connection conn]
  (jdbc-proxy Connection conn
              (fn [target ^Method method args]
                (case (.getName method)
                  "prepareStatement" (wrap-statement conn PreparedStatement
                                                     (invoke-target target method (rewrite-first-arg conn args)))
                  "createStatement"  (wrap-statement conn Statement (invoke-target target method args))
                  (invoke-target target method args)))))

(defn register-vibes!
  "Register `vibes`, `vibes_info` and `vibes_rewrite` on `conn`, a raw sqlite-jdbc connection."
  [^Connection conn]
  (sqlite-functions/register! conn "vibes" vibes)
  (sqlite-functions/register! conn "vibes_info" #(json/encode (info)))
  (sqlite-functions/register! conn "vibes_rewrite" (fn [sql]
                                                     (when sql
                                                       (try
                                                         (rewrite conn (str sql))
                                                         (catch Exception e
                                                           (str "ERROR: " (ex-message e))))))))

(defn install!
  "Register functions on the underlying SQLite connection, then wrap `conn` for rewriting. Keep any pool wrapper
  so closing the returned connection returns it to its pool rather than closing the physical connection."
  ^Connection [^Connection conn]
  (register-vibes! (.unwrap conn SQLiteConnection))
  (wrap-connection conn))

(defenterprise install-vibes-if-enabled!
  "Enable vibes SQL on any SQLite warehouse when `vibes-enabled` / `MB_VIBES_ENABLED` is true."
  :feature :none
  [conn]
  (if (vibes.settings/vibes-enabled)
    (install! conn)
    conn))

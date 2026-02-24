(ns hooks.metabase.release-flags.models
  (:require
   [clj-kondo.hooks-api :as api]
   [clojure.string :as str]))

(defn- read-release-flags
  "Reads release-flags.json and returns the set of top-level flag name strings."
  []
  (try
    (let [content (slurp "release-flags.json")]
      ;; Extract top-level keys from JSON. Keys are quoted strings before a colon.
      ;; This is a simple approach that avoids needing a JSON parser.
      (-> (into #{}
                (map second)
                (re-seq #"\"([^\"]+)\"\s*:" content))
          (disj "description" "startDate")))
    (catch Exception _
      #{})))

(def ^:private valid-flags
  "Cached set of valid release flag names from release-flags.json."
  (delay (read-release-flags)))

(defn- keyword->flag-name
  "Converts a keyword to its full string representation, including namespace if present.
   :foo => \"foo\", :ns/foo => \"ns/foo\""
  [kw]
  (if (namespace kw)
    (str (namespace kw) "/" (name kw))
    (name kw)))

(defn- check-flag-name
  "Checks if a flag name is in the valid set and registers a finding if not."
  [flag-name flag-node]
  (let [flags @valid-flags]
    (when (and (seq flags) (not (contains? flags flag-name)))
      (api/reg-finding! (assoc (meta flag-node)
                               :message (str "Unknown release flag: " flag-name
                                             ". Valid flags: " (str/join ", " (sort flags)))
                               :type :metabase/unknown-release-flag)))))

(defn- check-flag-arg
  "Shared lint check for a flag argument node. Warns if not a literal keyword/string
   or if the flag is not in release-flags.json."
  [flag-node]
  (cond
    (api/keyword-node? flag-node)
    (check-flag-name (keyword->flag-name (api/sexpr flag-node)) flag-node)

    (api/string-node? flag-node)
    (check-flag-name (api/sexpr flag-node) flag-node)

    :else
    (api/reg-finding! (assoc (meta flag-node)
                             :message "Release flag should be a literal keyword or string, not a variable."
                             :type :metabase/non-literal-release-flag))))

(defn has-release-flag?
  "Lint hook for metabase.release-flags.models/has-release-flag?."
  [{:keys [node]}]
  (let [[_ flag-node] (:children node)]
    (check-flag-arg flag-node)))

(defn guard-namespace!
  "Lint hook for metabase.release-flags.guard/guard-namespace!."
  [{:keys [node]}]
  (let [[_ flag-node] (:children node)]
    (check-flag-arg flag-node)))

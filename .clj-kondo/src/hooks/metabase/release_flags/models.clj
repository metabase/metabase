(ns hooks.metabase.release-flags.models
  (:require
   [clj-kondo.hooks-api :as api]
   [clojure.string :as str]))

(defn- keyword->flag-name
  "Converts a keyword to its full string representation, including namespace if present.
   :foo => \"foo\", :ns/foo => \"ns/foo\""
  [kw]
  (if (namespace kw)
    (str (namespace kw) "/" (name kw))
    (name kw)))

(defn- check-flag-name
  "Checks if a flag name is in the valid set and registers a finding if not."
  [valid-flags flag-name flag-node]
  (when (and (seq valid-flags) (not (contains? valid-flags flag-name)))
    (api/reg-finding! (assoc (meta flag-node)
                             :message (str "Unknown release flag: " flag-name
                                           ". Valid flags: " (str/join ", " (sort valid-flags)))
                             :type :metabase/unknown-release-flag))))

(defn- check-flag-arg
  "Shared lint check for a flag argument node. Warns if not a literal keyword/string
   or if the flag is not in release-flags.json."
  [valid-flags flag-node]
  (cond
    (api/keyword-node? flag-node)
    (check-flag-name valid-flags (keyword->flag-name (api/sexpr flag-node)) flag-node)

    (api/string-node? flag-node)
    (check-flag-name valid-flags (api/sexpr flag-node) flag-node)

    :else
    (api/reg-finding! (assoc (meta flag-node)
                             :message "Release flag should be a literal keyword or string, not a variable."
                             :type :metabase/non-literal-release-flag))))

(defn- get-valid-flags
  "Reads the valid release flag names from the kondo config.
   Loaded from .clj-kondo/config/release-flags/config.edn via :config-paths."
  [config]
  (set (keys (get config :metabase/release-flags {}))))

(defn has-release-flag?
  "Lint hook for metabase.release-flags.models/has-release-flag?."
  [{:keys [node config]}]
  (let [[_ flag-node] (:children node)]
    (check-flag-arg (get-valid-flags config) flag-node)))

(defn guard-namespace!
  "Lint hook for metabase.release-flags.guard/guard-namespace!."
  [{:keys [node config]}]
  (let [[_ flag-node] (:children node)]
    (check-flag-arg (get-valid-flags config) flag-node)))

(defn bypass-guard-fixture
  "Lint hook for metabase.release-flags.guard/bypass-guard-fixture."
  [{:keys [node config]}]
  (let [valid-flags (get-valid-flags config)]
    (doseq [flag-node (rest (:children node))]
      (check-flag-arg valid-flags flag-node))))

(ns mage.bot.server-info
  "Discover and print server configuration for bot agents.
   Finds MB_CONFIG_FILE_PATH from env, mise.local.toml, or .lein-env,
   then prints the config YAML along with port/connection info."
  (:require
   [clojure.edn :as edn]
   [clojure.string :as str]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn- read-mise-local-toml
  "Parse mise.local.toml and return a map of env var name -> value."
  []
  (let [path (str u/project-root-directory "/mise.local.toml")]
    (when (.exists (java.io.File. ^String path))
      (let [lines (str/split-lines (slurp path))]
        (into {}
              (keep (fn [line]
                      (when-let [[_ k v] (re-matches #"(\w+)\s*=\s*\"(.*)\"" (str/trim line))]
                        [k v])))
              lines)))))

(defn- read-lein-env
  "Parse .lein-env (EDN map with keyword keys) and return a map of env var name -> value."
  []
  (let [path (str u/project-root-directory "/.lein-env")]
    (when (.exists (java.io.File. ^String path))
      (try
        (let [m (edn/read-string (slurp path))]
          (into {}
                (map (fn [[k v]]
                       [(-> (name k)
                            (str/replace "-" "_")
                            str/upper-case)
                        (str v)]))
                m))
        (catch Exception _e nil)))))

(defn- read-dot-env
  "Parse .env file and return a map of env var name -> value."
  []
  (let [path (str u/project-root-directory "/.env")]
    (when (.exists (java.io.File. ^String path))
      (let [lines (str/split-lines (slurp path))]
        (into {}
              (keep (fn [line]
                      (let [trimmed (str/trim line)]
                        (when (and (seq trimmed)
                                   (not (str/starts-with? trimmed "#")))
                          (when-let [[_ k v] (re-matches #"(\w+)\s*=\s*(.*)" trimmed)]
                            [k v])))))
              lines)))))

(defn- resolve-env
  "Resolve all environment variables from all sources, with priority:
   system env > mise.local.toml > .env > .lein-env.
   Returns a map of all resolved vars."
  [mise-map lein-map]
  (let [dot-env-map (or (read-dot-env) {})
        ;; Collect all known keys from all sources
        all-keys    (into (sorted-set)
                          (concat (keys mise-map)
                                  (keys dot-env-map)
                                  (keys lein-map)))]
    ;; For each key, resolve with priority: system env > mise > .env > lein
    (into (sorted-map)
          (keep (fn [k]
                  (when-let [v (or (u/env k (constantly nil))
                                   (get mise-map k)
                                   (get dot-env-map k)
                                   (get lein-map k))]
                    [k v])))
          all-keys)))

(defn- find-config-file-path
  "Find MB_CONFIG_FILE_PATH from resolved env."
  [resolved-env]
  (get resolved-env "MB_CONFIG_FILE_PATH"))

(defn server-info!
  "Print server configuration for bot agents."
  [& _]
  (let [mise-map     (or (read-mise-local-toml) {})
        lein-map     (or (read-lein-env) {})
        resolved     (resolve-env mise-map lein-map)
        config-path  (find-config-file-path resolved)]

    ;; MB_* environment variables section
    (println "## Environment Variables")
    (println)
    (let [mb-vars (filter (fn [[k _]] (str/starts-with? k "MB_")) resolved)]
      (if (seq mb-vars)
        (doseq [[k v] (sort-by first mb-vars)]
          (println (str k "=" v)))
        (println "No MB_* variables found.")))
    (println)

    ;; Other useful variables
    (println "## Other Variables")
    (println)
    (doseq [var-name ["NREPL_PORT" "SOCKET_REPL_PORT" "LINEAR_API_KEY"
                      "METASTORE_DEV_SERVER_URL" "DISABLE_BUILD_NOTIFICATIONS"]]
      (when-let [v (get resolved var-name)]
        (let [display-v (if (= var-name "LINEAR_API_KEY")
                          (str (subs v 0 (min 12 (count v))) "...")
                          v)]
          (println (str var-name "=" display-v)))))
    (println)

    ;; Source info
    (println "## Sources")
    (println)
    (cond
      (seq mise-map) (println "Primary: mise.local.toml")
      (seq lein-map) (println "Primary: .lein-env")
      :else          (println "Primary: system environment only"))
    (when (.exists (java.io.File. ^String (str u/project-root-directory "/.env")))
      (println "Also loaded: .env"))
    (when (seq lein-map)
      (println "Also loaded: .lein-env"))
    (println)

    ;; Config file section
    (println "## Instance Configuration")
    (println)
    (if config-path
      (let [config-file (java.io.File. ^String config-path)]
        (if (.exists config-file)
          (do
            (println (str "Config file: " config-path))
            (println)
            (println (slurp config-file)))
          (do
            (println (str "Config file path set but file does not exist: " config-path))
            (println "The instance may not have pre-configured users. Check /api/setup to see if initial setup is needed."))))
      ;; MB_CONFIG_FILE_PATH not set — look for config files in well-known locations
      (let [candidates [(str u/project-root-directory "/metabase.config.yml")
                        (str u/project-root-directory "/local/config.yml")]
            found      (first (filter #(.exists (java.io.File. ^String %)) candidates))]
        (if found
          (do
            (println (str "Config file (auto-discovered): " found))
            (println)
            (println (slurp found)))
          (do
            (println "No config file found.")
            (println "MB_CONFIG_FILE_PATH is not set, and no config file exists at:")
            (doseq [c candidates]
              (println (str "  " c)))
            (println)
            (println "You may need to check /api/setup or /api/session to determine the instance state.")))))))

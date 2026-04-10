(ns mage.bot.server-info
  "Discover and print server configuration for bot agents.
   Finds MB_CONFIG_FILE_PATH from env, mise.local.toml, or .lein-env,
   then prints the config YAML along with port/connection info."
  (:require
   [clojure.string :as str]
   [mage.nvoxland.env :as bot-env]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn server-info!
  "Print server configuration for bot agents."
  [& _]
  (let [resolved     (bot-env/resolve-all)
        config-path  (get resolved "MB_CONFIG_FILE_PATH")]

    ;; Git branch
    (println "## Git Branch")
    (println)
    (let [{:keys [exit out]} (shell/sh* {:quiet? true} "git" "branch" "--show-current")]
      (if (zero? exit)
        (println (str/trim (str/join "" out)))
        (println "unknown")))
    (println)

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
    (doseq [var-name ["LINEAR_API_KEY" "METASTORE_DEV_SERVER_URL"]]
      (when-let [v (get resolved var-name)]
        (let [display-v (if (= var-name "LINEAR_API_KEY")
                          (str (subs v 0 (min 12 (count v))) "...")
                          v)]
          (println (str var-name "=" display-v)))))
    (println)

    ;; nREPL discovery
    (println "## nREPL Servers")
    (println)
    (let [{:keys [exit out]} (shell/sh* {:quiet? true} "clj-nrepl-eval" "--discover-ports")
          lines (when (zero? exit) (remove str/blank? out))]
      (if (seq lines)
        (doseq [line lines]
          (println line))
        (println "NONE")))
    (println)

    ;; Source info
    (println "## Sources")
    (println)
    (let [has-mise? (seq (bot-env/read-mise-local-toml))
          has-lein? (seq (bot-env/read-lein-env))]
      (cond
        has-mise? (println "Primary: mise.local.toml")
        has-lein? (println "Primary: .lein-env")
        :else     (println "Primary: system environment only"))
      (when (.exists (java.io.File. ^String (str u/project-root-directory "/.env")))
        (println "Also loaded: .env"))
      (when has-lein?
        (println "Also loaded: .lein-env")))
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

(ns mage.bot.server-info
  "Discover and print server configuration for bot agents.
   Finds MB_CONFIG_FILE_PATH from env, mise.local.toml, or .lein-env,
   then prints the config YAML along with port/connection info.
   In PR-env mode (when .bot/pr-env.env exists), prints remote info instead."
  (:require
   [clojure.string :as str]
   [mage.bot.env :as bot-env]
   [mage.bot.pr-env :as pr-env]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn- print-git-branch []
  (println "## Git Branch")
  (println)
  (let [{:keys [exit out]} (shell/sh* {:quiet? true} "git" "branch" "--show-current")]
    (if (zero? exit)
      (println (str/trim (str/join "" out)))
      (println "unknown")))
  (println))

(defn- print-pr-env-info! []
  (let [env     (pr-env/load-pr-env)
        token   (pr-env/session-token)]
    (print-git-branch)

    (println "## Remote PR Environment")
    (println)
    (println "MODE=pr-env")
    (println (str "BASE_URL=" (get env "BASE_URL")))
    (println (str "PR_NUM=" (get env "PR_NUM")))
    (println (str "USERNAME=" (get env "USERNAME")))
    (println "SESSION_FILE=.bot/pr-env-session.txt")
    (println (str "SESSION_TOKEN_PRESENT=" (if token "yes" "no")))
    (println)
    (println "API calls via `./bin/mage -bot-api-call` transparently target BASE_URL")
    (println "using the cached session token — no code changes needed.")
    (println)

    (println "## REPL Access")
    (println)
    (println "NREPL_PORT=NONE")
    (println (str "SOCKET_REPL_HOST=" (get env "REPL_HOST")))
    (println (str "SOCKET_REPL_PORT=" (get env "REPL_PORT")))
    (println (str "SOCKET_REPL_USAGE=echo '(+ 1 2)' | nc -q 1 "
                  (get env "REPL_HOST") " " (get env "REPL_PORT")))
    (println)
    (println "Remote PR envs expose a socket REPL, not nREPL. `clj-nrepl-eval`")
    (println "will NOT work here. Send ONE form per connection via `nc`. Wrap")
    (println "multi-form work in `(do ...)`.")
    (println)

    (println "## Network")
    (println)
    (println "PR preview environments are only reachable via the Metabase Tailscale")
    (println "network. If API calls, Playwright navigation, or `nc` hang or time out,")
    (println "the most likely cause is a missing Tailscale connection.")
    (println)))

(defn- server-info-local!
  "Local-dev server info output. Unchanged from the pre-PR-env behavior."
  []
  (let [resolved     (bot-env/resolve-all)
        config-path  (get resolved "MB_CONFIG_FILE_PATH")]
    (print-git-branch)

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

    ;; nREPL discovery — try clj-nrepl-eval first, fall back to reading
    ;; .nrepl-port directly (which Metabase's dev REPL writes on startup).
    (println "## nREPL Servers")
    (println)
    (let [{:keys [exit out]} (shell/sh* {:quiet? true} "clj-nrepl-eval" "--discover-ports")
          port-from-cmd  (when (zero? exit)
                           (some (fn [line]
                                   (when-let [m (re-find #"localhost:(\d+)" line)]
                                     (second m)))
                                 out))
          port-from-file (when-not port-from-cmd
                           (let [f (java.io.File. ^String (System/getProperty "user.dir") ".nrepl-port")]
                             (when (.exists f)
                               (str/trim (slurp f)))))]
      (cond
        port-from-cmd  (println (str "NREPL_PORT=" port-from-cmd))
        port-from-file (println (str "NREPL_PORT=" port-from-file))
        :else          (println "NREPL_PORT=NONE")))
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

(defn server-info!
  "Print server configuration for bot agents.
   Selects between local-dev and remote PR-env output based on whether
   .bot/pr-env.env exists in the current worktree."
  [& _]
  (if (pr-env/pr-env-active?)
    (print-pr-env-info!)
    (server-info-local!)))

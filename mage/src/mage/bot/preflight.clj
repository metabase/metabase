(ns mage.bot.preflight
  "Composable preflight checks shared across bot types."
  (:require
   [clojure.string :as str]
   [mage.bot.env :as bot-env]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn check-mise!
  "Check that mise is installed and activated in the current shell (so that
   managed tools like clj, bun, bb resolve on PATH without a `mise x --` prefix).
   Exits on failure."
  []
  (when-not (u/can-run? "mise")
    (println (c/red "mise is not installed."))
    (println "Install it: https://mise.jdx.dev/getting-started.html")
    (u/exit 1))
  (let [needed  ["clj" "bun" "bb"]
        missing (binding [u/*skip-warning* true]
                  (doall (remove u/can-run? needed)))]
    (when (seq missing)
      (println (c/red "mise does not appear to be activated in this shell."))
      (println (c/red (str "Not on PATH: " (str/join ", " missing))))
      (println)
      (println "Activate mise in your shell profile, for example:")
      (println "  eval \"$(mise activate zsh)\"    # zsh")
      (println "  eval \"$(mise activate bash)\"   # bash")
      (println "Then re-run in a shell where mise is active.")
      (u/exit 1))))

(defn check-workmux!
  "Check that workmux is installed. Exits on failure."
  []
  (when-not (u/can-run? "workmux")
    (println (c/red "workmux is not installed."))
    (println)
    (println "Install workmux:")
    (println "  cargo install workmux")
    (println "  or see: https://github.com/pghk/workmux")
    (u/exit 1)))

(defn check-nrepl!
  "Check that clj-nrepl-eval is installed. Exits on failure."
  []
  (when-not (u/can-run? "clj-nrepl-eval")
    (println (c/red "clj-nrepl-eval is not installed."))
    (println "  cargo install clj-nrepl-eval")
    (u/exit 1)))

(defn check-docker!
  "Check that Docker is installed and running. Exits on failure."
  []
  (when-not (u/can-run? "docker")
    (println (c/red "Docker is not installed."))
    (u/exit 1))
  (let [{:keys [exit]} (shell/sh* {:quiet? true} "docker" "info")]
    (when-not (zero? exit)
      (println (c/red "Docker daemon is not running. Please start Docker."))
      (u/exit 1))))

(defn check-tmux-status!
  "Warn if not inside a tmux session."
  []
  (when (str/blank? (u/env "TMUX" (constantly nil)))
    (println (c/yellow "Not inside a tmux session — one will be created automatically."))))

(defn check-linear-api-key!
  "Check LINEAR_API_KEY env var.
   mode :required — exits on failure.
   mode :optional — warns and returns false if missing, true if present."
  [mode]
  (let [key (u/env "LINEAR_API_KEY" (constantly nil))]
    (if (str/blank? key)
      (if (= mode :required)
        (do
          (println (c/red "LINEAR_API_KEY environment variable is not set."))
          (println)
          (println "To get a Linear API key:")
          (println "  1. Go to https://linear.app/metabase/settings/account/security/api-keys/new")
          (println "  2. Create a personal API key")
          (println "  3. Export it: export LINEAR_API_KEY=lin_api_...")
          (u/exit 1))
        (do
          (println (c/yellow "LINEAR_API_KEY not set — Linear context will be skipped."))
          false))
      true)))

(defn check-ee-token!
  "Check MB_PREMIUM_EMBEDDING_TOKEN env var. Exits on failure."
  []
  (when (str/blank? (u/env "MB_PREMIUM_EMBEDDING_TOKEN" (constantly nil)))
    (println (c/red "MB_PREMIUM_EMBEDDING_TOKEN environment variable is not set."))
    (println)
    (println "This token is required to run the Enterprise Edition.")
    (println "Set it in your shell profile or export it before running.")
    (u/exit 1)))

(defn check-playwright!
  "Check that Playwright MCP is available via npx. Exits on failure."
  []
  (when-not (u/can-run? "npx")
    (println (c/red "npx is not available. Install Node.js."))
    (u/exit 1))
  (let [{:keys [exit]} (shell/sh* {:quiet? true} "npx" "-y" "@playwright/mcp" "--version")]
    (when-not (zero? exit)
      (println (c/red "@playwright/mcp is not available."))
      (println)
      (println "It should auto-install via npx. Check your npm/node setup.")
      (u/exit 1))))

(defn check-node-modules!
  "Ensure node_modules exists. Auto-installs via bun if missing."
  []
  (when-not (.isDirectory (java.io.File. ^String (str u/project-root-directory "/node_modules")))
    (println (c/yellow "node_modules not found — running bun install..."))
    (shell/sh {:dir u/project-root-directory} "bun" "install")))

(defn check-backend-health!
  "Check that the Metabase backend is responding on the given port.
   Retries every 10 seconds for up to 5 minutes to allow startup time.
   Exits on failure after timeout."
  [port]
  (let [url        (str "http://localhost:" port "/api/health")
        timeout-ms (* 5 60 1000)
        interval   10000
        start      (System/currentTimeMillis)]
    (loop []
      (let [{:keys [exit out]} (shell/sh* {:quiet? true}
                                          "curl" "-s" "-o" "/dev/null" "-w" "%{http_code}" url)
            healthy? (and (zero? exit) (= (str/trim (str/join out)) "200"))
            elapsed  (- (System/currentTimeMillis) start)]
        (cond
          healthy?
          (println (c/green (str "Backend healthy on port " port)))

          (>= elapsed timeout-ms)
          (do
            (println (c/red (str "Backend did not become healthy on port " port " after 5 minutes.")))
            (println "Check the backend logs for errors.")
            (u/exit 1))

          :else
          (do
            (println (c/yellow (str "Waiting for backend on port " port "... ("
                                    (int (/ elapsed 1000)) "s elapsed)")))
            (Thread/sleep interval)
            (recur)))))))

(defn preflight-health!
  "CLI entry point: wait for backend health, auto-discovering the port."
  [_parsed]
  (let [port (or (bot-env/resolve-env "MB_JETTY_PORT") "3000")]
    (check-backend-health! port)))

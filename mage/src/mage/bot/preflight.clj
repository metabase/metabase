(ns mage.bot.preflight
  "Composable preflight checks shared across bot types (fixbot, uxbot, qabot)."
  (:require
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

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

(defn check-pandoc!
  "Check that pandoc is installed. Exits on failure."
  []
  (when-not (u/can-run? "pandoc")
    (println (c/red "pandoc is not installed."))
    (println "  brew install pandoc")
    (u/exit 1)))

(defn check-weasyprint!
  "Check that weasyprint is installed. Exits on failure."
  []
  (when-not (u/can-run? "weasyprint")
    (println (c/red "weasyprint is not installed."))
    (println "  pip3 install weasyprint")
    (u/exit 1)))

(defn check-node-modules!
  "Ensure node_modules exists. Auto-installs via bun if missing."
  []
  (when-not (.isDirectory (java.io.File. ^String (str u/project-root-directory "/node_modules")))
    (println (c/yellow "node_modules not found — running bun install..."))
    (shell/sh {:dir u/project-root-directory} "bun" "install")))

(defn check-backend-health!
  "Check that the Metabase backend is responding on the given port. Exits on failure."
  [port]
  (let [{:keys [exit out]} (shell/sh* {:quiet? true}
                                      "curl" "-s" "-o" "/dev/null" "-w" "%{http_code}"
                                      (str "http://localhost:" port "/api/health"))]
    (when (or (not (zero? exit)) (not= (str/trim (str/join out)) "200"))
      (println (c/red (str "Backend is not responding on port " port ".")))
      (println "Start the backend before running qabot.")
      (u/exit 1))))

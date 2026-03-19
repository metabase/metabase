(ns mage.fixbot.preflight
  (:require
   [clojure.string :as str]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn preflight!
  "Check all prerequisites for the fixbot workflow. Exits with an error if any fail."
  [& _]
  (when-not (u/can-run? "workmux")
    (println (c/red "workmux is not installed."))
    (println)
    (println "Install workmux:")
    (println "  cargo install workmux")
    (println "  or see: https://github.com/pghk/workmux")
    (u/exit 1))
  (when-not (u/can-run? "mise")
    (println (c/red "mise is not installed."))
    (println)
    (println "Install mise:")
    (println "  curl https://mise.run | sh")
    (println "  or see: https://mise.jdx.dev/getting-started.html")
    (u/exit 1))
  (when-not (u/can-run? "docker")
    (println (c/red "Docker is not installed."))
    (u/exit 1))
  (let [{:keys [exit]} (shell/sh* {:quiet? true} "docker" "info")]
    (when-not (zero? exit)
      (println (c/red "Docker daemon is not running. Please start Docker."))
      (u/exit 1)))
  (when (str/blank? (u/env "TMUX" (constantly nil)))
    (println (c/yellow "Not inside a tmux session — one will be created automatically.")))
  (when (str/blank? (u/env "LINEAR_API_KEY" (constantly nil)))
    (println (c/red "LINEAR_API_KEY environment variable is not set."))
    (println)
    (println "To get a Linear API key:")
    (println "  1. Go to https://linear.app/metabase/settings/account/security/api-keys/new")
    (println "  2. Create a personal API key")
    (println "  3. Export it: export LINEAR_API_KEY=lin_api_...")
    (u/exit 1))
  (when (str/blank? (u/env "MB_PREMIUM_EMBEDDING_TOKEN" (constantly nil)))
    (println (c/red "MB_PREMIUM_EMBEDDING_TOKEN environment variable is not set."))
    (println)
    (println "This token is required to run the Enterprise Edition.")
    (println "Set it in your shell profile or export it before running fixbot.")
    (u/exit 1))
  ;; Ensure node_modules exists so worktree symlinks have a target
  (when-not (.isDirectory (java.io.File. ^String (str u/project-root-directory "/node_modules")))
    (println (c/yellow "node_modules not found — running bun install..."))
    (shell/sh {:dir u/project-root-directory} "bun" "install"))
  (println (c/green "All preflight checks passed.")))

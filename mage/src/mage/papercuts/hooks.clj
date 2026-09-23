(ns mage.papercuts.hooks
  "Opt-in installer for user-level Claude Code and Codex papercut scan hooks."
  (:require
   [babashka.fs :as fs]
   [babashka.json :as json]
   [clojure.string :as str]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private agents ["claude" "codex"])
(def ^:private events ["Stop" "SessionEnd"])

(defn selected-agents
  "Choose the requested agent, or every available agent when no option was given."
  [requested available]
  (let [available (set available)
        selected  (case requested
                    nil (filterv available agents)
                    "both" agents
                    [requested])]
    (when-not (seq selected)
      (throw (ex-info "Neither claude nor codex is installed on PATH." {})))
    (when-let [missing (first (remove available selected))]
      (throw (ex-info (str missing " is not installed on PATH.") {:agent missing})))
    selected))

(defn- shell-quote [s]
  (str "'" (str/replace s "'" "'\\''") "'"))

(defn- hook-command [source]
  (str "python3 "
       (shell-quote (str (fs/path u/project-root-directory "hackathon-2026-papercut" "session_scan_hook.py")))
       " " source))

(defn- ours? [handler]
  (str/includes? (str (get handler "command")) "hackathon-2026-papercut/session_scan_hook.py"))

(defn updated-config
  "Preserve other hooks and replace only this installer's handlers. Repeated installation is idempotent."
  [config source]
  (reduce
   (fn [config event]
     (let [groups    (get-in config ["hooks" event] [])
           preserved (into []
                           (keep (fn [group]
                                   (let [handlers (filterv (complement ours?) (get group "hooks" []))]
                                     (when (seq handlers) (assoc group "hooks" handlers)))))
                           groups)
           handler   {"type"    "command"
                      "command" (hook-command source)
                      "timeout" (if (and (= source "codex") (= event "SessionEnd")) 3 5)}]
       (assoc-in config ["hooks" event] (conj preserved {"hooks" [handler]}))))
   config
   events))

(defn- config-path [home source]
  (str (fs/path home (str "." source) (if (= source "codex") "hooks.json" "settings.json"))))

(defn- read-config [path]
  (if (fs/exists? path)
    (let [config (json/read-str (slurp path) {:key-fn identity})]
      (when-not (map? config)
        (throw (ex-info (str "Expected a JSON object in " path) {:path path})))
      config)
    {}))

(defn- link-target
  "The file `path` finally points at, following symlinks even when the last target doesn't exist yet."
  [path]
  (if (fs/sym-link? path)
    (let [target (fs/read-link path)]
      (recur (str (if (fs/absolute? target) target (fs/path (fs/parent path) target)))))
    (str path)))

(defn- write-config! [path config]
  ;; Moving over a symlink would replace the link, so a dotfile-managed config would stop being managed.
  (let [path (link-target path)
        _    (fs/create-dirs (fs/parent path))
        temp (fs/create-temp-file {:dir (fs/parent path)
                                   :prefix (str (fs/file-name path) ".tmp.")
                                   :posix-file-permissions "rw-------"})]
    (try
      (spit (str temp) (str (json/write-str config) "\n"))
      (when (fs/exists? path)
        (let [backup (fs/create-temp-file {:dir (fs/parent path)
                                           :prefix (str (fs/file-name path) ".bak.")
                                           :posix-file-permissions "rw-------"})]
          (spit (str backup) (slurp path))))
      (fs/move temp path {:replace-existing true :atomic-move true})
      (finally
        (when (fs/exists? temp) (fs/delete temp))))))

(defn install-at!
  "Install selected agents' global hooks under `home`. Public so tests can use a temporary home."
  [home selected]
  (doseq [source selected]
    (let [path   (config-path home source)
          before (read-config path)
          after  (updated-config before source)]
      (if (= before after)
        (println "Already installed:" path)
        (do (write-config! path after)
            (println "Installed" source "hooks in" path)))))
  selected)

(defn install!
  "Mage entry point. Merely running this task opts the user into automatic transcript scanning."
  [{:keys [options]}]
  (let [available (filterv fs/which agents)
        selected  (selected-agents (:agent options) available)]
    (println "Installing Stop and SessionEnd hooks for" (str/join ", " selected))
    (println "Future transcript chunks will be sent to TypeSafe Jev; flagged chunks go to the drill-down agent.")
    (println "Findings are submitted to the configured papercuts server. Scans run in the background.")
    (install-at! (fs/home) selected)
    (when (some #{"codex"} selected)
      (println "Codex may require trusting the new hooks with /hooks before they run."))
    (println "Hook scan log:" (fs/path u/project-root-directory "local" "papercuts" "hook-scan.log"))))

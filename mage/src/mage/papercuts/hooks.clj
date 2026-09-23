(ns mage.papercuts.hooks
  "Opt-in installer for user-level Claude Code and Codex papercut scan hooks."
  (:require
   [babashka.fs :as fs]
   [babashka.json :as json]
   [clojure.string :as str]
   [mage.papercuts.transcript :as transcript]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private agents ["claude" "codex"])
(def ^:private events ["Stop" "SessionEnd"])
(def default-server "https://metaouch.dev")

(defn normalize-server
  "Accept an HTTP(S) origin, optionally with a port. The scanner appends /api routes to it."
  [server]
  (let [server (str/trim (str server))
        uri    (try (java.net.URI. server)
                    (catch Exception _ nil))]
    (when-not (and uri
                   (#{"http" "https"} (some-> (.getScheme uri) str/lower-case))
                   (.getHost uri)
                   (nil? (.getUserInfo uri))
                   (or (= -1 (.getPort uri)) (<= 1 (.getPort uri) 65535))
                   (#{"" "/"} (.getPath uri))
                   (nil? (.getQuery uri))
                   (nil? (.getFragment uri)))
      (throw (ex-info (str "--server must be an HTTP(S) origin, optionally with a port: " server)
                      {:server server})))
    (str/replace server #"/+$" "")))

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

(defn- hook-command [source server]
  (str "python3 "
       (shell-quote (str (fs/path u/project-root-directory "hackathon-2026-papercut" "session_scan_hook.py")))
       " " source " --server " (shell-quote server)))

(defn- ours? [handler]
  (str/includes? (str (get handler "command")) "hackathon-2026-papercut/session_scan_hook.py"))

(defn updated-config
  "Preserve other hooks and replace only this installer's handlers. Repeated installation is idempotent."
  ([config source] (updated-config config source default-server))
  ([config source server]
   (let [server (normalize-server server)]
     (reduce
      (fn [config event]
        (let [groups    (get-in config ["hooks" event] [])
              preserved (into []
                              (keep (fn [group]
                                      (let [handlers (filterv (complement ours?) (get group "hooks" []))]
                                        (when (seq handlers) (assoc group "hooks" handlers)))))
                              groups)
              handler   {"type"    "command"
                         "command" (hook-command source server)
                         "timeout" (if (and (= source "codex") (= event "SessionEnd")) 3 5)}]
          (assoc-in config ["hooks" event] (conj preserved {"hooks" [handler]}))))
      config
      events))))

(defn- config-path [env home source]
  (str (fs/path (transcript/agent-dir env home source) (if (= source "codex") "hooks.json" "settings.json"))))

(defn- read-config [path]
  (if (fs/exists? path)
    (let [config (json/read-str (slurp path) {:key-fn identity})]
      (when-not (map? config)
        (throw (ex-info (str "Expected a JSON object in " path) {:path path})))
      config)
    {}))

(def ^:private max-link-hops
  "More links than this in a row is taken as a loop, as the OS does."
  40)

(defn- link-target
  "The file `path` finally points at, following symlinks even when the last target doesn't exist yet. Throws on a
  symlink loop."
  [path]
  (loop [path (str path) seen #{} hops 0]
    (cond
      (not (fs/sym-link? path)) path
      (or (seen path) (>= hops max-link-hops)) (throw (ex-info (str "Symlink loop at " path) {:path path}))
      :else
      (let [target (fs/read-link path)]
        ;; A relative target is relative to the link's real directory, which may itself sit behind a symlink. The
        ;; directory exists, since the link is in it; the final target may not.
        (recur (str (if (fs/absolute? target) target (fs/path (fs/real-path (fs/parent path)) target)))
               (conj seen path)
               (inc hops))))))

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
  "Install selected agents' global hooks under `home`, or where `env` points their config directories. Public so tests
  can use a temporary home."
  ([home selected] (install-at! {} home selected))
  ([env home selected] (install-at! env home selected default-server))
  ([env home selected server]
   (let [server (normalize-server server)]
     (doseq [source selected]
       (let [path   (config-path env home source)
             before (read-config path)
             after  (updated-config before source server)]
         (if (= before after)
           (println "Already installed:" path)
           (do (write-config! path after)
               (println "Installed" source "hooks in" path)))))
     selected)))

(defn install!
  "Mage entry point. Merely running this task opts the user into automatic transcript scanning."
  [{:keys [options]}]
  (let [available (filterv fs/which agents)
        selected  (selected-agents (:agent options) available)
        server    (normalize-server (or (:server options) default-server))]
    (println "Installing Stop and SessionEnd hooks for" (str/join ", " selected))
    (println "Papercuts server:" server)
    (println "Future transcript chunks will be sent to TypeSafe Jev; flagged chunks go to the drill-down agent.")
    (println "Findings are submitted to the configured papercuts server. Scans run in the background.")
    (install-at! (into {} (System/getenv)) (fs/home) selected server)
    (when (some #{"codex"} selected)
      (println "Codex may require trusting the new hooks with /hooks before they run."))
    (println "Hook scan log:" (fs/path u/project-root-directory "local" "papercuts" "hook-scan.log"))))

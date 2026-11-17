(ns mage.docs-preview
  "Preview the docs of a Metabase repo in a local metabase-dot-com checkout.

  The docs app of metabase-dot-com reads `METABASE_REPO_PATH` with Vite's `loadEnv`, where the process env wins
  over `apps/docs/.env`. So we pass the repo in the env, and leave the writer's `.env` as it is."
  (:require
   [babashka.fs :as fs]
   [babashka.http-client :as http]
   [babashka.process :as p]
   [clojure.java.browse :as browse]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u])
  (:import
   (java.net InetSocketAddress Socket)))

(set! *warn-on-reflection* true)

(def site-env-var
  "The env var with the path of the metabase-dot-com checkout."
  "METABASE_DOT_COM_DIR")

(def ^:private default-site-dir "~/metabase-dot-com")

;; `bun run dev` starts marketing on 4000, and the docs on 4321. Marketing proxies /docs/* to 4321 always, so if an
;; old docs server holds 4321, the new one moves to 4322 and the proxy shows the old docs with no error.
(def ^:private site-port 4000)
(def ^:private docs-port 4321)

(def ^:private preview-url (str "http://localhost:" site-port "/docs/latest/"))

(defn- fail! [message]
  (u/exit message 1))

(defn- resolve-dir
  "`dir` as a canonical path. A relative `dir` is relative to `root`, and `~` is the home dir."
  [root dir]
  (str (fs/canonicalize (fs/path root (fs/expand-home dir)))))

(defn site-dir
  "The metabase-dot-com checkout: the `--site` option, then the env var, then ~/metabase-dot-com."
  [root site-option env]
  (let [dir (resolve-dir root (or site-option (get env site-env-var) default-site-dir))]
    (when-not (fs/directory? (fs/path dir "apps" "docs"))
      (fail! (str "No metabase-dot-com checkout at " (c/yellow dir) ".\n"
                  "Give its path with " (c/green "--site DIR") ", or set " (c/green site-env-var)
                  " in your shell profile.")))
    dir))

(defn repo-dir
  "The Metabase repo with the docs: the argument, or `root`."
  [root repo-arg]
  (let [dir (resolve-dir root (or repo-arg "."))]
    (when-not (fs/directory? (fs/path dir "docs"))
      (fail! (str "No docs/ folder in " (c/yellow dir) ".\n"
                  "Give the path of a Metabase repo or worktree.")))
    dir))

(defn listening-host
  "The localhost address where a server listens on `port`, or nil. Astro can listen on IPv4 or IPv6 localhost, so we
  try both. The IPv6 address is in brackets, so it also goes in a URL."
  [port]
  (some (fn [^String host]
          (try
            (with-open [socket (Socket.)]
              (.connect socket (InetSocketAddress. host (int port)) 500)
              host)
            (catch Exception _ nil)))
        ["127.0.0.1" "[::1]"]))

(defn- listening? [port]
  (some? (listening-host port)))

(defn- stop-hint [site]
  (str "To stop background servers, run " (c/green "bunx astro dev stop") " in "
       site "/apps/docs and " site "/apps/marketing."))

(defn- check-ports! [site]
  (when-let [busy (seq (filter listening? [site-port docs-port]))]
    (fail! (str "Ports in use: " (str/join ", " busy) ". "
                "Stop the other dev server (for example, an old docs preview), then try again.\n"
                (stop-hint site)))))

(defn- check-bun! []
  (when-not (binding [u/*skip-warning* true] (u/can-run? "bun"))
    (fail! (str "You don't have " (c/yellow "bun") " installed. Install it from https://bun.sh"))))

(defn- branch [repo]
  (let [out (str/trim (:out (p/shell {:dir repo :out :string :err :string :continue true}
                                     "git" "branch" "--show-current")))]
    (if (str/blank? out) "(no branch)" out)))

(defn- open-when-ready
  "Opens the preview in the browser when the dev servers are up. Returns the future, to cancel it."
  []
  (future
    (if (loop [tries 180]
          (cond
            (every? listening? [site-port docs-port]) true
            (pos? tries)           (do (Thread/sleep 1000) (recur (dec tries)))
            :else                  false))
      (do
        ;; The first request renders the page, so the browser does not wait for it. Not to `localhost`: bb resolves
        ;; it to IPv4, but Node can listen on IPv6 only.
        (when-let [host (listening-host docs-port)]
          (try (http/get (str "http://" host ":" docs-port "/docs/latest/") {:throw false :timeout 120000})
               (catch Exception _ nil)))
        (try (browse/browse-url preview-url)
             (catch Exception _ (println "Open" (c/cyan preview-url)))))
      (println (c/yellow "The dev servers did not start in 3 minutes.")))))

(defn docs-preview!
  "Runs the metabase-dot-com dev server with the docs of a Metabase repo."
  [{:keys [arguments options]}]
  (let [root u/project-root-directory
        repo (repo-dir root (first arguments))
        site (site-dir root (:site options) (u/env))]
    (check-bun!)
    (check-ports! site)
    (println (c/magenta "Running: bun install") "in" site)
    (when-not (zero? (:exit (p/shell {:dir site :continue true} "bun" "install")))
      (fail! (str (c/yellow "bun install") " failed in " site ".")))
    (println)
    (println "Docs: " (c/green repo) (str "(" (branch repo) ")"))
    (println "Site: " (c/green site))
    (println "URL:  " (c/cyan preview-url))
    (println "Edits to the docs show in the browser immediately. Only /docs/latest/ pages are served. Ctrl-C stops.")
    (println)
    (let [opener (when-not (:no-open options) (open-when-ready))
          {:keys [exit]} (p/shell {:dir site :extra-env {"METABASE_REPO_PATH" repo} :continue true}
                                  "bun" "run" "dev")]
      ;; When an AI agent runs `astro dev`, Astro starts the server in the background and exits. Ctrl-C stops mage
      ;; itself, so we get here with the servers up only in that case.
      (if (and (zero? exit) (listening? docs-port))
        (do
          (println (c/yellow "The dev servers run in the background.") (stop-hint site))
          (some-> opener deref))
        (some-> opener future-cancel))
      (u/exit exit))))

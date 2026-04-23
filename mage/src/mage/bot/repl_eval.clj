(ns mage.bot.repl-eval
  "Unified REPL eval wrapper for bots.

   Tries nREPL first (via clj-nrepl-eval) and falls back to a plain Clojure
   socket REPL if nREPL isn't available. This means bots can use `-bot-repl-eval`
   uniformly in both local-dev mode (where nREPL and socket REPL are both
   available) and PR-env mode (where only a socket REPL is available on a
   remote host)."
  (:require
   [clojure.string :as str]
   [mage.bot.env :as bot-env]
   [mage.bot.pr-env :as pr-env]
   [mage.color :as c]
   [mage.shell :as shell]
   [mage.util :as u])
  (:import
   (java.io BufferedReader InputStreamReader PrintWriter)
   (java.net InetSocketAddress Socket SocketTimeoutException)))

(set! *warn-on-reflection* true)

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Cache file — .bot/repl.env in the current worktree
;;
;; The first call to `-bot-repl-eval` discovers the best available backend
;; and writes it here. Subsequent calls read from this file, skipping the
;; discovery shell-out entirely. If an eval fails with a connection error
;; (backend restarted, PR env went away, etc) we nuke the cache and retry
;; with fresh discovery once.

(defn- cache-file ^java.io.File []
  (let [dir (java.io.File. ^String (System/getProperty "user.dir") ".bot")]
    (.mkdirs dir)
    (java.io.File. dir "repl.env")))

(defn- read-cache
  "Read .bot/repl.env if it exists. Returns {:type ... :host ... :port ...} or nil."
  []
  (let [f (cache-file)]
    (when (.exists f)
      (let [lines (str/split-lines (slurp f))
            m     (into {}
                        (keep (fn [line]
                                (let [line (str/trim line)]
                                  (when (and (seq line)
                                             (not (str/starts-with? line "#"))
                                             (str/includes? line "="))
                                    (let [[k v] (str/split line #"=" 2)]
                                      [(str/trim k) (str/trim v)])))))
                        lines)]
        (when (and (get m "TYPE") (get m "PORT"))
          {:type (get m "TYPE")
           :host (get m "HOST")
           :port (get m "PORT")})))))

(defn- write-cache!
  "Cache a resolved {:type :host :port} to .bot/repl.env for subsequent calls."
  [{:keys [type host port]}]
  (spit (cache-file)
        (str "TYPE=" type "\n"
             "HOST=" host "\n"
             "PORT=" port "\n")))

(defn- clear-cache! []
  (let [f (cache-file)]
    (when (.exists f)
      (.delete f))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Discovery

(defn- discover-nrepl-port
  "Return an nREPL port number string if one is discoverable, else nil."
  []
  (let [user-cwd (System/getProperty "user.dir")
        {:keys [exit out]} (shell/sh* {:quiet? true :dir user-cwd}
                                      "clj-nrepl-eval" "--discover-ports")
        from-cmd (when (zero? exit)
                   (some (fn [line]
                           (when-let [m (re-find #"localhost:(\d+)" line)]
                             (second m)))
                         out))]
    (or from-cmd
        (let [f (java.io.File. ^String user-cwd ".nrepl-port")]
          (when (.exists f)
            (str/trim (slurp f)))))))

(defn- discover-socket-repl
  "Return {:host ... :port ...} for a socket REPL if one is discoverable,
   else nil. Prefers PR-env mode (remote) over local mode."
  []
  (if (pr-env/pr-env-active?)
    (let [env (pr-env/load-pr-env)]
      {:host (get env "REPL_HOST")
       :port (Integer/parseInt (get env "REPL_PORT"))})
    (when-let [port (bot-env/resolve-env "MB_SOCKET_REPL_PORT")]
      (try
        {:host "localhost" :port (Integer/parseInt port)}
        (catch NumberFormatException _ nil)))))

(defn- resolve-backend
  "Pick the best available REPL backend and return {:type :host :port} or nil.
   Auto-detect: nREPL first, socket REPL fallback."
  []
  (or (when-let [port (discover-nrepl-port)]
        {:type "nrepl" :host "localhost" :port port})
      (when-let [cfg (discover-socket-repl)]
        {:type "socket" :host (:host cfg) :port (str (:port cfg))})))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; nREPL backend (shells out to clj-nrepl-eval)

(defn- eval-via-nrepl!
  "Eval code against an nREPL server using the clj-nrepl-eval CLI.
   Returns exit code; prints output directly."
  [port code]
  (let [user-cwd (System/getProperty "user.dir")
        {:keys [exit out err]} (shell/sh* {:quiet? true :dir user-cwd}
                                          "clj-nrepl-eval" "-p" (str port) code)]
    (doseq [line out] (println line))
    (when (seq err)
      (binding [*out* *err*]
        (doseq [line err] (println line))))
    exit))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Socket REPL backend (direct TCP)

(def ^:private socket-read-timeout-ms 10000)
(def ^:private socket-connect-timeout-ms 5000)

(defn- eval-via-socket-repl!
  "Open a TCP socket to host:port, send one Clojure form, read everything
   the REPL prints until the read timeout, and print it to stdout.
   Returns 0 on success, non-zero on failure."
  [host port code]
  (try
    (with-open [sock (Socket.)]
      (.connect sock (InetSocketAddress. ^String host ^int (int port))
                (int socket-connect-timeout-ms))
      (.setSoTimeout sock (int socket-read-timeout-ms))
      (let [writer (PrintWriter. (.getOutputStream sock) true)
            reader (BufferedReader. (InputStreamReader. (.getInputStream sock)))]
        ;; Send the form followed by a newline. Socket REPL evaluates each
        ;; top-level form as soon as it parses.
        (.println writer code)
        (.flush writer)
        ;; Read everything the server sends until the read timeout fires.
        ;; Socket REPLs stay open indefinitely, so the timeout is how we know
        ;; the server is done talking.
        (let [sb (StringBuilder.)]
          (try
            (loop []
              (let [line (.readLine reader)]
                (when line
                  (.append sb line)
                  (.append sb "\n")
                  (recur))))
            (catch SocketTimeoutException _))
          (print (str sb))
          (flush)
          0)))
    (catch java.net.ConnectException e
      (println (c/red (str "Could not connect to socket REPL at " host ":" port)))
      (println (.getMessage e))
      1)
    (catch Exception e
      (println (c/red (str "Socket REPL error: " (.getMessage e))))
      1)))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; CLI entry point

(defn- dispatch-eval!
  "Run an eval against a resolved backend config. Returns {:exit int :connect-error? bool}."
  [{:keys [type host port]} code]
  (try
    (let [exit (case type
                 "nrepl"  (eval-via-nrepl! port code)
                 "socket" (eval-via-socket-repl! host (Integer/parseInt port) code))]
      {:exit exit :connect-error? false})
    (catch Exception e
      {:exit 1 :connect-error? true :error (.getMessage e)})))

(defn- looks-like-connect-error?
  "nREPL's clj-nrepl-eval prints a Java exception trace on connection failure.
   Socket eval returns a non-zero exit with a Connection/Unknown host error.
   This is a best-effort check — when in doubt, retry once."
  [exit output]
  (or (not (zero? exit))
      (and output
           (or (str/includes? output "ConnectException")
               (str/includes? output "UnknownHost")
               (str/includes? output "Connection refused")))))

(defn repl-eval!
  "Evaluate a Clojure form against the best-available REPL backend.

   Caches the resolved backend to .bot/repl.env so subsequent calls skip
   discovery. If a cached backend produces a connection error, the cache
   is cleared and discovery runs fresh one more time.

   Options (from CLI):
     positional arg: Clojure code to eval (alternatively via --code)
     --code CODE     Clojure code to eval
     --port PORT     Override discovery and use this port
     --host HOST     Override discovery and use this host (socket REPL only)
     --type TYPE     Force backend: 'nrepl' or 'socket'. Default: auto-detect.
     --refresh       Ignore the cache and re-run discovery.

   Auto-detect order:
     1. nREPL (via clj-nrepl-eval) if discoverable
     2. Socket REPL (MB_SOCKET_REPL_PORT locally, REPL_HOST/REPL_PORT in PR-env mode)
     3. Error if neither is available"
  [{:keys [arguments options]}]
  (let [code (or (:code options) (first arguments))]
    (when (str/blank? code)
      (println (c/red "Usage: ./bin/mage -bot-repl-eval '<clojure-form>' [--port PORT] [--host HOST] [--type nrepl|socket] [--refresh]"))
      (u/exit 1))
    (let [forced-type (:type options)
          forced-port (:port options)
          forced-host (:host options)
          refresh?    (:refresh options)
          ;; Option overrides bypass the cache entirely
          override    (when (or forced-type forced-port forced-host)
                        {:type (or forced-type "nrepl")
                         :host (or forced-host "localhost")
                         :port (or forced-port "")})]
      (cond
        ;; Explicit override — no cache involvement
        override
        (let [cfg (if (= (:type override) "socket")
                    (merge {:host "localhost"} override)
                    override)]
          (when (str/blank? (:port cfg))
            (println (c/red "When using --type or --host, --port is required (or rely on cache/auto-detect)."))
            (u/exit 1))
          (u/exit (:exit (dispatch-eval! cfg code))))

        :else
        (do
          (when refresh? (clear-cache!))
          (let [cached (read-cache)
                cfg    (or cached (resolve-backend))]
            (cond
              (nil? cfg)
              (do
                (println (c/red "No REPL available: neither nREPL nor socket REPL could be discovered."))
                (println (c/yellow "Hints:"))
                (println (c/yellow "  - For local dev: start the backend with `clj -M:dev:dev-start`."))
                (println (c/yellow "  - For PR-env: check that .bot/pr-env.env exists and REPL_HOST/REPL_PORT are set."))
                (u/exit 1))

              :else
              (let [{:keys [exit]} (dispatch-eval! cfg code)]
                (cond
                  (zero? exit)
                  (do
                    ;; Only persist the cache when the eval actually worked
                    (when-not cached (write-cache! cfg))
                    (u/exit 0))

                  ;; Connection error on a cached backend — invalidate and retry once with fresh discovery
                  cached
                  (do
                    (binding [*out* *err*]
                      (println (c/yellow (str "Cached REPL backend failed (exit " exit "). Clearing cache and retrying discovery."))))
                    (clear-cache!)
                    (if-let [fresh (resolve-backend)]
                      (let [{:keys [exit]} (dispatch-eval! fresh code)]
                        (when (zero? exit) (write-cache! fresh))
                        (u/exit exit))
                      (do
                        (println (c/red "No REPL available after cache invalidation."))
                        (u/exit 1))))

                  ;; Non-cached first attempt failed — don't persist a bad cache
                  :else
                  (u/exit exit))))))))))

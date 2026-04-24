(ns mage.bot.api-call
  "Make HTTP API calls to a Metabase instance — either the locally running
   dev server or a remote PR preview environment, depending on whether
   .bot/pr-env.env exists in the current worktree."
  (:require
   [babashka.http-client :as http]
   [babashka.json :as json]
   [clojure.string :as str]
   [mage.bot.env :as bot-env]
   [mage.bot.pr-env :as pr-env]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn- discover-port
  "Discover MB_JETTY_PORT using shared env resolution. Exits if unresolved."
  []
  (or (bot-env/resolve-env "MB_JETTY_PORT")
      (do
        (println (c/red "Could not resolve MB_JETTY_PORT for this worktree."))
        (println (c/yellow "Run ./bin/mage -bot-dev-env to configure the dev environment,"))
        (println (c/yellow "or export MB_JETTY_PORT in your shell."))
        (u/exit 1))))

(defn- local-url [path]
  (str "http://localhost:" (discover-port) path))

(defn- remote-url [path]
  (let [env (pr-env/load-pr-env)]
    (str (get env "BASE_URL") path)))

(defn- do-request
  "Perform one HTTP request. Returns the response map."
  [{:keys [method url headers body]}]
  (let [opts (cond-> {:headers headers :throw false}
               body (assoc :body body))]
    (try
      (http/request (assoc opts :method method :uri url))
      (catch Exception e
        (println (c/red (str "Connection failed: " url)))
        (let [msg (or (.getMessage e) (str (class e)))]
          (println msg))
        (u/exit 1)))))

(defn api-call!
  "Make an API call to the local or remote Metabase instance.
   Options (from CLI):
     positional arg: API path (e.g. /api/card, /api/collection/root)
     --method       HTTP method (default GET)
     --api-key      API key for x-api-key header (local mode; overrides remote session if given)
     --body         JSON request body (for POST/PUT)
     --pretty       Pretty-print JSON output (default true)
     --raw          Suppress the GET/Status diagnostic preamble so stdout is only the
                    response body (suitable for piping into jq/python/etc)"
  [{:keys [arguments options]}]
  (let [api-path (first arguments)]
    (when (str/blank? api-path)
      (println (c/red "Usage: ./bin/mage -bot-api-call /api/<path> [--method GET|POST|PUT|DELETE] [--api-key <key>] [--body '{...}'] [--raw]"))
      (u/exit 1))

    (let [method     (keyword (str/lower-case (or (:method options) "GET")))
          api-key    (:api-key options)
          body       (:body options)
          raw?       (:raw options)
          path       (if (str/starts-with? api-path "/") api-path (str "/" api-path))
          remote?    (pr-env/pr-env-active?)
          url        (if remote? (remote-url path) (local-url path))
          session    (when (and remote? (not api-key))
                       (or (pr-env/session-token)
                           (pr-env/refresh-session!)))
          base-hdr   {"Content-Type" "application/json"
                      "Accept"       "application/json"}
          headers    (cond-> base-hdr
                       api-key (assoc "x-api-key" api-key)
                       session (assoc "X-Metabase-Session" session))]

      ;; Print request info to stderr unless --raw
      (when-not raw?
        (binding [*out* *err*]
          (println (str (str/upper-case (name method)) " " path
                        (if remote? " (remote PR env)" (str " (port " (discover-port) ")"))))))

      (let [first-response (do-request {:method method :url url :headers headers :body body})
            ;; In remote mode with session auth, retry once on 401 with a fresh token
            response       (if (and remote? session (= 401 (:status first-response)))
                             (let [_ (when-not raw?
                                       (binding [*out* *err*]
                                         (println (c/yellow "Session token rejected (401) — refreshing and retrying"))))
                                   new-token (pr-env/refresh-session!)]
                               (do-request {:method  method
                                            :url     url
                                            :headers (assoc base-hdr "X-Metabase-Session" new-token)
                                            :body    body}))
                             first-response)
            status         (:status response)
            body-str       (:body response)]

        ;; Print status to stderr unless --raw
        (when-not raw?
          (binding [*out* *err*]
            (println (str "Status: " status))))

        ;; Print response body to stdout
        (when (seq body-str)
          (if (not= (:pretty options) "false")
            (try
              (let [parsed (json/read-str body-str)]
                (println (json/write-str parsed {:indent true})))
              (catch Exception _
                (println body-str)))
            (println body-str)))))))

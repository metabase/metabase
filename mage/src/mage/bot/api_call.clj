(ns mage.bot.api-call
  "Make HTTP API calls to the locally running Metabase instance.
   Automatically discovers the Jetty port and handles auth headers."
  (:require
   [babashka.http-client :as http]
   [babashka.json :as json]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn- read-mise-local-toml-val
  "Read a single value from mise.local.toml."
  [var-name]
  (let [path (str u/project-root-directory "/mise.local.toml")]
    (when (.exists (java.io.File. ^String path))
      (some (fn [line]
              (when-let [[_ k v] (re-matches #"(\w+)\s*=\s*\"(.*)\"" (str/trim line))]
                (when (= k var-name) v)))
            (str/split-lines (slurp path))))))

(defn- discover-port
  "Discover MB_JETTY_PORT from env > mise.local.toml > default 3000."
  []
  (or (u/env "MB_JETTY_PORT" (constantly nil))
      (read-mise-local-toml-val "MB_JETTY_PORT")
      "3000"))

(defn api-call!
  "Make an API call to the local Metabase instance.
   Options (from CLI):
     positional arg: API path (e.g. /api/card, /api/collection/root)
     --method       HTTP method (default GET)
     --api-key      API key for x-api-key header
     --body         JSON request body (for POST/PUT)
     --pretty       Pretty-print JSON output (default true)"
  [{:keys [arguments options]}]
  (let [api-path (first arguments)]
    (when (str/blank? api-path)
      (println (c/red "Usage: ./bin/mage -bot-api-call /api/<path> [--method GET|POST|PUT|DELETE] [--api-key <key>] [--body '{...}']"))
      (u/exit 1))

    (let [method  (keyword (str/lower-case (or (:method options) "GET")))
          api-key (:api-key options)
          body    (:body options)
          port    (discover-port)
          path    (if (str/starts-with? api-path "/") api-path (str "/" api-path))
          url     (str "http://localhost:" port path)

          headers (cond-> {"Content-Type" "application/json"
                           "Accept"       "application/json"}
                    api-key (assoc "x-api-key" api-key))

          opts    (cond-> {:headers headers
                           :throw   false}
                    body (assoc :body body))]

      ;; Print request info to stderr
      (binding [*out* *err*]
        (println (str (str/upper-case (name method)) " " path " (port " port ")")))

      (let [response (try
                       (http/request (assoc opts :method method :uri url))
                       (catch Exception e
                         (println (c/red (str "Connection failed: " url)))
                         (let [msg (or (.getMessage e)
                                       (str (class e)))]
                           (println msg))
                         (u/exit 1)))
            status   (:status response)
            body-str (:body response)]

        ;; Print status to stderr
        (binding [*out* *err*]
          (println (str "Status: " status)))

        ;; Print response body to stdout
        (when (seq body-str)
          (if (not= (:pretty options) "false")
            (try
              (let [parsed (json/read-str body-str)]
                (println (json/write-str parsed {:indent true})))
              (catch Exception _
                (println body-str)))
            (println body-str)))))))

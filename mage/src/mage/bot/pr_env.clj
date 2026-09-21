(ns mage.bot.pr-env
  "PR preview environment support for autobot.
   Writes .bot/pr-env.env and .bot/pr-env-session.txt in the current worktree
   so -bot-api-call and -bot-server-info can detect remote mode and talk to
   the deployed PR env at https://pr<PR#>.coredev.metabase.com."
  (:require
   [babashka.http-client :as http]
   [babashka.json :as json]
   [clojure.string :as str]
   [mage.bot.preflight :as preflight]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn- pr-env-dir
  "Return the .bot directory inside the current user cwd (the worktree).
   Creates it if it doesn't exist."
  []
  (let [dir (java.io.File. ^String (System/getProperty "user.dir") ".bot")]
    (.mkdirs dir)
    dir))

(defn- env-file [] (java.io.File. ^java.io.File (pr-env-dir) "pr-env.env"))
(defn- session-file [] (java.io.File. ^java.io.File (pr-env-dir) "pr-env-session.txt"))

(defn- login!
  "POST to {base-url}/api/session with creds. Returns the session token string,
   or throws an ex-info with :status and :body on failure."
  [base-url username password]
  (let [url  (str base-url "/api/session")
        body (json/write-str {:username username :password password})
        resp (try
               (http/post url {:headers {"Content-Type" "application/json"
                                         "Accept"       "application/json"}
                               :body    body
                               :throw   false})
               (catch Exception e
                 (throw (ex-info (str "Connection failed to " url)
                                 {:url url :cause (.getMessage e)}))))
        status (:status resp)
        body-str (:body resp)]
    (if (= status 200)
      (let [parsed (json/read-str body-str)]
        (or (get parsed :id) (get parsed "id")
            (throw (ex-info "Login response missing session id"
                            {:status status :body body-str}))))
      (throw (ex-info (str "Login failed: HTTP " status)
                      {:status status :body body-str :url url})))))

(defn- write-env-file!
  "Write .bot/pr-env.env with the PR env config."
  [{:keys [base-url pr-num repl-host username password]}]
  (spit (env-file)
        (str "BASE_URL=" base-url "\n"
             "PR_NUM=" pr-num "\n"
             "REPL_HOST=" repl-host "\n"
             "REPL_PORT=" pr-num "\n"
             "USERNAME=" username "\n"
             "PASSWORD=" password "\n")))

(defn- read-env-file
  "Read .bot/pr-env.env into a map of string keys. Returns nil if missing."
  []
  (let [f (env-file)]
    (when (.exists f)
      (into {}
            (keep (fn [line]
                    (let [line (str/trim line)]
                      (when (and (seq line)
                                 (not (str/starts-with? line "#"))
                                 (str/includes? line "="))
                        (let [[k v] (str/split line #"=" 2)]
                          [(str/trim k) (str/trim v)])))))
            (str/split-lines (slurp f))))))

(defn pr-env-active?
  "True when the current worktree is configured for remote PR-env mode
   (detected by the presence of .bot/pr-env.env)."
  []
  (.exists (env-file)))

(defn load-pr-env
  "Read .bot/pr-env.env and return a map, or nil if not in PR-env mode."
  []
  (read-env-file))

(defn session-token
  "Read the cached session token from .bot/pr-env-session.txt, or nil."
  []
  (let [f (session-file)]
    (when (.exists f)
      (str/trim (slurp f)))))

(defn refresh-session!
  "Re-login using the cached creds and overwrite the session token file.
   Returns the new token. Throws on failure."
  []
  (let [env (read-env-file)]
    (when-not env
      (throw (ex-info ".bot/pr-env.env not found — not in PR-env mode" {})))
    (let [token (login! (get env "BASE_URL")
                        (get env "USERNAME")
                        (get env "PASSWORD"))]
      (spit (session-file) (str token "\n"))
      token)))

(defn setup!
  "CLI entry point: write .bot/pr-env.env, log in, cache session token.
   Required options: --url, --pr"
  [{:keys [options]}]
  (let [{:keys [url pr]} options]
    (when (or (str/blank? url) (str/blank? pr))
      (println (c/red "Usage: ./bin/mage -bot-pr-env --url <URL> --pr <PR_NUMBER>"))
      (u/exit 1))
    (preflight/check-mise!)
    (let [resolved  (preflight/check-pr-env-vars!)
          username  (get resolved "PR_ENV_USERNAME")
          password  (get resolved "PR_ENV_PASSWORD")
          repl-host (get resolved "PR_ENV_REPL_HOST")
          cfg {:base-url  url
               :pr-num    pr
               :repl-host repl-host
               :username  username
               :password  password}]
      (println (c/bold (c/green "Configuring PR preview environment")))
      (println (c/yellow "  URL:      ") url)
      (println (c/yellow "  PR:       ") pr)
      (println (c/yellow "  Username: ") username)
      (println)

      (write-env-file! cfg)
      (println (c/green "  Wrote .bot/pr-env.env"))

      (try
        (let [token (login! url username password)]
          (spit (session-file) (str token "\n"))
          (println (c/green "  Logged in, cached session token to .bot/pr-env-session.txt"))
          (println)
          (println (c/bold (c/green "PR preview environment ready."))))
        (catch clojure.lang.ExceptionInfo e
          (println)
          (println (c/red "Login failed: ") (ex-message e))
          (println)
          (println (c/yellow "Likely cause: you are not on the Metabase Tailscale network."))
          (println (c/yellow "PR preview environments are only reachable via Tailscale."))
          (println (c/yellow "Verify connectivity: curl -v " url "/api/health"))
          (u/exit 1))))))

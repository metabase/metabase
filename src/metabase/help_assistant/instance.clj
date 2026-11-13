(ns metabase.help-assistant.instance
  "Read-only checks the Help assistant can run on this instance, when the admin allows it: recent server logs, database
  sync status, email and sign-in settings, and dashboard subscriptions and alerts. Everything they return goes to the AI
  provider, so secrets are stripped from logs and errors, email addresses are masked, and connection details and
  setting values other than on/off and names are never included."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.help-assistant.db :as help-assistant.db]
   [metabase.logger.core :as logger]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.cron :as u.cron]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Secret stripping ----------------------------------------------

(def ^:private redacted "[redacted]")

(def ^:private secret-key-words
  "Names of keys whose values are secret, in `key=value`, `key: value` and JSON."
  "(?:password|passwd|pwd|passphrase|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|credentials?)")

(def ^:private redactions
  "[pattern replacement] pairs, applied in order."
  [;; PEM private keys, e.g. a database's SSL client key
   [#"(?s)-----BEGIN [A-Z ]*PRIVATE KEY-----.*?(-----END [A-Z ]*PRIVATE KEY-----|\z)" "[redacted private key]"]
   ;; JDBC connection strings can hold the user, password and other options
   [#"(?i)\b(jdbc:[a-z0-9]+(?::[a-z0-9]+)*:)[^\s'\"<>]+" (str "$1" redacted)]
   ;; user:password@ in URLs, e.g. postgres://user:pass@host or mongodb+srv://...
   [#"(?i)\b([a-z][a-z0-9+.-]*://)[^\s/@'\"]+@" (str "$1" redacted "@")]
   ;; password=..., "api_key": "...", token: ...
   [(re-pattern (str "(?i)(\"?[\\w.-]*" secret-key-words "[\\w.-]*\"?\\s*[:=]\\s*)(\"[^\"]*\"|'[^']*'|[^\\s,;&}\\]\"')]+)"))
    (str "$1" redacted)]
   [#"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}" (str "$1 " redacted)]
   ;; well-known key formats: JWTs, AI provider keys, AWS, Slack, GitHub and Metabase API keys
   [#"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*" redacted]
   [#"\bsk-[A-Za-z0-9_-]{16,}" redacted]
   [#"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b" redacted]
   [#"\bxox[abposr]-[A-Za-z0-9-]{10,}" redacted]
   [#"\bgh[pousr]_[A-Za-z0-9]{20,}" redacted]
   [#"\bmb_[A-Za-z0-9+/=]{20,}" redacted]
   ;; long hex strings, like the embedding secret key
   [#"(?i)\b[0-9a-f]{32,}\b" redacted]])

(defn redact-secrets
  "`s` with passwords, tokens, API keys, private keys and connection strings replaced by `[redacted]`."
  [s]
  (reduce (fn [s [pattern replacement]] (str/replace s pattern replacement))
          (str s)
          redactions))

(defn mask-emails
  "`s` with each email address masked down to its first letter and domain: `jane@example.com` -> `j***@example.com`."
  [s]
  (str/replace (str s)
               #"(?i)\b([a-z0-9])[a-z0-9._%+-]*@([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})\b"
               "$1***@$2"))

;;; ---------------------------------------------------- Logs -----------------------------------------------------

(def ^:private level-rank {"TRACE" 0, "DEBUG" 1, "INFO" 2, "WARN" 3, "ERROR" 4, "FATAL" 5})

(def max-log-lines
  "The most log entries a check returns."
  100)

(def ^:private default-log-lines 50)

(defn- own-log? [{:keys [fqns]}]
  ;; The assistant's own lines would only repeat this chat back to it.
  (str/starts-with? (str fqns) "metabase.help-assistant"))

(defn- log-entry->text [{:keys [timestamp level fqns msg exception]}]
  (str timestamp " " level " " fqns " - " (u/truncate (str msg) 1000)
       (when (seq exception)
         (str "\n" (str/join "\n" (map #(str "    " %) (take 8 exception)))))))

(defn recent-logs
  "The most recent buffered server log entries, newest first, as text with secrets stripped and email addresses masked.
  Only entries containing `keyword` (any case), and at `level` or more severe (`\"error\"`, `\"warn\"`, `\"info\"` or
  `\"debug\"`)."
  [{:keys [keyword level limit]}]
  (let [keyword (some-> keyword str/trim u/lower-case-en not-empty)
        min-rank (get level-rank (some-> level u/upper-case-en) 0)
        limit    (-> (or limit default-log-lines) (max 1) (min max-log-lines))
        entries  (->> (logger/messages)
                      (remove own-log?)
                      (filter #(>= (get level-rank (str (:level %)) 0) min-rank))
                      (map (comp mask-emails redact-secrets log-entry->text))
                      ;; match after redacting, so a keyword can't find a secret or an email address by its value
                      (filter #(or (nil? keyword) (str/includes? (u/lower-case-en %) keyword)))
                      (take limit))]
    (if (empty? entries)
      (str "No recent log entries match. Only the most recent few hundred entries since Metabase started are kept in "
           "memory, so older ones aren't available here.")
      (str "Most recent first, " (count entries) " entries:\n\n" (str/join "\n" entries)))))

;;; -------------------------------------------------- Databases --------------------------------------------------

(def ^:private max-databases 30)

(defn- find-databases
  "Every database, or the ones matching `query` by id or name. Only the columns that are safe to show."
  [query]
  (let [databases (help-assistant.db/databases)
        query     (some-> query str str/trim not-empty)]
    (if-not query
      databases
      (let [lower (u/lower-case-en query)]
        (or (not-empty (filter #(= query (str (:id %))) databases))
            (not-empty (filter #(= lower (u/lower-case-en (:name %))) databases))
            (filter #(str/includes? (u/lower-case-en (:name %)) lower) databases))))))

(defn- format-time [t]
  (if t (str (t/truncate-to (t/offset-date-time t) :seconds)) "never"))

(defn- database-status [{:keys [id name engine initial_sync_status is_sample]}]
  (let [last-sync (help-assistant.db/last-successful-sync id)
        running   (help-assistant.db/running-sync-tasks id)
        failures  (help-assistant.db/recent-sync-failures id 3)]
    (str "- " name " (id " id ", engine " (clojure.core/name engine) (when is_sample ", the Sample Database") ")\n"
         "  initial sync: " (or initial_sync_status "unknown") "\n"
         "  last successful sync finished: " (format-time last-sync) "\n"
         (when (seq running)
           (str "  running now: " (str/join ", " (sort running)) "\n"))
         (if (empty? failures)
           "  failed sync steps in the last 7 days: none\n"
           (str "  failed sync steps in the last 7 days, most recent first:\n"
                (str/join (for [{:keys [task started_at message]} failures]
                            (str "    - " task " at " (format-time started_at) ": "
                                 (u/truncate (redact-secrets (or message "no error message")) 500)
                                 "\n"))))))))

(defn database-status-report
  "Sync status of every database, or the ones matching `database` (a name or id), as text. Returns
  `{:output text, :label what-was-checked}`. Never includes connection details."
  [database]
  (let [databases (find-databases database)
        shown     (take max-databases databases)]
    {:label  (cond
               (str/blank? (str database)) ""
               (= 1 (count databases))     (:name (first databases))
               :else                       (str/trim (str database)))
     :output (if (empty? databases)
               (str "No database matches \"" database "\". Call this again without a database to list them all.")
               (str (str/join "\n" (map database-status shown))
                    (when (> (count databases) max-databases)
                      (str "\n(" (- (count databases) max-databases) " more not shown. Ask about one by name.)"))))}))

;;; -------------------------------------------- Email and sign-in ------------------------------------------------

(defn- setting-value
  "The value of a setting, or nil when it doesn't exist in this edition or can't be read."
  [k]
  (when (setting/registered? k)
    (try
      (setting/get k)
      (catch Exception _ nil))))

(defn- on-off [k]
  (let [v (setting-value k)]
    (cond (nil? v) "unknown"
          v        "yes"
          :else    "no")))

(def ^:private sign-in-methods
  "[name enabled-setting configured-setting]. Settings that don't exist in this edition are skipped."
  [["Password login" :enable-password-login nil]
   ["Google" :google-auth-enabled :google-auth-configured]
   ["LDAP" :ldap-enabled :ldap-configured?]
   ["SAML" :saml-enabled :saml-configured]
   ["JWT" :jwt-enabled :jwt-configured]
   ["OIDC" :oidc-enabled :oidc-configured]])

(defn email-and-sign-in-status
  "Whether email (SMTP) is set up and which sign-in methods are on, as text. Only on/off and names, never values."
  []
  (str "Email (SMTP)\n"
       "- configured: " (on-off :email-configured?) "\n"
       (when-let [security (setting-value :email-smtp-security)]
         (str "- security: " (name security) "\n"))
       "\nSign-in methods\n"
       (str/join (for [[method enabled configured] sign-in-methods
                       :when (setting/registered? enabled)]
                   (str "- " method ": enabled " (on-off enabled)
                        (when (and configured (setting/registered? configured))
                          (str ", configured " (on-off configured)))
                        "\n")))))

;;; ------------------------------------------- Subscriptions and alerts -------------------------------------------

(def ^:private max-notifications 30)

(def ^:private max-listed-recipients 10)

(def ^:private send-loggers
  "Loggers whose warnings and errors are about sending subscriptions and alerts."
  ["metabase.notification" "metabase.pulse" "metabase.channel" "metabase.email"])

(defn- hour-text [hour]
  (if hour (format "%02d:00" (long hour)) "an unset hour"))

(defn- describe-schedule
  "A schedule map (`:schedule_type`, `:schedule_hour`, `:schedule_day`, `:schedule_frame`) as words."
  [{:keys [schedule_type schedule_hour schedule_day schedule_frame]}]
  (let [day   (some-> schedule_day name)
        frame (some-> schedule_frame name)]
    (case (some-> schedule_type name)
      "hourly"  "every hour"
      "daily"   (str "daily at " (hour-text schedule_hour))
      "weekly"  (str "weekly on " (or day "an unset day") " at " (hour-text schedule_hour))
      "monthly" (str "monthly on the "
                     (if (= "mid" frame)
                       "15th"
                       (str (or frame "?") " " (or day "day")))
                     " at " (hour-text schedule_hour))
      "an unknown schedule")))

(defn- describe-cron [cron]
  (try
    (describe-schedule (u.cron/cron-string->schedule-map cron))
    (catch Exception _
      (str "custom schedule (cron " cron ")"))))

(defn- recipients-text
  "How many people a channel sends to, with their email addresses masked, and the groups it sends to by name."
  [emails groups]
  (let [emails (distinct emails)
        shown  (map mask-emails (take max-listed-recipients emails))]
    (str (count emails) (if (= 1 (count emails)) " recipient" " recipients")
         (when (seq shown) (str ": " (str/join ", " shown)))
         (when (> (count emails) max-listed-recipients)
           (str " and " (- (count emails) max-listed-recipients) " more"))
         (when (seq groups) (str "; groups: " (str/join ", " groups))))))

(defn- channel-text [{:keys [channel_type emails groups slack-channel]} on? schedule]
  (let [channel (some-> channel_type name)]
    (str "    - " channel ", " (if on? "on" "turned off")
         (when schedule (str ", " schedule))
         ", "
         (if (= "slack" channel)
           (str "Slack channel " (or slack-channel "(not set)"))
           (recipients-text emails groups)))))

(defn- subscription-text [{:keys [id name dashboard channels]}]
  (str "- \"" name "\" (subscription id " id ") on dashboard \"" (:name dashboard) "\" (id " (:id dashboard) ")"
       (when (:archived dashboard) ", the dashboard is in the trash")
       "\n"
       (if (empty? channels)
         "    - no channels\n"
         (str/join (for [{:keys [enabled] :as channel} channels]
                     (str (channel-text channel enabled (describe-schedule channel)) "\n"))))))

(defn- send-condition-text [condition send-once]
  (str (case (some-> condition name)
         "has_result" "when the question has results"
         "goal_above" "when the result goes above the goal"
         "goal_below" "when the result goes below the goal"
         "on a condition")
       (when send-once ", only once")))

(defn- alert-text [{:keys [id active card send_condition send_once schedules handlers]}]
  (str "- alert id " id " on question \"" (:name card) "\" (id " (:id card) ")"
       (when (:archived card) ", the question is in the trash")
       ", " (if active "active" "turned off")
       ", sends " (send-condition-text send_condition send_once) "\n"
       "    - schedule: " (if (seq schedules) (str/join "; " (map describe-cron schedules)) "none") "\n"
       (if (empty? handlers)
         "    - no channels\n"
         (str/join (for [{:keys [active] :as handler} handlers]
                     (str (channel-text handler active nil) "\n"))))))

(defn- matches?
  "Whether `query` is one of the ids, or part of one of the names, any case."
  [query & values]
  (let [lower (u/lower-case-en query)]
    (some #(and (some? %)
                (or (= query (str %))
                    (str/includes? (u/lower-case-en (str %)) lower)))
          values)))

(defn- failure-text [subscriptions alerts {:keys [task started_at message notification_id notification_type]}]
  (let [what (case notification_type
               "notification/dashboard" (some #(when (= notification_id (:id %))
                                                 (str "subscription \"" (:name %) "\""))
                                              subscriptions)
               "notification/card"      (some #(when (= notification_id (:id %))
                                                 (str "alert on \"" (get-in % [:card :name]) "\""))
                                              alerts)
               nil)]
    (str "- " (format-time started_at) " " task
         (cond what            (str " for " what)
               notification_id (str " for notification id " notification_id))
         ": " (u/truncate (mask-emails (redact-secrets (or message "no error message"))) 500))))

(defn- recent-send-log-lines
  "The latest `n` warnings and errors from the code that sends subscriptions and alerts, as text with secrets stripped
  and email addresses masked."
  [n]
  (->> (logger/messages)
       (filter #(>= (get level-rank (str (:level %)) 0) (level-rank "WARN")))
       (filter (fn [{:keys [fqns]}] (some #(str/starts-with? (str fqns) %) send-loggers)))
       (map (comp mask-emails redact-secrets log-entry->text))
       (take n)))

(defn subscriptions-and-alerts-report
  "Dashboard subscriptions and question alerts, or the ones whose name, dashboard or question matches `query` (a name or
  id), with schedules, recipient counts and masked email addresses, plus sends that failed in the last 7 days and the
  latest warnings and errors from sending. Returns `{:output text, :label what-was-checked}`."
  [query]
  (let [query         (some-> query str str/trim not-empty)
        subscriptions (cond->> (help-assistant.db/dashboard-subscriptions)
                        query (filter #(matches? query (:id %) (:name %)
                                                 (get-in % [:dashboard :id]) (get-in % [:dashboard :name]))))
        alerts        (cond->> (help-assistant.db/alerts)
                        query (filter #(matches? query (:id %) (get-in % [:card :id]) (get-in % [:card :name]))))
        failures      (help-assistant.db/recent-send-failures 10)
        log-lines     (recent-send-log-lines 5)
        section       (fn [title items ->text]
                        (str title " (" (count items) ")\n"
                             (if (empty? items)
                               (str "- none" (when query (str " matching \"" query "\"")) "\n")
                               (str (str/join (map ->text (take max-notifications items)))
                                    (when (> (count items) max-notifications)
                                      (str "- " (- (count items) max-notifications)
                                           " more not shown. Ask about one by name.\n"))))))]
    {:label  (or query "")
     :output (str (section "Dashboard subscriptions" subscriptions subscription-text)
                  "\n"
                  (section "Question alerts" alerts alert-text)
                  "\nSends that failed in the last 7 days, across all subscriptions and alerts:\n"
                  (if (empty? failures)
                    "- none recorded. Some errors stop a send before it's recorded, so also check the log lines below.\n"
                    (str (str/join "\n" (map #(failure-text subscriptions alerts %) failures)) "\n"))
                  "\nLatest warnings and errors from sending, newest first (in-memory log):\n"
                  (if (empty? log-lines)
                    "- none\n"
                    (str (str/join "\n" log-lines) "\n")))}))

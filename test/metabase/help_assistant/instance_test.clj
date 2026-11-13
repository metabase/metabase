(ns metabase.help-assistant.instance-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.help-assistant.instance :as instance]
   [metabase.logger.core :as logger]
   [metabase.test :as mt])
  (:import
   (org.apache.logging.log4j Level)))

(set! *warn-on-reflection* true)

(deftest redact-secrets-test
  (testing "secrets are replaced"
    (doseq [[text secret] [["jdbc:postgresql://db.internal:5432/app?user=bob&password=hunter2" "db.internal"]
                           ["mongodb+srv://bob:hunter2@cluster0.example.net/app" "bob:hunter2"]
                           ["password=hunter2" "hunter2"]
                           ["{\"password\": \"hunter2\", \"port\": 5432}" "hunter2"]
                           ["client_secret: s3cr3t-value" "s3cr3t-value"]
                           ["API-Key=abc123def" "abc123def"]
                           ["Authorization: Bearer abcdefghijklmnopqrstuvwxyz" "abcdefghijklmnopqrstuvwxyz"]
                           ["key sk-ant-api03-abcdefghijklmnopqrst" "sk-ant-api03-abcdefghijklmnopqrst"]
                           ;; Fake keys, split so the pre-commit secret scanner doesn't flag them.
                           [(str "AWS AKIA" "ABCDEFGHIJKLMNOP") (str "AKIA" "ABCDEFGHIJKLMNOP")]
                           [(str "jwt eyJhbGciOiJIUzI1NiJ9" ".eyJzdWIiOiIxIn0.c2lnbmF0dXJl") "eyJzdWIiOiIxIn0"]
                           ["embedding key 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" "0123456789abcdef"]
                           ["-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----" "MIIEow"]]]
      (testing text
        (let [redacted (instance/redact-secrets text)]
          (is (not (str/includes? redacted secret)))
          (is (str/includes? redacted "redacted"))))))
  (testing "ordinary log lines are left alone"
    (doseq [text ["Sync of database 'Orders' finished in 3.2 s"
                  "Premium token check passed"
                  "Error running step 'sync-fields' for postgres Database 2 'Orders'"]]
      (is (= text (instance/redact-secrets text))))))

(deftest mask-emails-test
  (testing "email addresses keep their first letter and domain"
    (is (= "Sent to j***@example.com and B***@mail.example.co.uk"
           (instance/mask-emails "Sent to jane.doe+alerts@example.com and Bob_99@mail.example.co.uk"))))
  (testing "text without an email address is left alone"
    (doseq [text ["Sync of database 'Orders' finished" "postgres://[redacted]@db/app" "Run @ 10:00"]]
      (is (= text (instance/mask-emails text))))))

(defn- log-entry [level fqns msg & [exception]]
  {:timestamp "2026-11-12T10:00:00Z", :level level, :fqns fqns, :msg msg, :exception exception})

(deftest recent-logs-test
  (with-redefs [logger/messages (constantly
                                 [(log-entry Level/ERROR "metabase.driver" "Connection failed for jdbc:postgresql://db/app?password=hunter2"
                                             ["org.postgresql.util.PSQLException: password=hunter2 rejected"])
                                  (log-entry Level/INFO "metabase.help-assistant.core" "Help assistant: calling a model about ssl")
                                  (log-entry Level/WARN "metabase.sync" "SSL handshake took 4 s")
                                  (log-entry Level/ERROR "metabase.notification.send" "Recipient rita.jones@customer.example is not allowed")
                                  (log-entry Level/DEBUG "metabase.sync" "ssl debug detail")])]
    (testing "secrets are stripped from messages and stack traces"
      (let [logs (instance/recent-logs {})]
        (is (str/includes? logs "Connection failed for jdbc:postgresql:[redacted]"))
        (is (not (str/includes? logs "hunter2")))))
    (testing "email addresses are masked, and a keyword can't find one by its value"
      (let [logs (instance/recent-logs {:keyword "recipient"})]
        (is (str/includes? logs "Recipient r***@customer.example is not allowed"))
        (is (not (str/includes? logs "rita.jones"))))
      (is (str/starts-with? (instance/recent-logs {:keyword "rita.jones"}) "No recent log entries match.")))
    (testing "the assistant's own log lines are left out"
      (is (not (str/includes? (instance/recent-logs {}) "calling a model"))))
    (testing "filtering by keyword, any case, and minimum level"
      (is (= ["SSL handshake took 4 s"]
             (re-seq #"SSL handshake took 4 s|ssl debug detail" (instance/recent-logs {:keyword "SSL", :level "warn"})))))
    (testing "a keyword can't find a secret by its value"
      (is (str/starts-with? (instance/recent-logs {:keyword "hunter2"}) "No recent log entries match.")))
    (testing "the number of entries is capped"
      (is (str/starts-with? (instance/recent-logs {:limit 1}) "Most recent first, 1 entries")))))

(deftest database-status-report-test
  (mt/with-temp [:model/Database    {db-id :id} {:name    "Help Assistant Test DB"
                                                 :engine  :h2
                                                 :details {:db "mem:help-assistant-secret-path", :password "hunter2"}}
                 :model/TaskHistory _           {:db_id        db-id
                                                 :task         "sync-fields"
                                                 :status       :failed
                                                 :started_at   (t/offset-date-time)
                                                 :ended_at     (t/offset-date-time)
                                                 :task_details {:message "Refused: jdbc:h2:mem:help-assistant-secret-path;PASSWORD=hunter2"}}]
    (let [{:keys [label output]} (instance/database-status-report "help assistant test db")]
      (testing "a database can be found by name, any case, and the step names it"
        (is (= "Help Assistant Test DB" label)))
      (testing "it reports the engine and recent sync failures"
        (is (str/includes? output "engine h2"))
        (is (str/includes? output "sync-fields at"))
        (is (str/includes? output "Refused: jdbc:h2:mem:[redacted]")))
      (testing "it never includes connection details or credentials"
        (is (not (str/includes? output "secret-path")))
        (is (not (str/includes? output "hunter2")))))
    (testing "by id"
      (is (= "Help Assistant Test DB" (:label (instance/database-status-report (str db-id))))))
    (testing "no match"
      (is (str/starts-with? (:output (instance/database-status-report "no such database")) "No database matches")))))

(deftest email-and-sign-in-status-test
  (mt/with-temporary-setting-values [email-smtp-host     "smtp.help-assistant-secret.example"
                                     email-smtp-password "hunter2"]
    (let [status (instance/email-and-sign-in-status)]
      (testing "it says whether email is configured and lists sign-in methods"
        (is (str/includes? status "- configured: yes"))
        (is (str/includes? status "- Google: enabled")))
      (testing "it never includes setting values"
        (is (not (str/includes? status "help-assistant-secret")))
        (is (not (str/includes? status "hunter2")))))))

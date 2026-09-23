(ns mage.papercuts.loop-test
  "End-to-end test of the papercut loop: a transcript is scanned, the finding reaches a real papercuts server,
  triage resolves it, and a later session that hits the same papercut reopens it.
  Starts `hackathon-2026-papercut/server.py` on a free port, so it needs `python3`.
  Jev and the drill-down agent are stubbed; everything between them and the server is real."
  (:require
   [babashka.fs :as fs]
   [babashka.http-client :as http]
   [babashka.json :as json]
   [babashka.process :as p]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.papercuts.drill :as drill]
   [mage.papercuts.jev :as jev]
   [mage.papercuts.scan :as scan]
   [mage.papercuts.transcript :as transcript]
   [mage.util :as u])
  (:import
   (java.net ServerSocket)
   (java.time Instant)))

(set! *warn-on-reflection* true)

;;; Server

(defn- free-port []
  (with-open [socket (ServerSocket. 0)]
    (.getLocalPort socket)))

(defn- request [server method route & [body]]
  (let [{:keys [status body]} (http/request (cond-> {:method  method
                                                     :uri     (str server route)
                                                     :headers {"Content-Type" "application/json"}
                                                     :throw   false}
                                              body (assoc :body (json/write-str body))))]
    {:status status :body (some-> body not-empty json/read-str)}))

(defn- start-server!
  "Start the papercuts server on a fresh database. Returns `{:url :process}` once it answers."
  [dir]
  (let [port    (free-port)
        url     (str "http://127.0.0.1:" port)
        process (p/process {:dir (str (fs/path u/project-root-directory "hackathon-2026-papercut"))
                            :out :string :err :string}
                           "python3" "server.py" "--db" (str (fs/path dir "papercuts.sqlite3")) "--port" (str port)
                           ;; An empty token overrides PAPERCUTS_TOKEN, which the test client doesn't send.
                           "--token" "")]
    (loop [attempt 0]
      (cond
        (try (= 200 (:status (request url :get "/api/papercuts"))) (catch Exception _ false))
        {:url url :process process}

        (or (> attempt 100) (not (p/alive? process)))
        (throw (ex-info "papercuts server did not start" {:err (:err @(p/destroy-tree process))}))

        :else
        (do (Thread/sleep 100) (recur (inc attempt)))))))

(defn- with-server! [f]
  (let [dir    (str (fs/create-temp-dir {:prefix "papercuts-loop"}))
        server (start-server! dir)]
    (try
      (f (:url server) dir)
      (finally
        (p/destroy-tree (:process server))
        (fs/delete-tree dir)))))

;;; Transcripts

(defn- write-session!
  "Write a Claude transcript for session `id` under `projects`, one user message per text. Every message is stamped
  `ts`, so a session written after triage is observed after it."
  [projects id ts texts]
  (let [file (fs/path projects "-w-metabase" (str id ".jsonl"))]
    (fs/create-dirs (fs/parent file))
    (spit (str file) (str/join "\n" (for [text texts]
                                      (json/write-str {:type "user" :timestamp ts :message {:content text}}))))
    ;; The scanner skips sessions touched within --min-idle; backdate so the file counts as idle.
    (fs/set-last-modified-time file (.minusSeconds (Instant/now) 60))
    (str file)))

(def ^:private flaky-test-messages
  [(str "The quartz test failed again. " (str/join " " (repeat 40 "retrying.")))
   (str "It failed the same way. " (str/join " " (repeat 40 "retrying again.")))])

(def ^:private title "Agent reruns a flaky quartz test instead of reading its logs")

(defn- finding
  "A stubbed drill-down that reports one papercut per chunk, anchored at the chunk's first new line and filed under
  the known papercut with the same title when there is one."
  [slug title chunk]
  {:slug              slug
   :label             "positive"
   :kind              "agent-behaviour"
   :existing_papercut (or (some #(when (= title (:title %)) (:id %)) (:existing chunk)) 0)
   :area              ["test/metabase/task"]
   :title             title
   :trap              "The agent reruns the test."
   :mechanism         "Nothing points it at the logs."
   :fix               "Print the log path on failure."
   :anchors           [{:line (:first-new-line chunk) :role "agent" :proves "rerun"}]})

(def ^:private flaky-test (partial finding "reruns-flaky-quartz-test" title))

(defn- scan! [server state-file projects drill & [options]]
  ;; Private vars can't be named in `with-redefs`, so the redefinitions go through their vars.
  (with-redefs-fn {#'scan/sources  {:claude {:roots   [projects]
                                             :entries transcript/claude-entries
                                             :session transcript/claude-session}}
                   #'scan/api-key! (constantly "test-key")
                   #'jev/screen!   (fn [_ _] {:scores {:flailing 0.95} :model "stub"})
                   #'drill/drill!  (fn [_ chunk] [(drill chunk)])
                   #'u/exit        (fn [code] (throw (ex-info "scan exited" {:code code})))}
    #(with-out-str
       (scan/scan! :claude {:options (merge {:server     server
                                             :repository "metabase"
                                             :reporter   "tester.claude"
                                             :state-file state-file
                                             :min-idle   0
                                             :threshold  0.8
                                             :subagents  true
                                             :jobs       1}
                                            options)}))))

(defn- papercuts [server]
  (:papercuts (:body (request server :get "/api/papercuts?repository=metabase&status=&limit=500"))))

;;; The loop

(deftest transcript-to-triage-loop-test
  (when-not (fs/which "python3")
    (throw (ex-info "python3 is required to run the papercuts server" {})))
  (with-server!
    (fn [server dir]
      (let [projects   (str (fs/path dir "projects"))
            state-file (str (fs/path dir "scan-state.claude.edn"))
            first-id   "11111111-1111-4111-8111-111111111111"
            second-id  "22222222-2222-4222-8222-222222222222"]
        (write-session! projects first-id "2026-09-20T10:00:00Z" flaky-test-messages)
        (scan! server state-file projects flaky-test)
        (let [[papercut :as all] (papercuts server)
              id                 (:id papercut)]
          (testing "a finding in a transcript becomes one papercut with one report"
            (is (= 1 (count all)))
            (is (= {:title title :status "open" :category "agent-trap" :report_count 1
                    :fingerprints ["papercut:reruns-flaky-quartz-test"]}
                   (select-keys papercut [:title :status :category :report_count :fingerprints]))))
          (testing "the report says where it came from"
            (is (= {:report_id (str "claude:" first-id ":1") :agent "claude" :session first-id
                    :reporter "tester.claude" :observed_at "2026-09-20T10:00:00+00:00"}
                   (-> (request server :get (str "/api/papercuts/" id))
                       :body :reports first
                       (select-keys [:report_id :agent :session :reporter :observed_at])))))
          (testing "scanning again submits nothing new, even with --rescan"
            (scan! server state-file projects flaky-test)
            (scan! server state-file projects flaky-test {:rescan true})
            (is (= [1] (map :report_count (papercuts server)))))
          (testing "triage resolves the papercut"
            (is (= 200 (:status (request server :patch (str "/api/papercuts/" id)
                                         {:status "resolved" :actor "tester" :reason "Logs now printed"}))))
            (is (= "resolved" (:status (first (papercuts server))))))
          (testing "a later session that hits the same papercut joins it and reopens it"
            (write-session! projects second-id (str (Instant/now)) flaky-test-messages)
            (scan! server state-file projects flaky-test)
            (let [detail (:body (request server :get (str "/api/papercuts/" id)))]
              (is (= [id] (map :id (papercuts server))))
              (is (= {:status "open" :report_count 2} (select-keys detail [:status :report_count])))
              (is (some #(= "reopened" (:kind %)) (:events detail))))))))))

(deftest merge-routes-later-reports-test
  (with-server!
    (fn [server dir]
      (let [projects      (str (fs/path dir "projects"))
            state-file    (str (fs/path dir "scan-state.claude.edn"))
            other-title   "Agent loops on a failing quartz test"
            scan-session! (fn [id slug title]
                            (write-session! projects id "2026-09-20T10:00:00Z" flaky-test-messages)
                            (scan! server state-file projects (partial finding slug title)))]
        (scan-session! "11111111-1111-4111-8111-111111111111" "reruns-flaky-quartz-test" title)
        (scan-session! "22222222-2222-4222-8222-222222222222" "loops-on-quartz-test" other-title)
        (let [ids             (into {} (map (juxt :title :id)) (papercuts server))
              [target source] [(ids title) (ids other-title)]]
          (testing "two sessions that describe one trap differently file two papercuts"
            (is (= 2 (count ids))))
          (testing "triage merges them"
            (is (= 200 (:status (request server :post (str "/api/papercuts/" source "/merge")
                                         {:into target :actor "tester" :reason "Same trap"}))))
            (is (= [target] (map :id (papercuts server)))))
          (testing "a later report under the merged-away slug lands on the target"
            (scan-session! "33333333-3333-4333-8333-333333333333" "loops-on-quartz-test" other-title)
            (is (= [{:id           target
                     :report_count 3
                     :fingerprints ["papercut:loops-on-quartz-test" "papercut:reruns-flaky-quartz-test"]}]
                   (map #(select-keys % [:id :report_count :fingerprints]) (papercuts server))))))))))

(deftest short-tail-waits-for-the-next-scan-test
  (with-server!
    (fn [server dir]
      (let [projects   (str (fs/path dir "projects"))
            state-file (str (fs/path dir "scan-state.claude.edn"))]
        (write-session! projects "44444444-4444-4444-8444-444444444444" "2026-09-20T10:00:00Z"
                        ["No, use ./bin/test-agent."])
        (testing "after a turn, a stretch too short to screen waits"
          (scan! server state-file projects flaky-test {:hold-short-tail true})
          (is (empty? (papercuts server))))
        (testing "the next scan screens it, though the transcript hasn't changed"
          (scan! server state-file projects flaky-test)
          (is (= [title] (map :title (papercuts server)))))))))

(ns metabase-enterprise.serialization.v2.load-connection-test
  "Guards for a serdes load that holds one app-DB connection from start to end: what an error leaves committed, that
  the load returns its connection, and that no other thread uses the app DB during the load.

  Not ^:parallel: the loads commit content, the fixtures clean shared tables, and the tests read the pool's busy
  count and use the JVM-wide JDBC counter."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase-enterprise.serialization.v2.load :as serdes.load]
   [metabase.app-db.activity-test-util :as activity]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.connection-pool-setup :as mdb.connection-pool-setup]
   [metabase.app-db.core :as mdb]
   [metabase.models.serialization :as serdes]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [next.jdbc :as jdbc]
   [toucan2.core :as t2])
  (:import
   (com.mchange.v2.c3p0 DataSources PoolBackedDataSource WrapperConnectionPoolDataSource)
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(use-fixtures :once
  (fixtures/initialize :db)
  ;; the cards in the files name the `test-data (h2)` database and the creator rasta. A load that does not find rasta
  ;; creates it as an inactive user with no password, and later tests in the JVM cannot log in as rasta.
  (fn [thunk]
    (mt/id)
    (mt/user->id :rasta)
    (thunk)))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

;;; ------------------------------------------------ content ------------------------------------------------

(def ^:private coll-eid "loadconnectioncollxxx")

(def ^:private card-eid-prefix "loadconnectioncard")

(def ^:private n-cards 12)

(defn- card-eid [i]
  (format "%s%03d" card-eid-prefix i))

(def ^:private coll-dir "collections/main/load_connection")

(defn- files
  "A remote-synced collection and [[n-cards]] cards in it, as a map of path to YAML. The insert of a card whose index
  is in `bad` fails, because its name is too long for the column. The cards name the creator rasta, or `creator`."
  [& {:keys [bad prefix creator] :or {bad #{} prefix "Card"}}]
  (into {(str coll-dir "/load_connection.yaml")
         (rs.test/generate-collection-yaml coll-eid "Load connection" :is-remote-synced true)}
        (for [i (range n-cards)]
          [(format "%s/card_%03d.yaml" coll-dir i)
           (cond-> (rs.test/generate-card-yaml (card-eid i)
                                               (if (bad i) (str/join (repeat 300 "x")) (str prefix " " i))
                                               coll-eid)
             creator (str/replace "creator_id: rasta@metabase.com" (str "creator_id: " creator)))])))

(defn- ingestable [files]
  (-> (rs.test/create-mock-source :initial-files {"main" files})
      source.p/snapshot
      (source.p/->ingestable {})))

(defn- on-read
  "`ingestable` that calls `(f n path)` before its n-th file read."
  [ingestable f]
  (let [reads (atom 0)]
    (reify serialization/Ingestable
      (ingest-list [_] (serialization/ingest-list ingestable))
      (ingest-one [_ path]
        (f (swap! reads inc) path)
        (serialization/ingest-one ingestable path))
      (ingest-errors [_] (serialization/ingest-errors ingestable)))))

(defn- card-load-order
  "The card indexes of `files`, in the order in which a load loads them."
  [files]
  (vec (for [path  (serialization/ingest-list (ingestable files))
             :let  [{:keys [model id]} (last path)]
             :when (= "Card" model)]
         (parse-long (subs id (count card-eid-prefix))))))

(defn- loaded-cards []
  (into #{} (t2/select-fn-vec :entity_id :model/Card :entity_id [:like (str card-eid-prefix "%")])))

(defn- delete-content! []
  (t2/delete! :model/Card :entity_id [:like (str card-eid-prefix "%")])
  (t2/delete! :model/Collection :entity_id coll-eid))

;;; ------------------------------------------- errors (rule L2) -------------------------------------------

(defn- load-and-watch-connection!
  "Load `files` directly, not through remote sync. Returns the load result (or `{:thrown e}`), the cards in the app DB
  after the load, and what each file read saw of the connection that the load holds."
  [files & {:keys [continue-on-error]}]
  (let [reads  (atom [])
        result (try
                 (serdes/with-cache
                   (serialization/load-metabase!
                    (on-read (ingestable files)
                             (fn [_ _]
                               (t2/with-connection [^Connection conn]
                                 (swap! reads conj {:conn            (System/identityHashCode conn)
                                                    :auto-commit?    (.getAutoCommit conn)
                                                    :in-transaction? (mdb/in-transaction?)}))))
                    :reindex? false
                    :continue-on-error continue-on-error))
                 (catch Exception e
                   {:thrown e}))]
    {:result result
     :cards  (loaded-cards)
     :reads  @reads}))

(defn- failed-card-eid
  "The entity ID of the entity that the load error `e` names."
  [e]
  (-> e ex-data :entity :id))

(deftest error-keeps-committed-entities-test
  (let [order (card-load-order (files))]
    (doseq [[place pos]       [[:first 0] [:middle (quot n-cards 2)] [:last (dec n-cards)]]
            :let              [bad       (nth order pos)
                               bad-files (files :bad #{bad})
                               before    (into #{} (comp (take-while #(not= bad %)) (map card-eid))
                                               (card-load-order bad-files))]
            continue-on-error [false true]]
      (testing (format "The insert of the %s card in load order fails, continue-on-error %s" (name place) continue-on-error)
        (try
          (let [{:keys [result cards reads]} (load-and-watch-connection! bad-files :continue-on-error continue-on-error)]
            (is (= 1 (t2/count :model/Collection :entity_id coll-eid))
                "the collection, which every card needs, is loaded and committed")
            (if continue-on-error
              (testing "the load skips the failed card, records one error for it, and loads every other card"
                (is (not (contains? result :thrown)))
                (is (= [(card-eid bad)] (map failed-card-eid (:errors result))))
                (is (= (disj (into #{} (map card-eid) (range n-cards)) (card-eid bad))
                       cards)))
              (testing "the load stops at the failed card, and the cards loaded before it stay committed"
                (is (= (card-eid bad) (some-> (:thrown result) failed-card-eid)))
                (is (= before cards))))
            (testing "every file read sees the same connection, with no transaction open on it"
              (is (= 1 (count (into #{} (map :conn) reads))))
              (is (every? :auto-commit? reads))
              (is (not-any? :in-transaction? reads))))
          (finally
            (delete-content!)))))))

(def ^:private marker-key
  "The key of the setting row that a failed entity leaves uncommitted in
  [[error-that-leaves-a-write-uncommitted-test]]."
  "load-connection-uncommitted-marker")

(defn- leave-a-write-uncommitted-on-error
  "A replacement for the load's retry wrapper. When the entity's load fails, it leaves autocommit off on the held
  connection with an uncommitted write of a [[marker-key]] row before it rethrows, as a transaction whose rollback
  failed does."
  []
  (let [with-retries (mt/original-fn #'serdes.load/with-retries)]
    (fn [max-retries base-delay-ms f]
      (try
        (with-retries max-retries base-delay-ms f)
        (catch Exception e
          (t2/with-connection [^Connection conn]
            (.setAutoCommit conn false)
            ;; plain JDBC: a toucan2 insert opens a transaction, which commits on a connection with autocommit off
            (jdbc/execute! conn (t2/compile (t2/insert! :setting {:key marker-key :value "uncommitted"}))))
          (throw e))))))

(deftest error-that-leaves-a-write-uncommitted-test
  (let [order (card-load-order (files))]
    (doseq [[place pos] [[:first 0] [:middle (quot n-cards 2)]]
            :let        [bad (nth order pos)]]
      (testing (format "The load of the %s card in load order fails and leaves autocommit off with an uncommitted write;
                        continue-on-error is true"
                       (name place))
        (try
          (let [{:keys [result cards reads]} (mt/with-dynamic-fn-redefs [serdes.load/with-retries
                                                                         (leave-a-write-uncommitted-on-error)]
                                               (load-and-watch-connection! (files :bad #{bad}) :continue-on-error true))]
            (is (= [(card-eid bad)] (map failed-card-eid (:errors result))))
            (is (= (disj (into #{} (map card-eid) (range n-cards)) (card-eid bad))
                   cards)
                "the load loads every other card")
            (is (not (t2/exists? :setting :key marker-key))
                "the load rolls back the write that the failed card left uncommitted")
            (is (every? :auto-commit? reads) "the file reads after the failure see autocommit on again"))
          (finally
            (t2/delete! :setting :key marker-key)
            (delete-content!)))))))

(def ^:private new-creator
  "The email of a user that does not exist before [[failed-entity-forgets-the-user-it-created-test]]."
  "load-connection-new-creator@example.com")

(deftest failed-entity-forgets-the-user-it-created-test
  (testing "The cards name a creator that does not exist. The first card in load order creates the creator and then
            fails, so its rollback removes the creator. With continue-on-error, the load creates the creator again for
            the next card and loads every other card."
    (let [bad (first (card-load-order (files)))]
      (try
        (let [{:keys [result cards]} (load-and-watch-connection! (files :bad #{bad} :creator new-creator)
                                                                 :continue-on-error true)]
          (is (= [(card-eid bad)] (map failed-card-eid (:errors result))))
          (is (= (disj (into #{} (map card-eid) (range n-cards)) (card-eid bad))
                 cards)
              "the load loads every other card")
          (is (= 1 (t2/count :model/User :email new-creator))
              "the creator exists once"))
        (finally
          (delete-content!)
          (t2/delete! :model/User :email new-creator))))))

(deftest failed-pull-keeps-ledger-and-version-test
  (testing "A remote-sync pull whose load fails leaves the ledger and the last version as they were"
    (search.tu/with-index-disabled
      (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms false]
        (let [bad    (nth (card-load-order (files)) (quot n-cards 2))
              src    (rs.test/versioned-source :trees {"v0" (files)
                                                       "v1" (files :bad #{bad} :prefix "Renamed")}
                                               :current "v0")
              ledger #(t2/select-fn-set (juxt :model_type :model_id :status :content_hash) :model/RemoteSyncObject)]
          (is (= :success (:status (rs.test/import-at! src "v0" :force? true))) "baseline pull")
          (let [ledger-v0 (ledger)]
            (is (= (inc n-cards) (count ledger-v0)) "the collection and the cards are synced")
            (is (= :error (:status (rs.test/import-at! src "v1" :force? true))))
            (is (= ledger-v0 (ledger)))
            (is (= "v0" (remote-sync.task/last-version)))))))))

(def ^:private missing-card-eid
  "The entity ID of a card that is neither in the files nor in the app DB."
  "loadconnectionmissing")

(defn- dependency-files
  "A remote-synced collection, card 0, and card 1 based on card 0, as a map of path to YAML. With `missing-source?`,
  card 0 is based on the card [[missing-card-eid]]."
  [& {:keys [missing-source?]}]
  {(str coll-dir "/load_connection.yaml")
   (rs.test/generate-collection-yaml coll-eid "Load connection" :is-remote-synced true)

   (str coll-dir "/card_000.yaml")
   (cond-> (rs.test/generate-card-yaml (card-eid 0) "Card 0" coll-eid)
     missing-source? (str/replace "source_card_id: null" (str "source_card_id: " missing-card-eid)))

   (str coll-dir "/card_001.yaml")
   (str/replace (rs.test/generate-card-yaml (card-eid 1) "Card 1" coll-eid)
                "source_card_id: null" (str "source_card_id: " (card-eid 0)))})

(defn- dependent-first
  "`ingestable` with its entities listed in this order: the collection, card 1, card 0, then any other."
  [ingestable]
  (let [rank {coll-eid 0 (card-eid 1) 1 (card-eid 0) 2}]
    (reify serialization/Ingestable
      (ingest-list [_] (sort-by #(rank (:id (last %)) 3) (serialization/ingest-list ingestable)))
      (ingest-one [_ path] (serialization/ingest-one ingestable path))
      (ingest-errors [_] (serialization/ingest-errors ingestable)))))

(defn- not-found-error
  "The message of the load error `e` and the entity ID of the entity whose dependency was not found."
  [e]
  (when e
    [(ex-message e) (-> e ex-data :referrer :id)]))

(deftest dependency-with-a-missing-dependency-fails-the-load-test
  (testing "Card 0 is in the files and in the app DB, and its file names a source card that does not exist. Card 1 is
            based on card 0 and comes before it in load order."
    (doseq [continue-on-error [false true]]
      (testing (format "continue-on-error %s" continue-on-error)
        (try
          (serdes/with-cache
            (serialization/load-metabase! (ingestable (dependency-files)) :reindex? false))
          (let [result   (try
                           (serdes/with-cache
                             (serialization/load-metabase! (dependent-first (ingestable (dependency-files :missing-source? true)))
                                                           :reindex? false
                                                           :continue-on-error continue-on-error))
                           (catch Exception e
                             {:thrown e}))
                expected [(format "Card '%s' was not found" missing-card-eid) (card-eid 0)]]
            (if continue-on-error
              (testing "the load records the error of card 0"
                (is (= [expected] (map not-found-error (:errors result)))))
              (testing "the load stops at card 0 with the error of its missing source card"
                (is (= expected (not-found-error (:thrown result)))))))
          (finally
            (delete-content!)))))))

(deftest dependency-with-a-missing-dependency-fails-the-pull-test
  (testing "A forced remote-sync pull in which card 0 names a source card that does not exist, and card 1, based on card
            0, comes before card 0 in load order, fails and leaves card 0 and the last version as they were"
    (search.tu/with-index-disabled
      (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms false]
        (try
          (let [src   (rs.test/versioned-source :trees {"v0" (dependency-files)
                                                        "v1" (dependency-files :missing-source? true)}
                                                :current "v0")
                load! (mt/original-fn #'serialization/load-metabase!)]
            (is (= :success (:status (rs.test/import-at! src "v0" :force? true))) "baseline pull")
            (is (= :error (:status (mt/with-dynamic-fn-redefs [serialization/load-metabase!
                                                               (fn [ingestable & opts]
                                                                 (apply load! (dependent-first ingestable) opts))]
                                     (rs.test/import-at! src "v1" :force? true)))))
            (is (t2/exists? :model/Card :entity_id (card-eid 0)) "card 0 is not deleted")
            (is (= "v0" (remote-sync.task/last-version))))
          (finally
            (delete-content!)))))))

(defn- break-connection-on-load-of!
  "Runs `thunk`. When the load of the entity with entity ID `entity-id` starts to write, it first closes the physical
  app-DB connection that it writes on, as when the server ends the connection."
  [entity-id thunk]
  (let [load-one! serdes/load-one!]
    ;; `with-redefs`: `serdes/load-one!` is a multimethod
    (with-redefs [serdes/load-one! (fn [ingested local]
                                     (when (= entity-id (:entity_id ingested))
                                       (t2/with-connection [^Connection conn]
                                         (.close ^Connection (.unwrap conn Connection))))
                                     (load-one! ingested local))]
      (thunk))))

(deftest broken-connection-fails-only-its-entity-test
  (testing "The app-DB connection breaks during the load of one card, continue-on-error true: the load records the
            error of that card and loads every other card"
    (let [bad (nth (card-load-order (files)) (quot n-cards 2))]
      (try
        (let [result (break-connection-on-load-of!
                      (card-eid bad)
                      #(try
                         (serdes/with-cache
                           (serialization/load-metabase! (ingestable (files)) :reindex? false :continue-on-error true))
                         (catch Exception e
                           {:thrown e})))]
          (is (nil? (some-> (:thrown result) ex-message)))
          (is (= [(card-eid bad)] (map failed-card-eid (:errors result))))
          (is (= (disj (into #{} (map card-eid) (range n-cards)) (card-eid bad))
                 (loaded-cards))))
        (finally
          (delete-content!))))))

;;; ----------------------------------- the held connection (rule L6) -----------------------------------

(defn- busy-connections
  "The number of connections that are checked out of the app-DB pool now."
  ^long []
  (let [ds (mdb/data-source)]
    (assert (instance? PoolBackedDataSource ds) (str "The app DB data source is not a c3p0 pool: " (type ds)))
    (.getNumBusyConnectionsAllUsers ^PoolBackedDataSource ds)))

(defn- busy-connections-when
  "The pool's busy count once it equals `expected`, or after 5 s. Another thread can hold a connection for a moment."
  ^long [^long expected]
  (loop [waited-ms 0]
    (let [n (busy-connections)]
      (if (or (= expected n) (>= waited-ms 5000))
        n
        (do (Thread/sleep 50)
            (recur (+ waited-ms 50)))))))

(defn- busy-counts
  "Runs `(scenario hook)`. The scenario calls `(hook n path)` on each file read of its load. Returns the scenario's
  result and the pool's busy count before, at the file reads (the highest), and after."
  [scenario]
  (let [before (busy-connections-when 0)
        during (atom 0)
        result (scenario (fn [_ _] (swap! during max (busy-connections))))]
    {:result result
     :before before
     :during @during
     :after  (busy-connections-when before)}))

(defn- direct-load!
  "A scenario for [[busy-counts]]: a direct load of `files`. Returns `:loaded`, or `:threw` when the load threw."
  [files & {:keys [continue-on-error]}]
  (fn [hook]
    (try
      (serdes/with-cache
        (serialization/load-metabase! (on-read (ingestable files) hook)
                                      :reindex? false
                                      :continue-on-error continue-on-error))
      :loaded
      (catch Exception _
        :threw))))

(defn- cancel-on-another-thread!
  "Cancels the remote-sync task `task-id` on a new thread that conveys no bindings, as the cancel API does, and waits
  for it."
  [task-id]
  (doto (Thread. ^Runnable (fn [] (remote-sync.task/cancel-sync-task! task-id)))
    (.start)
    (.join 10000)))

(defn- cancelled-pull!
  "A scenario for [[busy-counts]]: a forced remote-sync pull of [[files]] on this thread. Before the 3rd file read,
  another thread cancels the task. Every progress report writes and so checks for a cancel, so the progress report of
  that read stops the pull. Returns the result of `impl/import!` (nil for a cancelled pull)."
  [hook]
  (let [task-id  (:id (remote-sync.task/create-sync-task! "import" (mt/user->id :rasta)))
        src      (rs.test/versioned-source :trees {"v0" (files)} :current "v0")
        load!    (mt/original-fn #'serialization/load-metabase!)
        reporter (mt/original-fn #'remote-sync.task/make-progress-reporter)]
    (mt/with-dynamic-fn-redefs [remote-sync.task/make-progress-reporter
                                (fn
                                  ([task-id] (reporter task-id {:throttle-ms 0}))
                                  ([task-id opts] (reporter task-id (assoc opts :throttle-ms 0))))
                                serialization/load-metabase!
                                (fn [ingestable & opts]
                                  (apply load!
                                         (on-read ingestable (fn [n path]
                                                               (when (= 3 n)
                                                                 (cancel-on-another-thread! task-id))
                                                               (hook n path)))
                                         opts))]
      (impl/import! (source.p/snapshot-at src "v0") task-id :force? true))))

(deftest load-returns-its-connection-test
  (search.tu/with-index-disabled
    (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms false]
      (let [bad (nth (card-load-order (files)) (quot n-cards 2))]
        (doseq [[label scenario expected] [["a load that succeeds" (direct-load! (files)) :loaded]
                                           ["a load that fails" (direct-load! (files :bad #{bad})) :threw]
                                           ["a load that skips an error"
                                            (direct-load! (files :bad #{bad}) :continue-on-error true) :loaded]
                                           ["a remote-sync pull that is cancelled during its load" cancelled-pull! nil]]]
          (testing (str label ": the pool's busy count after the load is the same as before it")
            (try
              (let [{:keys [result before during after]} (busy-counts scenario)]
                (is (= expected result))
                (is (< before during) "the load holds a connection while it reads its files")
                (is (= before after)))
              (finally
                (delete-content!)))))))))

(defn- with-unreturned-connection-timeout
  "Runs `thunk` with the app DB bound to a new pool of the app DB's connections, with the app DB's pool properties
  except that the pool destroys a connection that is checked out for longer than `seconds`."
  [seconds thunk]
  (let [unpooled (.getNestedDataSource ^WrapperConnectionPoolDataSource
                  (.getConnectionPoolDataSource ^PoolBackedDataSource (mdb/data-source)))
        pool     (mdb.connection-pool-setup/connection-pool-data-source
                  (mdb/db-type) unpooled {"unreturnedConnectionTimeout" seconds})]
    (try
      (binding [mdb.connection/*application-db* (mdb.connection/application-db (mdb/db-type) pool)]
        (thunk))
      (finally
        (DataSources/destroy pool)))))

(deftest load-outlasts-the-unreturned-connection-timeout-test
  (testing "A load that takes longer than the pool's unreturned-connection timeout, but no entity of which keeps a
            connection that long, loads every card"
    (try
      (let [result (with-unreturned-connection-timeout
                     1
                     #(try
                        (serdes/with-cache
                          (serialization/load-metabase! (on-read (ingestable (files)) (fn [_ _] (Thread/sleep 250)))
                                                        :reindex? false))
                        :loaded
                        (catch Exception e
                          (ex-message e))))]
        (is (= :loaded result))
        (is (= (into #{} (map card-eid) (range n-cards)) (loaded-cards))))
      (finally
        (delete-content!)))))

(def ^:private dash-eid-prefix "loadconnectiondash")

(defn- dash-eid [i]
  (format "%s%03d" dash-eid-prefix i))

(defn- dashcard-eid [dash i]
  (format "loadconnectiondc%02d%03d" dash i))

(def ^:private dashboard-question 100)

(defn- mixed-files
  "A remote-synced collection with 3 questions, 2 dashboards with a dashboard card on each question, and a dashboard
  question on the first dashboard, as a map of path to YAML. A dashboard question and its dashboard depend on each
  other, so a load reads one of their files twice."
  []
  (let [questions (range 3)]
    (into {(str coll-dir "/load_connection.yaml")
           (rs.test/generate-collection-yaml coll-eid "Load connection" :is-remote-synced true)

           (format "%s/card_%03d.yaml" coll-dir dashboard-question)
           (str/replace (rs.test/generate-card-yaml (card-eid dashboard-question) "Dashboard question" coll-eid)
                        "dashboard_id: null"
                        (str "dashboard_id: " (dash-eid 0)))}
          (concat
           (for [i questions]
             [(format "%s/card_%03d.yaml" coll-dir i)
              (rs.test/generate-card-yaml (card-eid i) (str "Question " i) coll-eid)])
           (for [d (range 2)
                 :let [card-ids (cond-> (vec questions)
                                  (zero? d) (conj dashboard-question))]]
             [(format "%s/dashboard_%03d.yaml" coll-dir d)
              (rs.test/generate-dashboard-yaml (dash-eid d) (str "Dashboard " d) coll-eid
                                               :dashcards (for [i card-ids]
                                                            {:entity_id (dashcard-eid d i)
                                                             :card_id   (card-eid i)}))])))))

(deftest load-uses-the-app-db-only-on-its-thread-test
  (testing "During the load of a remote-sync pull of questions, dashboards, a dashboard question and a collection, only
            the load thread sends statements to the app DB. A thread that conveys bindings would use the held
            connection."
    (search.tu/with-index-disabled
      (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms false]
        (try
          (let [src      (rs.test/versioned-source :trees {"v0" (mixed-files)} :current "v0")
                load!    (mt/original-fn #'serialization/load-metabase!)
                activity (atom nil)]
            (mt/with-dynamic-fn-redefs [serialization/load-metabase!
                                        (fn [ingestable & opts]
                                          (let [counts (activity/count-db-activity! #(apply load! ingestable opts))]
                                            (reset! activity (assoc counts :load-thread (.threadId (Thread/currentThread))))
                                            (:result counts)))]
              (is (= :success (:status (rs.test/import-at! src "v0" :force? true)))))
            (is (= 1 (t2/count :model/Card :entity_id (card-eid dashboard-question) :dashboard_id [:not= nil]))
                "the dashboard question is loaded into its dashboard")
            (let [{:keys [load-thread by-thread statements]} @activity]
              (is (pos? statements))
              (is (= #{load-thread}
                     (into #{} (keep (fn [[thread counts]] (when (pos? (:statements counts)) thread))) by-thread))
                  (pr-str by-thread))))
          (finally
            (t2/delete! :model/Dashboard :entity_id [:like (str dash-eid-prefix "%")])
            (delete-content!)))))))

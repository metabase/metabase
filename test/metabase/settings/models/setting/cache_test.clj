(ns metabase.settings.models.setting.cache-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.env :as mdb.env]
   [metabase.app-db.setting :as mdb.setting]
   [metabase.app-db.test-util :as mdb.test-util]
   [metabase.search.test-util :as search.tu]
   [metabase.settings.db :as settings.db]
   [metabase.settings.models.setting-test :as setting-test]
   [metabase.settings.models.setting.cache :as setting.cache]
   [metabase.system.core :as system]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;;; --------------------------------------------- Cache Synchronization ----------------------------------------------

(defn clear-cache! []
  (reset! (#'setting.cache/cache*) nil))

(defn- settings-last-updated-value-in-cache []
  (get (setting.cache/cache) setting.cache/settings-last-updated-key))

(defn- update-settings-last-updated-value-in-db!
  "Simulate a different instance updating the value of `settings-last-updated` in the DB by updating its value without
  updating our locally cached value.

  Written raw, and to both columns, exactly as
  [[metabase.settings.models.setting.cache/update-settings-last-updated!]] writes them -- through `:model/Setting` the
  query below would end up inside the JSON envelope rather than being evaluated."
  []
  (let [ts (-> (t2/query-one
                {:select [[(let [db-type          (mdb/db-type)
                                 now-form         (h2x/current-datetime-honeysql-form db-type)
                                 target-cast-type (case db-type
                                                    (:h2 :postgres) :text
                                                    :mysql          :char)]
                             [:cast
                              ;; make it one second in the future so we don't end up getting an exact match when we try
                              ;; to test to see if things update below
                              (h2x/add-interval-honeysql-form db-type now-form 1 :second)
                              target-cast-type])
                           :timestamp]]})
               :timestamp)]
    (t2/update! :setting {:key setting.cache/settings-last-updated-key}
                {:value          ts
                 :value_with_aad (encryption/maybe-encrypt ts {:aad (mdb.setting/setting-aad setting.cache/settings-last-updated-key)})})))

(defn- simulate-another-instance-updating-setting! [setting-name new-value]
  (if new-value
    (t2/update! :model/Setting {:key (name setting-name)} {:value new-value})
    (t2/delete! (t2/table-name :model/Setting) {:key (name setting-name)}))
  (update-settings-last-updated-value-in-db!))

(defn reset-last-update-check!
  "Reset the value of `last-update-check` so the next cache access will check for updates."
  []
  (.set ^java.util.concurrent.atomic.AtomicLong (:last-update-check (setting.cache/current-state)) 0))

(deftest update-settings-last-updated-test
  (testing "When I update a Setting, does it set/update `settings-last-updated`?"
    (setting-test/clear-settings-last-updated-value-in-db!)
    (setting-test/toucan-name! "Bird Can")
    (is (string? (setting-test/settings-last-updated-value-in-db)))
    (testing "...and is the value updated in the cache as well?"
      (is (string? (settings-last-updated-value-in-cache))))
    (testing "..and if I update it again, will the value be updated?"
      (let [first-value (setting-test/settings-last-updated-value-in-db)]
        ;; the second marker must differ from the first
        (Thread/sleep 50)
        (setting-test/toucan-name! "Bird Can")
        (let [second-value (setting-test/settings-last-updated-value-in-db)]
          (is (not= first-value second-value)))))))

;;; Another instance is a connection of its own, outside this instance's pool, writing rows the way
;;; [[setting.cache/update-settings-last-updated!]] and a setting write do.

(defn- open-another-instance-connection
  ^java.sql.Connection []
  (.getConnection mdb.env/data-source))

(defn- write-as-another-instance!
  "Writes `settings`, a map of key to string value, on `conn`, then the marker: `marker` if given, else the app DB's
  timestamp as `conn` renders it. Returns the marker."
  [^java.sql.Connection conn settings & [marker]]
  (t2/with-connection [_ conn]
    (let [marker (or marker (settings.db/current-timestamp-string))]
      (doseq [[k v] (concat settings [[setting.cache/settings-last-updated-key marker]])]
        (let [v-with-aad (encryption/maybe-encrypt v {:aad (mdb.setting/setting-aad k)})]
          (when (zero? (settings.db/update-raw-setting-row! k v v-with-aad))
            (settings.db/insert-raw-setting-row! k v v-with-aad))))
      marker)))

(defn- force-check-and-read-test-setting-1! []
  (setting.cache/restore-cache-if-needed! :force-check? true)
  (setting-test/test-setting-1))

(deftest marker-that-sorts-lower-is-a-change-test
  (testing "another instance's write is seen even when its marker sorts below the one this cache holds"
    (mt/discard-setting-changes [test-setting-1]
      (setting-test/test-setting-1! "this instance")
      (with-open [conn (open-another-instance-connection)]
        (let [cached-marker (setting.cache/cached-marker)
              marker        (write-as-another-instance! conn
                                                        {"test-setting-1" "another instance"}
                                                        "2000-01-01 00:00:00")]
          (is (neg? (compare marker cached-marker)) "premise: the other instance's marker sorts lower")
          (is (= "another instance" (force-check-and-read-test-setting-1!))))))))

(deftest first-marker-is-a-change-test
  (testing "a cache loaded while no marker was stored sees another instance's write of the first marker"
    (mt/discard-setting-changes [test-setting-1]
      (setting-test/test-setting-1! "this instance")
      (setting-test/clear-settings-last-updated-value-in-db!)
      (setting.cache/restore-cache!)
      (is (nil? (setting.cache/cached-marker)) "premise: the cache holds no marker")
      (with-open [conn (open-another-instance-connection)]
        (write-as-another-instance! conn {"test-setting-1" "another instance"}))
      (is (= "another instance" (force-check-and-read-test-setting-1!))))))

(deftest marker-write-reloads-what-others-committed-test
  (testing "after this instance writes the marker, its cache holds every write committed before then"
    (mt/discard-setting-changes [test-setting-1]
      (setting-test/test-setting-1! "this instance")
      (setting.cache/restore-cache!)
      ;; Another instance commits after this cache was loaded and before this instance writes the marker. A marker
      ;; write that waits for the other instance's lock on the marker row runs in this order.
      (with-open [conn (open-another-instance-connection)]
        (write-as-another-instance! conn {"test-setting-1" "another instance"}))
      (setting.cache/update-settings-last-updated!)
      (is (= "another instance" (force-check-and-read-test-setting-1!))))))

(deftest marker-from-an-earlier-transaction-start-is-a-change-test
  (testing "another instance's marker is a change even when its transaction began before this instance's write"
    (mt/discard-setting-changes [test-setting-1 test-setting-2]
      (setting-test/test-setting-1! "this instance")
      (with-open [conn (open-another-instance-connection)]
        (.setAutoCommit conn false)
        (try
          ;; Starts the transaction: on Postgres and H2 its `now()` is the time it began.
          (t2/with-connection [_ conn]
            (settings.db/current-timestamp-string))
          (Thread/sleep 10)
          (setting-test/test-setting-2! "this instance, later")
          (write-as-another-instance! conn {"test-setting-1" "another instance"})
          (.commit conn)
          (finally
            (.rollback conn))))
      (is (= "another instance" (force-check-and-read-test-setting-1!))))))

(deftest marker-in-another-session-time-zone-is-a-change-test
  (when (= :postgres (mdb/db-type))
    (testing "another instance's write is seen when its app DB session's time zone is west of this one's"
      (mt/discard-setting-changes [test-setting-1]
        (setting-test/test-setting-1! "this instance")
        (with-open [conn (open-another-instance-connection)]
          ;; pgjdbc gives a session its JVM's default zone, so this is the session of an instance whose JVM runs in
          ;; this zone. The westernmost zone renders the lowest wall time, whatever this instance's zone is.
          (t2/with-connection [_ conn]
            (t2/query ["SET TIME ZONE 'Etc/GMT+12'"]))
          (let [cached-marker (setting.cache/cached-marker)
                marker        (write-as-another-instance! conn {"test-setting-1" "another instance"})]
            (is (neg? (compare marker cached-marker)) "premise: the other instance's marker sorts lower")
            (is (= "another instance" (force-check-and-read-test-setting-1!)))))))))

(deftest rolled-back-write-is-undone-in-the-cache-test
  (testing "a write rolled back by its caller's transaction is gone from the cache after the next check"
    (mt/discard-setting-changes [test-setting-1]
      (setting-test/test-setting-1! "committed")
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"roll back"
                            (t2/with-transaction [_conn]
                              (setting-test/test-setting-1! "rolled back")
                              (testing "inside the transaction, the write's reload of the cache sees the write"
                                (is (= "rolled back" (setting-test/test-setting-1))))
                              (throw (ex-info "roll back" {})))))
      (is (= "committed" (force-check-and-read-test-setting-1!))))))

(deftest nested-rolled-back-write-is-undone-in-the-cache-test
  (testing "a write rolled back by a nested scope is gone from the cache while the enclosing transaction goes on"
    (mt/discard-setting-changes [test-setting-1]
      (setting-test/test-setting-1! "committed")
      (t2/with-transaction [_conn]
        (setting-test/test-setting-1! "outer")
        (t2/with-transaction [_conn nil {:rollback-only true}]
          (setting-test/test-setting-1! "nested"))
        (is (= "outer" (setting-test/test-setting-1)))))))

(deftest write-in-with-temp-is-undone-in-the-cache-test
  (testing "a write inside `mt/with-temp`, which rolls back, is gone from the cache after the next check"
    (mt/discard-setting-changes [test-setting-1]
      (setting-test/test-setting-1! "committed")
      (mt/with-temp [:model/Card _ {}]
        (setting-test/test-setting-1! "in with-temp"))
      (is (= "committed" (setting-test/test-setting-1))))))

(deftest cache-out-of-date-test
  (testing "If there is no cache, it should be considered out of date!"
    (clear-cache!)
    (#'setting.cache/cache-out-of-date?))
  (testing "But if I set a setting, it should cause the cache to be populated, and be up-to-date"
    (clear-cache!)
    (setting-test/toucan-name! "Reggae Toucan")
    (is (= false
           (#'setting.cache/cache-out-of-date?))))
  (testing "If another instance updates a Setting, `cache-out-of-date?` should return `true` based on DB comparisons..."
    (clear-cache!)
    (setting-test/toucan-name! "Reggae Toucan")
    (simulate-another-instance-updating-setting! :toucan-name "Bird Can")
    (is (true?
         (#'setting.cache/cache-out-of-date?)))))

(deftest restore-cache-if-needed-test
  (testing (str "of course, `restore-cache-if-needed!` should use TTL memoization, and the cache should not get "
                "updated right away even if another instance updates a value...")
    (reset-last-update-check!)
    (clear-cache!)
    (setting-test/toucan-name! "Sam")
    ;; should restore cache, and put in {"setting-test/toucan-name" "Sam"}
    (is (= "Sam"
           (setting-test/toucan-name)))
    ;; now have another instance change the value
    (simulate-another-instance-updating-setting! :toucan-name "Bird Can")
    ;; our cache should not be updated yet because it's on a TTL
    (is (= "Sam"
           (setting-test/toucan-name)))))

;; ...and when it comes time to check our cache for updating (when calling `restore-cache-if-needed!`, it should get
;; the updated value. (we're not actually going to wait a minute for the memoized values of `should-restore-cache?` to
;; be invalidated, so we will manually flush the memoization cache to simulate it happening)
(deftest sync-test-1
  (clear-cache!)
  (setting-test/toucan-name! "Reggae Toucan")
  (simulate-another-instance-updating-setting! :toucan-name "Bird Can")
  (is (= "Bird Can"
         (t2/select-one-fn :value :model/Setting :key "toucan-name")))
  (reset-last-update-check!)
  ;; calling `setting-test/toucan-name` will call `restore-cache-if-needed!`, which will in turn call `should-restore-cache?`.
  ;; Since memoized value is no longer present, this should call `cache-out-of-date?`, which checks the DB; it will
  ;; detect a cache out-of-date situation and flush the cache as appropriate, giving us the updated value when we
  ;; call! :wow:
  (is (= "Bird Can"
         (setting-test/toucan-name))))

;; Simulate experience where:
;; 1. User writes a setting on Server 1
;; 2. User reads settings, served from Server 1, memoizing theresult of should-restore-cache?
;; 3. User writes setting :toucan-name on Server 2
;; 4. User writes setting on Server 1
;; 5. User reads setting :toucan-name from Server 1
;;
;; This process was causing the updated `:toucan-name` to never be read on Server 1 because Server 1 "thought" it had
;; the latest values and didn't restore the cache from the db
(deftest sync-test-2
  (let [external-cache (constantly (atom nil))]
    (clear-cache!)
    (reset-last-update-check!)
    (setting-test/test-setting-1! "Starfish")
    ;; 1. User writes
    (mt/with-dynamic-fn-redefs [setting.cache/cache* external-cache]
      (setting-test/toucan-name! "Batman Toucan"))
    (setting-test/test-setting-1! "Batman")
    (is (= "Batman Toucan"
           (setting-test/toucan-name)))))

(deftest sync-test-3
  ;; On Postgres a `site-locale` change reindexes search in a future that reads settings; if that future holds the
  ;; restore lock when the read below runs, the read skips the restore and returns the stale "en".
  (search.tu/with-sync-search-indexing
    (mt/discard-setting-changes [site-locale]
      (clear-cache!)
      (system/site-locale! "en")
      (simulate-another-instance-updating-setting! :site-locale "fr")
      (reset-last-update-check!)
      (is (= "fr"
             (system/site-locale))))))

(deftest per-app-db-cache-test
  (testing "settings caches are per app-DB id: another id gets its own, and a copy with the root's id shares it"
    (let [root-cache (#'setting.cache/cache*)
          own-cache? (fn [app-db]
                       (mdb/with-application-db app-db
                         (not (identical? root-cache (#'setting.cache/cache*)))))]
      (is (= {:other-id-has-own-cache? true
              :same-id-has-own-cache?  false
              :root-cache-kept?        true}
             {:other-id-has-own-cache? (own-cache? (assoc (mdb/app-db) :id Integer/MAX_VALUE))
              :same-id-has-own-cache?  (own-cache? (assoc (mdb/app-db) ::copy true))
              :root-cache-kept?        (identical? root-cache (#'setting.cache/cache*))})))))

(deftest ^:synchronized app-db-id-bump-flushes-cache-test
  (testing "bumping the root app DB's id gives a thread with no bindings a fresh settings cache"
    (mdb.test-util/with-application-db-as-root (mdb/app-db)
      (let [before  (#'setting.cache/cache*)
            _       (mdb/increment-app-db-unique-indentifier!)
            seen    (promise)
            unbound (Thread. ^Runnable (fn []
                                         (deliver seen (try
                                                         (#'setting.cache/cache*)
                                                         (catch Throwable e
                                                           e)))))]
        (.start unbound)
        (let [seen-cache (deref seen 10000 ::timed-out)]
          (testing "the thread finished, did not throw, and saw a new cache"
            (is (not (or (= ::timed-out seen-cache)
                         (instance? Throwable seen-cache)
                         (identical? before seen-cache))))))))))

(deftest write-across-app-db-id-bump-test
  (testing "a write whose app DB gets a new id after the cache restore is read back through the new id's cache"
    (mt/discard-setting-changes [test-setting-1]
      ;; a fresh id, so the bump below changes only this binding
      (mdb/with-application-db (assoc (mdb/app-db) :id (- (inc (rand-int Integer/MAX_VALUE))))
        (setting-test/test-setting-1! "before the bump")
        ;; a read sets the update-check clock, so the write's own reads do not restore the cache before it does
        (setting-test/test-setting-1)
        (let [restore! (mt/original-fn #'setting.cache/restore-cache!)
              bumped?  (atom false)]
          (mt/with-dynamic-fn-redefs [setting.cache/restore-cache! (fn [& args]
                                                                     (u/prog1 (apply restore! args)
                                                                       (when (compare-and-set! bumped? false true)
                                                                         (mdb/increment-app-db-unique-indentifier!))))]
            (setting-test/test-setting-1! "after the bump"))
          (is (= {:bumped? true, :value "after the bump"}
                 {:bumped? @bumped?, :value (setting-test/test-setting-1)})))))))

(deftest write-to-an-unloaded-cache-test
  (testing "a write to a state whose cache is not loaded yet leaves it unloaded, so the next read restores all of it"
    (let [state ((var-get #'setting.cache/new-state))]
      (mt/with-dynamic-fn-redefs [setting.cache/current-state (constantly state)]
        (setting.cache/update-cache! "test-setting-1" "written"))
      (is (nil? @(:cache state))))))

(deftest restore-uses-the-state-it-checked-test
  (testing "a restore fills the cache whose clock and lock it checked, even if the state this thread sees changes"
    (let [new-state #'setting.cache/new-state
          checked   (new-state)
          calls     (atom 0)]
      ;; Only the first state is checked: the restore's own settings reads, such as the encryption settings, also see
      ;; the later states and may fill them.
      (mt/with-dynamic-fn-redefs [setting.cache/current-state #(if (= 1 (swap! calls inc)) checked (new-state))]
        (setting.cache/restore-cache-if-needed! :force-check? true))
      (is (some? @(:cache checked))))))

(deftest per-app-db-clock-and-lock-test
  (testing "each app DB has its own update-check clock and restore lock"
    (let [{:keys [last-update-check ^java.util.concurrent.locks.ReentrantLock restore-lock]} (setting.cache/current-state)
          ;; a fresh id, so the other app DB's state is new and its cache empty
          other-app-db (assoc (mdb/app-db) :id (- (inc (rand-int Integer/MAX_VALUE))))]
      (reset-last-update-check!)
      (.lock restore-lock)
      (try
        (let [reloaded? (mdb/with-application-db other-app-db
                          (setting.cache/restore-cache-if-needed! :force-check? true))]
          (is (= {:other-app-db-reloaded? true
                  :root-check-due?        true}
                 {:other-app-db-reloaded? (boolean reloaded?)
                  :root-check-due?        (#'setting.cache/time-for-another-update-check? last-update-check)})))
        (finally
          (.unlock restore-lock))))))

(deftest in-transaction-write-survives-concurrent-check-test
  (testing "a write committed by its caller's transaction is in the cache, even after another thread checked the cache
           while the write was uncommitted"
    (mt/discard-setting-changes [test-setting-1]
      (setting-test/test-setting-1! "before")
      (t2/with-transaction [_conn]
        (setting-test/test-setting-1! "after")
        ;; A plain Thread, so that the check runs on a connection of its own: `future` conveys this transaction's.
        (doto (Thread. (fn [] (setting.cache/restore-cache-if-needed! :force-check? true)))
          .start
          (.join 10000)))
      (is (= "after" (setting-test/test-setting-1))))))

(deftest another-threads-check-keeps-an-uncommitted-write-test
  (testing "while a write is uncommitted, another thread's check does not revert the shared cache to the committed values"
    ;; A revert fires the `:on-change` handlers of the reverted settings, and again when the next check restores the
    ;; write: for `report-timezone`, each one closes every database's connection pool.
    (mt/discard-setting-changes [test-setting-1]
      (setting-test/test-setting-1! "before")
      (t2/with-transaction [_conn]
        (setting-test/test-setting-1! "after")
        (let [reloaded? (atom ::not-run)]
          ;; A plain Thread, so that the check runs on a connection of its own: `future` conveys this transaction's.
          (doto (Thread. #(reset! reloaded? (setting.cache/restore-cache-if-needed! :force-check? true)))
            .start
            (.join 10000))
          (is (not= ::not-run @reloaded?) "premise: the other thread's check ran")
          (is (= "after" (get (setting.cache/cache) "test-setting-1"))))))))

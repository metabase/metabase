(ns metabase.search.lease-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.analytics-interface.core :as analytics]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.schema-migrations-test.impl :as migrations.impl]
   [metabase.search.core :as search]
   [metabase.search.db :as search.db]
   [metabase.search.deadline :as deadline]
   [metabase.search.engine :as search.engine]
   [metabase.search.lease :as lease]
   [metabase.search.models.search-index-metadata :as search-index-metadata]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
   [metabase.util.i18n :as i18n]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent CountDownLatch TimeUnit)
   (java.util.concurrent.locks ReentrantReadWriteLock)))

(set! *warn-on-reflection* true)

(defn- with-current-schema! [f]
  (if (= :h2 (mdb/db-type))
    (mt/with-empty-h2-app-db!
      (f))
    (migrations.impl/with-temp-empty-app-db [_conn (mdb/db-type)]
      (mdb/setup-db! :create-sample-content? false)
      (f))))

;; These tests exercise a new table, so isolate them in an app DB migrated from the current changelog.
#_{:clj-kondo/ignore [:metabase/validate-deftest]}
(use-fixtures :once with-current-schema!)

(defn- coordinate []
  {:engine "appdb", :version (str (random-uuid)), :lang_code "en"})

(defn- delete-coordinate! [{:keys [engine version lang_code]}]
  (t2/delete! :search_index_lease :engine engine :version version :lang_code lang_code))

(deftest acquire-release-and-coordinate-granularity-test
  (let [coordinate-a (coordinate)
        coordinate-b (assoc coordinate-a :engine "semantic")]
    (try
      (let [claim-a (lease/try-acquire! coordinate-a)
            claim-b (lease/try-acquire! coordinate-b)]
        (is (some? claim-a) "the first caller acquires a coordinate")
        (is (every? some? ((juxt :acquired_at :last_renewed_at :expires_at) claim-a)))
        (is (nil? (lease/try-acquire! coordinate-a)) "a live lease excludes the same coordinate")
        (is (some? claim-b) "a different engine does not contend")
        (is (false? (lease/release! (assoc claim-a :owner (str (random-uuid)))))
            "a non-owner cannot release the lease")
        (is (true? (lease/release! claim-a)))
        (is (some? (lease/try-acquire! coordinate-a)) "release makes the coordinate immediately available"))
      (finally
        (delete-coordinate! coordinate-a)
        (delete-coordinate! coordinate-b)))))

(deftest expired-lease-can-be-reclaimed-test
  (let [coordinate (coordinate)]
    (try
      (let [first-claim (lease/try-acquire! coordinate)]
        (t2/update! :search_index_lease
                    {:engine    (:engine first-claim)
                     :version   (:version first-claim)
                     :lang_code (:lang_code first-claim)}
                    {:expires_at (t/minus (t/offset-date-time) (t/minutes 1))})
        (let [replacement (lease/try-acquire! coordinate)]
          (is (some? replacement))
          (is (not= (:owner first-claim) (:owner replacement)))
          (is (false? (lease/renew! first-claim)) "the expired owner cannot renew after takeover")
          (is (false? (lease/release! first-claim)) "the expired owner cannot release the replacement")
          (is (true? (lease/release! replacement)))))
      (finally
        (delete-coordinate! coordinate)))))

(deftest acquisition-collects-unrelated-expired-leases-test
  (let [expired-coordinate (coordinate)
        new-coordinate     (coordinate)]
    (try
      (let [expired-claim (lease/try-acquire! expired-coordinate)]
        (t2/update! :search_index_lease
                    {:engine    (:engine expired-claim)
                     :version   (:version expired-claim)
                     :lang_code (:lang_code expired-claim)}
                    {:expires_at (t/minus (t/offset-date-time) (t/minutes 1))})
        (is (:acquired? (lease/do-with-lease new-coordinate (constantly :done))))
        (is (nil? (t2/select-one :search_index_lease
                                 :engine (:engine expired-coordinate)
                                 :version (:version expired-coordinate)
                                 :lang_code (:lang_code expired-coordinate)))
            "the bounded pre-acquisition collection removes abandoned coordinates"))
      (finally
        (delete-coordinate! expired-coordinate)
        (delete-coordinate! new-coordinate)))))

(deftest do-with-lease-test
  (let [coordinate (coordinate)]
    (try
      (testing "the body runs and the lease is released"
        (is (= {:acquired? true, :result :done}
               (lease/do-with-lease coordinate (constantly :done))))
        (is (nil? (t2/select-one :search_index_lease
                                 :engine (:engine coordinate)
                                 :version (:version coordinate)
                                 :lang_code (:lang_code coordinate)))))
      (testing "the body is skipped while another owner holds the lease"
        (let [claim (lease/try-acquire! coordinate)
              ran?  (atom false)]
          (is (= {:acquired? false}
                 (lease/do-with-lease coordinate #(reset! ran? true) {:wait? false})))
          (is (false? @ran?))
          (lease/release! claim)))
      (testing "the lease is released when the body throws"
        (is (thrown-with-msg? Exception #"boom"
                              (lease/do-with-lease coordinate #(throw (Exception. "boom")))))
        (is (some? (lease/try-acquire! coordinate))))
      (finally
        (delete-coordinate! coordinate)))))

(deftest busy-lease-waits-without-skipping-work-test
  (let [coordinate (coordinate)
        first-claim (lease/try-acquire! coordinate)
        ran?        (promise)
        waiter      (binding [lease/*acquire-retry-interval-ms* 5]
                      (future (lease/do-with-lease coordinate (fn [] (deliver ran? true) true))))]
    (try
      (is (= ::waiting (deref ran? 50 ::waiting)))
      (lease/release! first-claim)
      (is (= {:acquired? true, :result true} (deref waiter 5000 ::timed-out)))
      (finally
        (future-cancel waiter)
        (delete-coordinate! coordinate)))))

(deftest busy-lease-wait-gives-up-after-timeout-test
  (let [coordinate  (coordinate)
        first-claim (lease/try-acquire! coordinate)]
    (try
      (binding [lease/*acquire-retry-interval-ms* 5
                lease/*acquire-timeout-ms*        50]
        (is (= {:acquired? false}
               (lease/do-with-lease coordinate (fn [] (throw (ex-info "should not run" {})))))))
      (finally
        (lease/release! first-claim)
        (delete-coordinate! coordinate)))))

(deftest persistent-heartbeat-errors-eventually-stop-local-work-test
  (let [coordinate (coordinate)]
    (try
      (binding [lease/*lease-duration* (t/millis 40)
                lease/*heartbeat-interval-ms* 5]
        (mt/with-dynamic-fn-redefs [lease/renew! (fn [_claim] (throw (Exception. "db unavailable")))]
          (is (thrown-with-msg?
               Exception
               #"lease was lost"
               (lease/do-with-lease
                coordinate
                (fn []
                  (tu/poll-until 5000 @(:lost? lease/*lease-context*))
                  (lease/throw-if-lost!)))))))
      (finally
        (delete-coordinate! coordinate)))))

(deftest analytics-failure-cannot-leak-lease-test
  (let [coordinate (coordinate)]
    (try
      (mt/with-dynamic-fn-redefs [analytics/inc! (fn [& _] (throw (Exception. "metrics unavailable")))
                                  analytics/observe! (fn [& _] (throw (Exception. "metrics unavailable")))]
        (is (= {:acquired? true, :result :done}
               (lease/do-with-lease coordinate (constantly :done)))))
      (is (nil? (t2/select-one :search_index_lease
                               :engine (:engine coordinate)
                               :version (:version coordinate)
                               :lang_code (:lang_code coordinate))))
      (finally
        (delete-coordinate! coordinate)))))

(deftest renew-test
  (let [coordinate (coordinate)]
    (try
      (let [claim (lease/try-acquire! coordinate)]
        (is (true? (lease/renew! claim)))
        (is (false? (lease/renew! (assoc claim :owner (str (random-uuid)))))))
      (finally
        (delete-coordinate! coordinate)))))

(deftest acquisition-commits-independently-of-caller-transaction-test
  (let [coordinate (coordinate)
        claim      (atom nil)]
    (try
      (is (thrown-with-msg? Exception #"roll back caller"
                            (t2/with-transaction [_conn]
                              (reset! claim (lease/try-acquire! coordinate))
                              (throw (Exception. "roll back caller")))))
      (is (= (:owner @claim)
             (t2/select-one-fn :owner :search_index_lease
                               :engine (:engine coordinate)
                               :version (:version coordinate)
                               :lang_code (:lang_code coordinate)))
          "the lease is visible even though the caller's ambient transaction rolled back")
      (finally
        (delete-coordinate! coordinate)))))

(deftest release-commits-independently-of-caller-transaction-test
  (let [coordinate (coordinate)
        claim      (lease/try-acquire! coordinate)]
    (try
      (is (thrown-with-msg? Exception #"roll back caller"
                            (t2/with-transaction [_conn]
                              (is (true? (lease/release! claim)))
                              (throw (Exception. "roll back caller")))))
      (is (nil? (t2/select-one :search_index_lease
                               :engine (:engine coordinate)
                               :version (:version coordinate)
                               :lang_code (:lang_code coordinate)))
          "release remains committed when the caller's ambient transaction rolls back")
      (finally
        (delete-coordinate! coordinate)))))

(deftest lease-holds-locale-stable-test
  (let [coordinate (assoc (coordinate) :lang_code "en")]
    (try
      (binding [i18n/*site-locale-override* "de"]
        (is (= {:acquired? true, :result "en"}
               (lease/do-with-lease coordinate i18n/site-locale-string))))
      (finally
        (delete-coordinate! coordinate)))))

(deftest obsolete-locale-coordinate-is-fenced-test
  (let [wrong-locale (if (= "zz" (i18n/site-locale-string)) "yy" "zz")
        coordinate   (assoc (coordinate) :site-locale wrong-locale)]
    (try
      (is (thrown-with-msg?
           Exception
           #"coordinate became obsolete"
           (lease/do-with-lease coordinate lease/assert-coordinate-current!)))
      (finally
        (delete-coordinate! coordinate)))))

(deftest stale-owner-is-fenced-test
  (let [coordinate (coordinate)]
    (try
      (let [claim   (lease/try-acquire! coordinate)
            context {:claim claim, :lost? (atom false)}]
        (t2/update! :search_index_lease
                    {:engine    (:engine claim)
                     :version   (:version claim)
                     :lang_code (:lang_code claim)}
                    {:owner (str (random-uuid))})
        (let [error (try
                      (binding [lease/*lease-context* context]
                        (lease/assert-current!))
                      nil
                      (catch Exception e e))]
          (is (= ::lease/lease-lost (:type (ex-data error))))
          (is (true? @(:lost? context)))
          (is (thrown? Exception
                       (binding [lease/*lease-context* context]
                         (lease/throw-if-lost!))))))
      (finally
        (delete-coordinate! coordinate)))))

(deftest stale-owner-cannot-activate-pending-index-test
  (let [version    (str (random-uuid))
        index-name (str (random-uuid))
        coordinate {:engine "appdb", :version version, :lang_code (i18n/site-locale-string)}]
    (try
      (is (true? (search-index-metadata/create-pending! :appdb version index-name)))
      (is (thrown-with-msg?
           Exception
           #"lease was lost"
           (lease/do-with-lease
            coordinate
            (fn []
              (let [{:keys [engine version lang_code]} (:claim lease/*lease-context*)]
                (t2/update! :search_index_lease
                            {:engine engine, :version version, :lang_code lang_code}
                            {:owner (str (random-uuid))}))
              (t2/with-connection [conn (mdb/app-db)]
                (lease/do-in-fenced-transaction!
                 conn
                 #(search-index-metadata/activate-named-pending!
                   % :appdb version index-name)))))))
      (is (= :pending
             (t2/select-one-fn :status :model/SearchIndexMetadata
                               :engine :appdb :version version :index_name index-name))
          "the ownership check and metadata rotation share a transaction")
      (finally
        (t2/delete! :model/SearchIndexMetadata :engine :appdb :version version)
        (delete-coordinate! coordinate)))))

(deftest fenced-mutation-locks-out-takeover-until-commit-test
  (let [coordinate (coordinate)
        version    (:version coordinate)
        index-name (str (random-uuid))
        allow-write (promise)
        writer      (atom nil)
        contender   (atom nil)]
    (try
      (binding [lease/*lease-duration* (t/millis 200)]
        (let [claim      (lease/try-acquire! coordinate)
              context    {:claim claim, :lost? (atom false)}
              fence-held (promise)]
          (reset! writer
                  (binding [lease/*lease-context* context]
                    (future
                      (t2/with-connection [conn (mdb/app-db)]
                        (lease/do-in-fenced-transaction!
                         conn
                         #(do
                            (deliver fence-held true)
                            @allow-write
                            (t2/insert! :conn % :model/SearchIndexMetadata
                                        {:engine :appdb, :version version
                                         :lang_code (:lang_code coordinate), :status :pending
                                         :index_name index-name})))))))
          (is (true? (deref fence-held 5000 false)))
          ;; Let the database lease expire while the fenced transaction still owns the row lock.
          (let [db-now      #(:now (t2/query-one ["SELECT CURRENT_TIMESTAMP AS now"]))
                fence-taken (db-now)]
            (tu/poll-until 5000 (t/after? (db-now) (t/plus fence-taken lease/*lease-duration*))))
          ;; Only the original owner needs to expire quickly. The contender must survive its lock wait.
          (reset! contender (binding [lease/*lease-duration* (t/minutes 1)]
                              (future (lease/try-acquire! coordinate))))
          (is (= ::blocked (deref @contender 50 ::blocked))
              "takeover waits for the transaction containing the protected mutation")
          (deliver allow-write true)
          (is (= 1 (deref @writer 5000 ::timed-out)))
          (let [replacement (deref @contender 5000 ::timed-out)]
            (is (map? replacement))
            (is (= index-name
                   (t2/select-one-fn :index_name :model/SearchIndexMetadata
                                     :engine :appdb :version version :status :pending)))
            (when (map? replacement)
              (lease/release! replacement)))))
      (finally
        (deliver allow-write true)
        (some-> @writer future-cancel)
        (some-> @contender future-cancel)
        (t2/delete! :model/SearchIndexMetadata :engine :appdb :version version)
        (delete-coordinate! coordinate)))))

(deftest fenced-mutation-commits-independently-of-ambient-transaction-test
  (let [coordinate (coordinate)
        version    (:version coordinate)
        index-name (str (random-uuid))
        claim      (lease/try-acquire! coordinate)
        context    {:claim claim, :lost? (atom false)}]
    (try
      (is (thrown-with-msg?
           Exception
           #"roll back caller"
           (t2/with-transaction [_outer-conn]
             (binding [lease/*lease-context* context]
               (t2/with-connection [conn (mdb/app-db)]
                 (lease/do-in-fenced-transaction!
                  conn
                  #(t2/insert! :conn % :model/SearchIndexMetadata
                               {:engine :appdb, :version version, :lang_code (:lang_code coordinate)
                                :status :pending, :index_name index-name}))))
             (throw (Exception. "roll back caller")))))
      (is (= index-name
             (t2/select-one-fn :index_name :model/SearchIndexMetadata
                               :engine :appdb :version version :status :pending))
          "the independent mutation is not rolled back with the caller's connection")
      (finally
        (lease/release! claim)
        (t2/delete! :model/SearchIndexMetadata :engine :appdb :version version)
        (delete-coordinate! coordinate)))))

(deftest unleased-in-transaction-mutations-join-the-caller-connection-test
  (let [version    (str (random-uuid))
        index-name (str (random-uuid))
        insert!    #(t2/insert! :conn % :model/SearchIndexMetadata
                                {:engine :appdb, :version version, :lang_code "en"
                                 :status :pending, :index_name index-name})]
    (try
      (testing "an unleased mutation sees the caller's uncommitted rows and rolls back with it"
        (is (thrown-with-msg?
             Exception
             #"roll back caller"
             (t2/with-transaction [_outer-conn]
               (t2/insert! :model/SearchIndexMetadata
                           {:engine :appdb, :version version, :lang_code "en"
                            :status :active, :index_name (str index-name "-active")})
               (lease/do-with-mutation-connection
                (fn [conn]
                  (is (= 1 (t2/count :conn conn :model/SearchIndexMetadata :engine :appdb :version version)))
                  (insert! conn)))
               (throw (Exception. "roll back caller")))))
        (is (nil? (t2/select-one-fn :index_name :model/SearchIndexMetadata :engine :appdb :version version))))
      (finally
        (t2/delete! :model/SearchIndexMetadata :engine :appdb :version version)))))

(deftest concurrent-acquisition-elects-one-owner-test
  (let [coordinate (coordinate)
        ready      (CountDownLatch. 2)
        start      (CountDownLatch. 1)
        contend    (fn []
                     (.countDown ready)
                     (.await start)
                     (lease/try-acquire! coordinate))
        contenders [(future (contend)) (future (contend))]]
    (try
      (is (.await ready 5 TimeUnit/SECONDS))
      (.countDown start)
      (let [claims (mapv deref contenders)]
        (is (= 1 (count (filter some? claims))))
        (lease/release! (first (filter some? claims))))
      (finally
        (.countDown start)
        (run! future-cancel contenders)
        (delete-coordinate! coordinate)))))

(deftest initialization-and-reindex-use-the-same-lease-coordinate-test
  (let [coordinates (atom [])
        operations  (atom [])]
    (mt/with-dynamic-fn-redefs [search.engine/active-engines (constantly [:search.engine/appdb])
                                search.engine/log-resolution! (constantly nil)
                                lease/do-with-lease (fn [coordinate thunk]
                                                      (swap! coordinates conj coordinate)
                                                      {:acquired? true, :result (thunk)})]
      ;; These are multimethods, so dynamic-fn redefs cannot replace them.
      #_{:clj-kondo/ignore [:metabase/prefer-with-dynamic-fn-redefs]}
      (with-redefs [search.engine/init! (fn [_engine _opts]
                                          (swap! operations conj :init)
                                          {:card 1})
                    search.engine/reindex! (fn [_engine _opts]
                                             (swap! operations conj :reindex)
                                             {:card 1})]
        (search/init-index!)
        @(search/reindex! {:async? false})
        (is (= [:init :reindex] @operations))
        (is (= 2 (count @coordinates)))
        (is (apply = @coordinates))))))

(deftest ambient-transaction-refused-test
  (let [coordinate (coordinate)
        events     (atom [])]
    (mt/with-dynamic-fn-redefs [analytics/inc! (fn [metric labels & _] (swap! events conj [metric labels]))]
      (is (thrown-with-msg?
           Exception
           #"cannot be acquired inside an app-db transaction"
           (t2/with-transaction [_conn]
             (lease/do-with-lease coordinate (fn [] (throw (Exception. "must not run")))))))
      (is (nil? (t2/select-one :search_index_lease :engine (:engine coordinate) :version (:version coordinate)))
          "nothing was acquired")
      (is (=? [[:metabase-search/reindex-lease-events {:engine "appdb", :event :refused-in-transaction}]]
              @events)
          "the refusal is visible in the lease-events metric"))))

(deftest successful-fence-advances-heartbeat-deadline-test
  (let [coordinate (coordinate)
        claim      (lease/try-acquire! coordinate)
        deadline   (atom 0)
        context    {:claim claim, :lost? (atom false), :last-renewal-start-ns deadline}]
    (try
      (binding [lease/*lease-context* context]
        (t2/with-connection [conn (mdb/app-db)]
          (lease/do-in-fenced-transaction! conn (fn [_conn] nil))))
      (is (pos? @deadline) "a fenced mutation counts as a renewal for the heartbeat's fail-safe")
      (finally
        (lease/release! claim)
        (delete-coordinate! coordinate)))))

(deftest coordination-pool-honours-app-db-restore-gate-test
  (let [coordinate (coordinate)
        ^ReentrantReadWriteLock lock (.lock (mdb/app-db))
        in-txn     (CountDownLatch. 1)
        locked     (CountDownLatch. 1)
        ;; Enter the transaction (and check out its main-pool connection) BEFORE the write lock is taken, so the
        ;; only thing left to block on is the coordination pool's own gate.
        done       (CountDownLatch. 1)
        attempt    (future
                     (try
                       (t2/with-transaction [_conn]
                         (.countDown in-txn)
                         (.await locked 5 TimeUnit/SECONDS)
                         (lease/try-acquire! coordinate))
                       (finally
                         (try
                           (delete-coordinate! coordinate)
                           (finally
                             (.countDown done))))))]
    (is (.await in-txn 5 TimeUnit/SECONDS))
    (.. lock writeLock lock)
    (.countDown locked)
    (try
      (is (= ::blocked (deref attempt 300 ::blocked))
          "a lifecycle operation on the coordination pool waits while the restore write lock is held")
      (.. lock writeLock unlock)
      (let [claim (deref attempt 5000 ::blocked)]
        (is (=? {:owner string?} claim) "and proceeds once it is released"))
      (finally
        (when (.isWriteLockedByCurrentThread lock)
          (.. lock writeLock unlock))
        ;; The worker owns cleanup, so a late acquisition cannot race a deletion on this thread.
        (when-not (.await done 10 TimeUnit/SECONDS)
          (future-cancel attempt)
          (is (.await done 5 TimeUnit/SECONDS) "restore-gate worker exits and cleans up after cancellation"))))))

(deftest interrupted-release-preserves-interrupt-and-removes-lease-test
  (let [coordinate (coordinate)
        claim      (lease/try-acquire! coordinate)]
    (try
      (.interrupt (Thread/currentThread))
      (let [released?    (lease/release! claim)
            interrupted? (Thread/interrupted)]
        (is (true? released?))
        (is (true? interrupted?)))
      (is (not (t2/exists? :search_index_lease :engine (:engine coordinate)
                           :lang_code (:lang_code coordinate) :version (:version coordinate))))
      (finally
        (Thread/interrupted)
        (delete-coordinate! coordinate)))))

(deftest expired-during-acquisition-never-authorizes-body-test
  (let [coordinate (coordinate)
        old-time   (t/minus (t/offset-date-time) (t/hours 1))]
    (try
      (mt/with-dynamic-fn-redefs [search.db/lease-times (fn [& _] {:expires_at old-time, :now old-time})]
        (is (nil? (lease/try-acquire! coordinate))))
      (is (not (t2/exists? :search_index_lease :engine (:engine coordinate)
                           :lang_code (:lang_code coordinate) :version (:version coordinate))))
      (finally
        (delete-coordinate! coordinate)))))

(deftest release-retries-interruption-during-restore-wait-test
  (let [coordinate (coordinate)
        claim      (lease/try-acquire! coordinate)
        ^ReentrantReadWriteLock lock (:lock (mdb/app-db))
        interrupted (promise)
        worker-thread (promise)
        lifecycle (dynamic-redefs/original-fn #'lease/do-with-lifecycle-connection)]
    (.. lock writeLock lock)
    (mt/with-dynamic-fn-redefs [lease/do-with-lifecycle-connection
                                (fn [& args]
                                  (try
                                    (apply lifecycle args)
                                    (catch InterruptedException e
                                      (deliver interrupted true)
                                      (throw e))))]
      (let [worker (future
                     (deliver worker-thread (Thread/currentThread))
                     (try
                       (let [released? (lease/release! claim)]
                         {:interrupted? (Thread/interrupted), :released? released?})
                       (catch Exception e e)))]
        (try
          (let [thread (deref worker-thread 5000 nil)]
            (is (some? thread))
            (when thread
              (tu/poll-until 5000 (.hasQueuedThread lock thread))
              (.interrupt ^Thread thread)))
          (is (true? (deref interrupted 5000 false)) "interrupt occurred inside the lifecycle lock wait")
          (is (= ::waiting (deref worker 50 ::waiting)) "release retries while restore still owns the lock")
          (.. lock writeLock unlock)
          (is (= {:interrupted? true, :released? true} (deref worker 5000 ::timeout)))
          (is (not (t2/exists? :search_index_lease :engine (:engine coordinate)
                               :lang_code (:lang_code coordinate) :version (:version coordinate))))
          (finally
            (when (.isWriteLockedByCurrentThread lock)
              (.. lock writeLock unlock))
            (deref worker 5000 nil)
            (delete-coordinate! coordinate)))))))

(deftest explicit-reset-reports-lease-contention-test
  (mt/with-dynamic-fn-redefs [search.engine/active-engines (constantly [:search.engine/appdb])
                              search/with-engine-lease (fn [& _] {:acquired? false})]
    (is (nil? (search/init-index!)) "ordinary startup can reuse an index while another initializer works")
    (is (= {:engine :search.engine/appdb, :type ::search/index-busy}
           (ex-data (try
                      (search/init-index! :force-reset? true)
                      (catch Exception e e)))))))

(deftest release-restore-wait-is-bounded-test
  (let [coordinate (coordinate)
        claim      (lease/try-acquire! coordinate)
        ^ReentrantReadWriteLock lock (:lock (mdb/app-db))]
    (.. lock writeLock lock)
    (let [worker (future
                   (try
                     (lease/release! claim)
                     (catch Exception e (:type (ex-data e)))))]
      (try
        (is (= ::lease/release-timeout (deref worker 10000 ::timeout)))
        (finally
          (.. lock writeLock unlock)
          (deref worker 5000 nil)
          (delete-coordinate! coordinate))))))

(deftest restore-waits-for-checked-out-lifecycle-operation-test
  (let [coordinate (coordinate)
        checked-out (promise)
        release-sql (promise)
        restore-started (promise)
        restore-entered (promise)
        real-times (dynamic-redefs/original-fn #'search.db/lease-times)
        lock ^ReentrantReadWriteLock (:lock (mdb/app-db))]
    (mt/with-dynamic-fn-redefs [search.db/lease-times (fn [& args]
                                                        (deliver checked-out true)
                                                        @release-sql
                                                        (apply real-times args))]
      (let [claim (future (lease/try-acquire! coordinate))]
        (try
          (is (true? (deref checked-out 5000 false)))
          (let [restore (future
                          (deliver restore-started true)
                          (.. lock writeLock lock)
                          (try (deliver restore-entered true)
                               (finally (.. lock writeLock unlock))))]
            (is (true? (deref restore-started 5000 false)))
            (is (= ::blocked (deref restore-entered 100 ::blocked)))
            (deliver release-sql true)
            (is (some? (deref claim 5000 nil)))
            (is (true? (deref restore-entered 5000 false)))
            @restore)
          (finally
            (deliver release-sql true)
            @claim
            (delete-coordinate! coordinate)))))))

(deftest deadline-before-commit-rolls-back-and-releases-lease-test
  (let [coordinate (coordinate)
        setting-key (str "search-deadline-" (random-uuid))]
    (try
      (t2/insert! :setting {:key setting-key, :value "before"})
      (mt/with-dynamic-fn-redefs [deadline/report! (fn [& _])]
        (is (= ::deadline/exceeded
               (:type
                (ex-data
                 (try
                   (lease/do-with-lease
                    coordinate
                    #(lease/do-with-mutation-connection
                      (fn [conn]
                        (t2/update! :conn conn :setting :key setting-key {:value "after"})
                        (#'deadline/expire! deadline/*run-context*))))
                   (catch Exception e e)))))))
      (is (= "before" (t2/select-one-fn :value :setting :key setting-key)))
      (is (not (t2/exists? :search_index_lease :engine (:engine coordinate)
                           :lang_code (:lang_code coordinate) :version (:version coordinate))))
      (finally
        (t2/delete! :setting :key setting-key)
        (delete-coordinate! coordinate)))))

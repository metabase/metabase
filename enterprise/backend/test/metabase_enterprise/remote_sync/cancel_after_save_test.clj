(ns metabase-enterprise.remote-sync.cancel-after-save-test
  "A cancel is a request: it flags the task row and does not end it; only the worker (or the stale supersede of a
  dead worker) ends the row. A cancel that arrives after the last cancel check before the save (the forced 0.75
  report) is ignored, the pull runs to its end and records its success. A branch or settings change while the
  worker runs, also after a cancel request, is refused, as for any running task. Each pull runs through
  `run-task-body!` with a new branch, as the async API runs it."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.core :as remote-sync.core]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.task.import :as task.import]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.search.core :as search]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each test-helpers/clean-remote-sync-state test-helpers/commit-with-temp)

(def ^:private new-branch "cancel-after-save-branch")

(def ^:private coll-eid "cancelaftersavecollxx")

(defn- card-eid [i] (format "cancelaftersave%06d" i))

(defn- card-path [i] (format "collections/cancel_after_save/cards/card_%03d.yaml" i))

(defn- files
  "A remote-synced collection with the cards `card-ids`, as a {path content} tree."
  [card-ids]
  (into {"collections/cancel_after_save/cancel_after_save.yaml"
         (test-helpers/generate-collection-yaml coll-eid "Cancel after save" :is-remote-synced true)}
        (for [i card-ids]
          [(card-path i) (test-helpers/generate-card-yaml (card-eid i) (str "Card " i) coll-eid)])))

(defn- on-plain-thread!
  "Runs `f` on a thread that conveys no bindings, as another request does. Returns the value of `f`, or what it
  threw."
  [f]
  (let [done (promise)]
    (doto (Thread. ^Runnable (fn []
                               (try
                                 (deliver done (f))
                                 (catch Throwable t
                                   (deliver done t)))))
      .start)
    (deref done 20000 :timed-out)))

(defn- cancel-on-plain-thread!
  "Cancels `task-id` from a thread that conveys no bindings, as the cancel API does from another request. Returns
  :ok, or what the cancel threw."
  [task-id]
  (on-plain-thread! #(do (remote-sync.task/cancel-sync-task! task-id) :ok)))

(defn- cancel-at!
  "A progress reporter factory that cancels the task at `cancel-point` and records the result of the cancel in
  `cancel-result`. `cancel-point` is :before-0.75 (just before the forced 0.75 report, the last cancel check before
  the save), :after-0.75 (just after it) or :before-0.9 (just before the forced 0.9 report, after the save)."
  [cancel-point cancel-result]
  (let [orig (mt/original-fn #'remote-sync.task/make-progress-reporter)]
    (fn make-reporter
      ([task-id] (make-reporter task-id nil))
      ([task-id opts]
       (let [report (orig task-id opts)]
         (fn
           ([fraction] (report fraction))
           ([fraction report-opts]
            (when (#{[:before-0.75 0.75] [:before-0.9 0.9]} [cancel-point fraction])
              (reset! cancel-result (cancel-on-plain-thread! task-id)))
            (let [x (report fraction report-opts)]
              (when (= [:after-0.75 0.75] [cancel-point fraction])
                (reset! cancel-result (cancel-on-plain-thread! task-id)))
              x))))))))

(defn- hook-before-forced-report!
  "A progress reporter factory that runs `(hook! task-id)` once, just before the first forced report whose fraction
  satisfies `pred`, and records its value in `hook-result`."
  [pred hook! hook-result]
  (let [orig (mt/original-fn #'remote-sync.task/make-progress-reporter)]
    (fn make-reporter
      ([task-id] (make-reporter task-id nil))
      ([task-id opts]
       (let [report (orig task-id opts)]
         (fn
           ([fraction] (report fraction))
           ([fraction report-opts]
            (when (and (:force? report-opts) (pred fraction) (compare-and-set! hook-result nil ::running))
              (reset! hook-result (hook! task-id)))
            (report fraction report-opts))))))))

(defn- run-pull!
  "Runs `import!` of `snapshot` with `import-args` through `run-task-body!` with the branch [[new-branch]], and
  cancels the task at `cancel-point` (see [[cancel-at!]]). Returns the task id and the result of the cancel."
  [snapshot cancel-point & {:keys [import-args on-success]}]
  (let [task-id       (:id (remote-sync.task/create-sync-task! "import" (mt/user->id :rasta)))
        cancel-result (atom ::not-cancelled)]
    (mt/with-dynamic-fn-redefs [remote-sync.task/make-progress-reporter (cancel-at! cancel-point cancel-result)]
      (impl/run-task-body! task-id new-branch
                           (fn [tid] (impl/import! snapshot tid import-args))
                           :on-success on-success))
    {:task-id task-id :cancel-result @cancel-result}))

(defn- task-row [task-id]
  (-> (t2/select-one :model/RemoteSyncTask :id task-id)
      (t2/hydrate :status)
      (select-keys [:status :cancelled :error_message :progress :outcome :version])))

(defn- import-baseline!
  "Imports the snapshot of `src` at `version` with force, and records the result, so that the next pull can load
  incrementally."
  [src version]
  (let [task-id (:id (remote-sync.task/create-sync-task! "import" (mt/user->id :rasta)))
        result  (impl/import! (source.p/snapshot-at src version) task-id :force? true)]
    (impl/handle-task-result! result task-id)
    result))

(defmacro ^:private with-pull-settings [& body]
  `(do
     (mt/id) ; the cards of the snapshot name the test-data database
     (search.tu/with-index-disabled
       (mt/with-temporary-raw-setting-values [remote-sync-type "read-write" remote-sync-transforms "false"
                                              remote-sync-branch "main"]
         ~@body))))

(deftest full-pull-cancelled-after-the-last-check-records-success-test
  (with-pull-settings
    (doseq [cancel-point [:after-0.75 :before-0.9]]
      (testing (str "a forced full pull cancelled at " cancel-point)
        (let [src (test-helpers/versioned-source :trees {"v1" (files (range 3))} :current "v1")
              {:keys [task-id cancel-result]} (run-pull! (source.p/snapshot src) cancel-point
                                                         :import-args {:force? true})]
          (is (= :ok cancel-result) "the cancel was requested while the pull ran")
          (is (=? {:status        :successful
                   :cancelled     false
                   :error_message nil
                   :progress      1.0
                   :outcome       {:kind "pulled" :count 4}
                   :version       "v1"}
                  (task-row task-id)))
          (is (= new-branch (settings/remote-sync-branch)) "the branch setting names the pulled branch")
          (is (= "v1" (remote-sync.task/last-version)))
          (is (= 4 (t2/count :model/RemoteSyncObject)) "the ledger holds the collection and the 3 cards")
          (is (= 3 (t2/count :model/Card :entity_id [:in (map card-eid (range 3))]))))
        (settings/remote-sync-branch! "main")))))

(deftest incremental-pull-cancelled-after-the-last-check-records-success-test
  (with-pull-settings
    (doseq [cancel-point [:after-0.75 :before-0.9]]
      (testing (str "an incremental pull that deletes a card, cancelled at " cancel-point)
        (let [src          (test-helpers/versioned-source :trees {"v0" (files (range 3)) "v1" (files [0 2])}
                                                          :current "v0")
              _            (is (= :success (:status (import-baseline! src "v0"))) "the baseline import of v0")
              deleted-id   (t2/select-one-pk :model/Card :entity_id (card-eid 1))
              incremental? (atom false)
              search-dels  (atom [])
              real-load    (mt/original-fn #'impl/incremental-load-snapshot!)
              {:keys [task-id cancel-result]}
              (mt/with-dynamic-fn-redefs [impl/incremental-load-snapshot! (fn [& args]
                                                                            (reset! incremental? true)
                                                                            (apply real-load args))
                                          search/delete!                  (fn [model ids]
                                                                            (swap! search-dels conj [model (vec ids)]))]
                (run-pull! (source.p/snapshot-at src "v1") cancel-point))]
          (is @incremental? "the pull took the incremental path")
          (is (= :ok cancel-result) "the cancel was requested while the pull ran")
          (is (=? {:status        :successful
                   :cancelled     false
                   :error_message nil
                   :progress      1.0
                   :outcome       {:kind "pulled" :count 1}
                   :version       "v1"}
                  (task-row task-id)))
          (is (= new-branch (settings/remote-sync-branch)) "the branch setting names the pulled branch")
          (is (= "v1" (remote-sync.task/last-version)))
          (is (not (t2/exists? :model/Card :id deleted-id)) "the deleted card is gone")
          (is (= 3 (t2/count :model/RemoteSyncObject)) "the ledger holds the collection and the 2 cards that stay")
          (is (= [[:model/Card [(str deleted-id)]]] @search-dels)
              "the search entry of the deleted card is removed, by the text id that the index stores"))
        (settings/remote-sync-branch! "main")))))

(deftest cancel-after-the-last-check-still-turns-off-transforms-sync-test
  (testing "a full pull of content with no transforms turns off remote-sync-transforms, also when a cancel arrives
            after the save"
    (with-pull-settings
      (mt/with-temporary-raw-setting-values [remote-sync-transforms "true"]
        (is (true? (settings/remote-sync-transforms)))
        (let [src (test-helpers/versioned-source :trees {"v1" (files (range 2))} :current "v1")
              {:keys [task-id cancel-result]} (run-pull! (source.p/snapshot src) :before-0.9
                                                         :import-args {:force? true})]
          (is (= :ok cancel-result))
          (is (= :successful (:status (task-row task-id))))
          (is (false? (settings/remote-sync-transforms))))))))

(deftest cancel-after-the-last-check-writes-an-audit-event-that-agrees-with-the-row-test
  (mt/with-premium-features #{:remote-sync :audit-app}
    (mt/with-model-cleanup [:model/AuditLog]
      (with-pull-settings
        (let [src (test-helpers/versioned-source :trees {"v1" (files (range 2))} :current "v1")
              {:keys [task-id cancel-result]}
              (run-pull! (source.p/snapshot src) :before-0.9
                         :import-args {:force? true}
                         :on-success  (fn [task-id _result]
                                        (impl/publish-sync-event! :event/remote-sync-import task-id
                                                                  {:branch new-branch} (mt/user->id :rasta))))
              entry (t2/select-one :model/AuditLog :topic "remote-sync-import" :model_id task-id)
              row   (task-row task-id)]
          (is (= :ok cancel-result))
          (is (some? entry) "the pull wrote its audit event")
          (is (= :successful (:status row)))
          (is (=? {:version "v1" :branch new-branch} (:details entry)))
          (is (= (:version row) (get-in entry [:details :version])) "the audit event names the version of the row"))))))

(deftest new-task-while-a-cancelled-pull-still-runs-is-refused-test
  (testing "a pull cancelled after its save still runs, so a new task is refused until it ends; then the newer task
            writes its branch"
    (with-pull-settings
      (let [src         (test-helpers/versioned-source :trees {"v1" (files (range 2))} :current "v1")
            task-id     (:id (remote-sync.task/create-sync-task! "import" (mt/user->id :rasta)))
            hook-result (atom nil)
            hook!       (fn [task-id]
                          (on-plain-thread!
                           (fn []
                             ;; The admin requests a cancel, then tries to start another task while the pull runs.
                             (remote-sync.task/cancel-sync-task! task-id)
                             [(ex-message
                               (try
                                 (remote-sync.task/create-sync-task! "import" (mt/user->id :rasta))
                                 (catch Exception e e)))
                              (:ended_at (t2/select-one :model/RemoteSyncTask :id task-id))])))]
        (mt/with-dynamic-fn-redefs [remote-sync.task/make-progress-reporter
                                    (hook-before-forced-report! #(== 0.9 %) hook! hook-result)]
          (impl/run-task-body! task-id new-branch (fn [tid] (impl/import! (source.p/snapshot src) tid {:force? true}))))
        (is (= ["A running task exists" nil] @hook-result)
            "the new task was refused while the cancelled pull still ran")
        (is (=? {:status :successful :cancelled false :version "v1"} (task-row task-id))
            "the pull finished after its save and recorded its success")
        (is (= new-branch (settings/remote-sync-branch)) "the setting names the branch that the pull saved")
        (testing "after the pull ended, a newer task writes its branch"
          (let [newer (:id (remote-sync.task/create-sync-task! "import" (mt/user->id :rasta)))]
            (impl/handle-task-result! {:status  :success
                                       :outcome {:kind "pulled" :count 0 :branch "newer-branch"}}
                                      newer "newer-branch")
            (is (= :successful (:status (task-row newer))))
            (is (= "newer-branch" (settings/remote-sync-branch)))))))))

(deftest superseded-pull-does-not-write-the-branch-setting-test
  (testing "a pull that a new task superseded, and that then finishes its save, does not write the branch setting"
    (with-pull-settings
      (let [src         (test-helpers/versioned-source :trees {"v1" (files (range 2))} :current "v1")
            task-id     (:id (remote-sync.task/create-sync-task! "import" (mt/user->id :rasta)))
            hook-result (atom nil)
            hook!       (fn [task-id]
                          (on-plain-thread!
                           (fn []
                             ;; The worker looked dead for longer than the time limit, so a new task supersedes it.
                             (let [long-ago (t/minus (t/offset-date-time) (t/days 1))]
                               (t2/update! :model/RemoteSyncTask task-id {:last_heartbeat_at       long-ago
                                                                          :last_progress_report_at long-ago}))
                             (let [ids (remote-sync.task/supersede-stale-tasks!)]
                               (remote-sync.task/create-sync-task! "import" (mt/user->id :rasta))
                               ids))))]
        (mt/with-dynamic-fn-redefs [remote-sync.task/make-progress-reporter
                                    (hook-before-forced-report! #(== 0.9 %) hook! hook-result)]
          (impl/run-task-body! task-id new-branch (fn [tid] (impl/import! (source.p/snapshot src) tid {:force? true}))))
        (is (= [task-id] @hook-result) "the new task superseded the pull after its save")
        (is (= "main" (settings/remote-sync-branch)) "the superseded pull did not write its branch")
        (is (=? {:status :cancelled :version "v1"} (task-row task-id)))
        (is (str/starts-with? (str (:error_message (task-row task-id))) "Sync was interrupted")
            "the row keeps the supersede message")))))

(deftest export-cancelled-after-its-last-transaction-records-success-test
  (testing "a forced export whose cancel arrives after its last transaction records success"
    (with-pull-settings
      (let [src           (test-helpers/versioned-source :trees {"v0" (files (range 2))} :current "v0")
            _             (is (= :success (:status (import-baseline! src "v0"))) "the baseline import of v0")
            dst           (test-helpers/versioned-source :trees {"empty" {}} :current "empty")
            task-id       (:id (remote-sync.task/create-sync-task! "export" (mt/user->id :rasta)))
            cancel-result (atom nil)]
        (impl/run-task-body! task-id new-branch
                             (fn [tid]
                               (let [result (impl/export! (source.p/snapshot dst) tid "export" :force? true)]
                                 (reset! cancel-result (cancel-on-plain-thread! tid))
                                 result)))
        (is (= :ok @cancel-result) "the cancel was requested after the last transaction of the export")
        (is (=? {:status        :successful
                 :cancelled     false
                 :error_message nil
                 :progress      1.0
                 :outcome       {:kind "pushed"}
                 :version       "written-1"}
                (task-row task-id)))
        (is (= new-branch (settings/remote-sync-branch)))))))

(deftest merge-step-of-a-push-cancelled-after-its-save-records-success-test
  (testing "the merge step of a push, cancelled just before the forced 0.9 report of its load, records success"
    (with-pull-settings
      (let [src         (test-helpers/versioned-source :trees {"v0" (files (range 2)) "v1" (files (range 3))}
                                                       :current "v1")
            _           (is (= :success (:status (import-baseline! src "v0"))) "the baseline import of v0")
            task-id     (:id (remote-sync.task/create-sync-task! "export" (mt/user->id :rasta)))
            hook-result (atom nil)]
        ;; the load of the merge step maps its 0.9 report to 0.66 + 0.9 * 0.34 on the export bar
        (mt/with-dynamic-fn-redefs [remote-sync.task/make-progress-reporter
                                    (hook-before-forced-report! #(< 0.96 % 0.97) cancel-on-plain-thread! hook-result)]
          (impl/run-task-body! task-id new-branch
                               (fn [tid]
                                 (impl/export! (source.p/snapshot src) tid "merge" :merge? true :source src
                                               :base-snapshot (source.p/snapshot-at src "v0")))))
        (is (= :ok @hook-result) "the cancel was requested after the save of the merge step")
        (is (=? {:status :successful :cancelled false :error_message nil :progress 1.0 :outcome {:kind "merged"}}
                (task-row task-id)))
        (is (= 3 (t2/count :model/Card :entity_id [:in (map card-eid (range 3))])) "the merge step loaded v1")
        (is (= new-branch (settings/remote-sync-branch)))))))

(deftest cancel-before-the-last-check-still-cancels-test
  (testing "a cancel before the last cancel check stops the pull before the save, and the row says cancelled"
    (with-pull-settings
      (let [src (test-helpers/versioned-source :trees {"v1" (files (range 2))} :current "v1")
            {:keys [task-id cancel-result]} (run-pull! (source.p/snapshot src) :before-0.75
                                                       :import-args {:force? true})]
        (is (= :ok cancel-result))
        (is (=? {:status :cancelled :cancelled true :version nil :outcome nil} (task-row task-id)))
        (is (= "main" (settings/remote-sync-branch)))
        (is (nil? (remote-sync.task/last-version)))
        (is (zero? (t2/count :model/RemoteSyncObject)))))))

(defn- pull-with-hook!
  "Runs a forced pull of `snapshot` to [[new-branch]] through `run-task-body!`, and runs `(hook! task-id)` on the
  worker thread just before the forced 0.9 report, after the save committed. Records the value of the hook in
  `hook-result` and returns the task id."
  [snapshot hook! hook-result & {:keys [on-success]}]
  (let [task-id (:id (remote-sync.task/create-sync-task! "import" (mt/user->id :rasta)))]
    (mt/with-dynamic-fn-redefs [remote-sync.task/make-progress-reporter
                                (hook-before-forced-report! #(== 0.9 %) hook! hook-result)]
      (impl/run-task-body! task-id new-branch
                           (fn [tid] (impl/import! snapshot tid {:force? true}))
                           :on-success on-success))
    task-id))

(defn- start-plain-thread!
  "Starts `f` on a thread that conveys no bindings. Returns a promise of the value of `f`, or of what it threw."
  [f]
  (let [done (promise)]
    (doto (Thread. ^Runnable (fn []
                               (try
                                 (deliver done (f))
                                 (catch Throwable t
                                   (deliver done t)))))
      .start)
    done))

(defn- slow-source
  "A Source that delegates to `src`. Its `snapshot` delivers `in-snapshot`, then waits for `release`, as a slow
  fetch does."
  [src in-snapshot release]
  (reify source.p/Source
    (branches [_] (source.p/branches src))
    (create-branch [_ branch base] (source.p/create-branch src branch base))
    (default-branch [_] (source.p/default-branch src))
    (snapshot [_]
      (deliver in-snapshot true)
      (deref release 20000 nil)
      (source.p/snapshot src))
    (snapshot-at [_ version] (source.p/snapshot-at src version))))

(defn- wait-for-end!
  "Waits until the RemoteSyncTask `task-id` has an end time, for at most 20 seconds."
  [task-id]
  (loop [i 0]
    (when (and (< i 200) (nil? (:ended_at (t2/select-one :model/RemoteSyncTask :id task-id))))
      (Thread/sleep 100)
      (recur (inc i)))))

(deftest create-branch-while-a-cancelled-pull-still-runs-is-refused-test
  (testing "an admin requests a cancel after the save of a pull, then creates a branch: the change is refused while
            the pull still runs, and the pull records its success and writes its branch"
    (with-pull-settings
      (mt/with-temporary-raw-setting-values [remote-sync-url "file:///cancel-after-save"]
        (let [src         (test-helpers/versioned-source :trees {"v1" (files (range 2))} :current "v1")
              hook-result (atom nil)
              hook!       (fn [task-id]
                            (on-plain-thread!
                             (fn []
                               (mt/with-dynamic-fn-redefs [source/source-from-settings (fn [& _] src)]
                                 (remote-sync.task/cancel-sync-task! task-id)
                                 [(ex-message
                                   (try
                                     (impl/create-branch! "admin-branch" "main")
                                     (catch Exception e e)))
                                  (settings/remote-sync-branch)]))))
              task-id     (pull-with-hook! (source.p/snapshot src) hook! hook-result)]
          (is (= ["Remote sync task in progress" "main"] @hook-result)
              "the branch creation was refused while the pull still ran")
          (is (= new-branch (settings/remote-sync-branch))
              "the setting names the branch that the pull saved")
          (is (=? {:status :successful :cancelled false :version "v1"} (task-row task-id))
              "the pull finished after its save and recorded its success"))))))

(deftest clearing-the-url-while-a-cancelled-pull-still-runs-is-refused-test
  (testing "an admin requests a cancel after the save of a pull, then clears the remote-sync settings: the save is
            refused while the pull still runs, and it clears after the pull ends"
    (with-pull-settings
      (mt/with-temporary-raw-setting-values [remote-sync-url "file:///cancel-after-save"]
        (let [src         (test-helpers/versioned-source :trees {"v1" (files (range 2))} :current "v1")
              hook-result (atom nil)
              hook!       (fn [task-id]
                            (on-plain-thread!
                             (fn []
                               (remote-sync.task/cancel-sync-task! task-id)
                               (ex-message
                                (try
                                  (settings/check-and-update-remote-settings! {:remote-sync-url ""})
                                  (catch Exception e e))))))
              task-id     (pull-with-hook! (source.p/snapshot src) hook! hook-result)]
          (is (= "Remote sync task in progress" @hook-result)
              "the settings save was refused while the pull still ran")
          (is (= new-branch (settings/remote-sync-branch))
              "the setting names the branch that the pull saved")
          (is (=? {:status :successful :cancelled false :version "v1"} (task-row task-id))
              "the pull finished after its save and recorded its success")
          (settings/check-and-update-remote-settings! {:remote-sync-url ""})
          (is (= [nil nil] [(settings/remote-sync-url) (settings/remote-sync-branch)])
              "the admin cleared the URL and the branch after the pull ended"))))))

(deftest new-pull-while-a-cancelled-pull-still-runs-is-refused-test
  (testing "an admin requests a cancel after the save of a pull, then starts another pull: the new pull is refused
            while the first still runs, and it runs after the first pull ends"
    (with-pull-settings
      (mt/with-temporary-raw-setting-values [remote-sync-url "file:///cancel-after-save"]
        (let [src         (test-helpers/versioned-source :trees {"v1" (files (range 2))} :current "v1")
              hook-result (atom nil)
              hook!       (fn [task-id]
                            (on-plain-thread!
                             (fn []
                               (remote-sync.task/cancel-sync-task! task-id)
                               (mt/with-dynamic-fn-redefs [source/source-from-settings (fn [& _] src)]
                                 [(ex-message
                                   (try
                                     (impl/async-import! "main" true {})
                                     (catch Exception e e)))
                                  (nil? (:ended_at (t2/select-one :model/RemoteSyncTask :id task-id)))]))))
              task-id     (pull-with-hook! (source.p/snapshot src) hook! hook-result)]
          (is (= ["Remote sync task in progress" true] @hook-result)
              "the new pull was refused while the cancelled pull still ran")
          (is (=? {:status :successful :cancelled false :version "v1"} (task-row task-id))
              "the first pull finished after its save and recorded its success")
          (is (= new-branch (settings/remote-sync-branch)))
          (testing "after the pull ended, the new pull runs"
            (let [{new-id :id} (mt/with-dynamic-fn-redefs [source/source-from-settings (fn [& _] src)]
                                 (impl/async-import! "main" true {}))]
              (wait-for-end! new-id)
              (is (=? {:status :successful :error_message nil} (task-row new-id)) "the new pull succeeds"))))))))

(deftest auto-import-that-read-a-stale-branch-skips-its-tick-test
  (testing "an auto-import that reads the branch setting while a pull to another branch still runs does not load the
            stale branch after the pull ends: the setting and the app DB hold the same branch"
    (with-pull-settings
      (mt/with-temporary-raw-setting-values [remote-sync-url         "file:///cancel-after-save"
                                             remote-sync-type        "read-only"
                                             remote-sync-auto-import "true"]
        (let [src         (test-helpers/versioned-source :trees {"v1" (files (range 2)) "m1" (files [0])}
                                                         :current "m1")
              old-ended   (promise)
              in-snapshot (promise)
              auto-import (atom nil)
              hook-result (atom nil)
              hook!       (fn [task-id]
                            (on-plain-thread! #(remote-sync.task/cancel-sync-task! task-id))
                            (reset! auto-import
                                    (start-plain-thread!
                                     (fn []
                                       (mt/with-dynamic-fn-redefs [source/source-from-settings
                                                                   (fn [& _] (slow-source src in-snapshot old-ended))]
                                         (#'task.import/auto-import!)
                                         :ok))))
                            ;; the auto-import read the branch setting and waits in its fetch
                            (deref in-snapshot 20000 :timed-out))
              task-id     (pull-with-hook! (source.p/snapshot-at src "v1") hook! hook-result)
              _           (deliver old-ended true)
              auto-result (deref @auto-import 20000 :timed-out)]
          (is (true? @hook-result) "the auto-import read the branch setting before the pull ended")
          (is (= :ok auto-result) "the auto-import ran to its end")
          (is (= 1 (t2/count :model/RemoteSyncTask)) "the auto-import made no task of the stale branch")
          (is (=? {:status :successful :cancelled false :version "v1"} (task-row task-id))
              "the pull finished after its save and recorded its success")
          (is (= new-branch (settings/remote-sync-branch))
              "the setting names the branch that the pull saved")
          (is (= 2 (t2/count :model/Card :entity_id [:in (map card-eid (range 2))]))
              "the app DB holds the content that the pull loaded"))))))

(deftest create-branch-after-the-recorded-success-wins-test
  (testing "the cancelled pull records its success first, then an admin creates a branch: the admin's branch wins"
    (with-pull-settings
      (mt/with-temporary-raw-setting-values [remote-sync-url "file:///cancel-after-save"]
        (let [src          (test-helpers/versioned-source :trees {"v1" (files (range 2))} :current "v1")
              hook-result  (atom nil)
              admin-result (atom nil)
              task-id      (pull-with-hook! (source.p/snapshot src) cancel-on-plain-thread! hook-result
                                            :on-success (fn [_ _]
                                                          (reset! admin-result
                                                                  (on-plain-thread!
                                                                   (fn []
                                                                     (mt/with-dynamic-fn-redefs
                                                                       [source/source-from-settings (fn [& _] src)]
                                                                       (impl/create-branch! "admin-branch" "main")
                                                                       :ok))))))]
          (is (= :ok @hook-result) "the cancel ended the row after the save")
          (is (= :ok @admin-result) "the admin created the branch after the pull recorded its result")
          (is (= :successful (:status (task-row task-id))) "the row of the pull records the success")
          (is (= "admin-branch" (settings/remote-sync-branch))))))))

(deftest collection-toggle-while-a-cancelled-pull-still-runs-is-refused-test
  (testing "an admin requests a cancel after the save of a pull, then turns on sync for a collection: the toggle is
            refused while the pull still runs, and the pull records its success"
    (with-pull-settings
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Toggled after the cancel"}]
        (let [src         (test-helpers/versioned-source :trees {"v1" (files (range 2))} :current "v1")
              hook-result (atom nil)
              hook!       (fn [task-id]
                            (on-plain-thread!
                             (fn []
                               (remote-sync.task/cancel-sync-task! task-id)
                               (ex-message
                                (try
                                  (remote-sync.core/bulk-set-remote-sync {coll-id true})
                                  (catch Exception e e))))))
              task-id     (pull-with-hook! (source.p/snapshot src) hook! hook-result)]
          (is (= "Remote sync task in progress" @hook-result)
              "the collection toggle was refused while the pull still ran")
          (is (=? {:status :successful :cancelled false :version "v1"} (task-row task-id))
              "the pull finished after its save and recorded its success")
          (is (= new-branch (settings/remote-sync-branch)))
          (remote-sync.core/bulk-set-remote-sync {coll-id true})
          (is (true? (:is_remote_synced (t2/select-one :model/Collection :id coll-id)))
              "the toggle ran after the pull ended"))))))

(defn- save-settings-after-the-cancel!
  "A hook for [[pull-with-hook!]]: on a thread that conveys no bindings, cancels the task, then saves `settings` as
  the settings API does, with no remote check. Returns the message of what the save threw, or :saved."
  [settings]
  (fn [task-id]
    (on-plain-thread!
     (fn []
       (mt/with-dynamic-fn-redefs [settings/check-git-settings! (constantly nil)]
         (remote-sync.task/cancel-sync-task! task-id)
         (try
           (settings/check-and-update-remote-settings! settings)
           :saved
           (catch Exception e
             (ex-message e))))))))

(deftest settings-save-while-a-cancelled-pull-still-runs-is-refused-test
  (with-pull-settings
    (mt/with-temporary-raw-setting-values [remote-sync-url "file:///cancel-after-save"]
      (doseq [[desc save] [["a save of auto-import only"
                            {:remote-sync-auto-import false}]
                           ["a save of the whole form, with the URL and the branch that are stored"
                            {:remote-sync-url         "file:///cancel-after-save"
                             :remote-sync-type        :read-write
                             :remote-sync-branch      "main"
                             :remote-sync-auto-import false
                             :remote-sync-transforms  false}]]]
        (testing (str "an admin requests a cancel after the save of a pull, then makes " desc)
          (let [src         (test-helpers/versioned-source :trees {"v1" (files (range 2))} :current "v1")
                hook-result (atom nil)
                task-id     (pull-with-hook! (source.p/snapshot src) (save-settings-after-the-cancel! save) hook-result)]
            (is (= "Remote sync task in progress" @hook-result)
                "the settings save was refused while the pull still ran")
            (is (=? {:status :successful :cancelled false :version "v1"} (task-row task-id))
                "the pull finished after its save and recorded its success")
            (is (= new-branch (settings/remote-sync-branch)) "the setting names the branch that the pull saved")
            (mt/with-temporary-raw-setting-values [remote-sync-auto-import "true"]
              (mt/with-dynamic-fn-redefs [settings/check-git-settings! (constantly nil)]
                (settings/check-and-update-remote-settings! save))
              (is (false? (settings/remote-sync-auto-import))
                  "the settings save ran after the pull ended"))))
        (settings/remote-sync-branch! "main")))))

(deftest settings-save-of-a-new-branch-while-a-cancelled-pull-still-runs-is-refused-test
  (testing "an admin requests a cancel after the save of a pull, then saves another branch: the save is refused while
            the pull still runs, and the pull records its success and writes its branch"
    (with-pull-settings
      (mt/with-temporary-raw-setting-values [remote-sync-url "file:///cancel-after-save"]
        (let [src         (test-helpers/versioned-source :trees {"v1" (files (range 2))} :current "v1")
              hook-result (atom nil)
              task-id     (pull-with-hook! (source.p/snapshot src)
                                           (save-settings-after-the-cancel! {:remote-sync-branch "admin-branch"})
                                           hook-result)]
          (is (= "Remote sync task in progress" @hook-result)
              "the settings save was refused while the pull still ran")
          (is (= new-branch (settings/remote-sync-branch))
              "the setting names the branch that the pull saved")
          (is (=? {:status :successful :cancelled false :version "v1"} (task-row task-id))
              "the pull finished after its save and recorded its success")
          (mt/with-dynamic-fn-redefs [settings/check-git-settings! (constantly nil)]
            (settings/check-and-update-remote-settings! {:remote-sync-branch "admin-branch"}))
          (is (= "admin-branch" (settings/remote-sync-branch))
              "the settings save ran after the pull ended"))))))

(deftest superseded-pull-writes-no-audit-event-test
  (mt/with-premium-features #{:remote-sync :audit-app}
    (mt/with-model-cleanup [:model/AuditLog]
      (with-pull-settings
        (mt/with-temporary-raw-setting-values [remote-sync-url "file:///cancel-after-save"]
          (let [src         (test-helpers/versioned-source :trees {"v1" (files (range 2))} :current "v1")
                hook-result (atom nil)
                hook!       (fn [task-id]
                              (on-plain-thread!
                               (fn []
                                 (let [long-ago (t/minus (t/offset-date-time) (t/days 1))]
                                   (t2/update! :model/RemoteSyncTask task-id {:last_heartbeat_at       long-ago
                                                                              :last_progress_report_at long-ago}))
                                 (remote-sync.task/supersede-stale-tasks!)
                                 (settings/remote-sync-branch))))
                task-id     (pull-with-hook! (source.p/snapshot src) hook! hook-result
                                             :on-success (fn [task-id _result]
                                                           (impl/publish-sync-event! :event/remote-sync-import task-id
                                                                                     {:branch new-branch}
                                                                                     (mt/user->id :rasta))))]
            (is (= "main" @hook-result) "the supersede ran after the save of the pull")
            (is (=? {:status :cancelled :version "v1"} (task-row task-id)) "the row does not record the success")
            (is (= "main" (settings/remote-sync-branch)) "the superseded pull does not write its branch")
            (is (not (t2/exists? :model/AuditLog :topic "remote-sync-import" :model_id task-id))
                "the pull writes no audit event that names its branch")))))))

(deftest transforms-save-while-a-cancelled-pull-still-runs-is-refused-test
  (testing "an admin requests a cancel after the save of a pull of content with no transforms, then turns on
            remote-sync-transforms: the save is refused while the pull still runs; after it ends the save runs"
    (with-pull-settings
      (mt/with-temporary-raw-setting-values [remote-sync-url "file:///cancel-after-save"]
        (let [src         (test-helpers/versioned-source :trees {"v1" (files (range 2))} :current "v1")
              hook-result (atom nil)
              task-id     (pull-with-hook! (source.p/snapshot src)
                                           (fn [task-id]
                                             (on-plain-thread!
                                              (fn []
                                                (remote-sync.task/cancel-sync-task! task-id)
                                                (ex-message
                                                 (try
                                                   (settings/check-and-update-remote-settings!
                                                    {:remote-sync-transforms true})
                                                   (catch Exception e e))))))
                                           hook-result)]
          (is (= "Remote sync task in progress" @hook-result)
              "the transforms save was refused while the pull still ran")
          (is (false? (settings/remote-sync-transforms)) "the setting keeps the value that the pull left")
          (is (=? {:status :successful :cancelled false :version "v1"} (task-row task-id))
              "the pull finished after its save and recorded its success")
          (is (= new-branch (settings/remote-sync-branch)) "the setting names the branch that the pull saved")
          (settings/check-and-update-remote-settings! {:remote-sync-transforms true})
          (is (true? (settings/remote-sync-transforms)) "the save ran after the pull ended"))))))

(deftest whole-form-save-while-a-cancelled-pull-still-runs-is-refused-test
  (testing "the pull turns off remote-sync-transforms after its save; then an admin requests a cancel and saves the
            whole form with the stored URL and branch and the transforms value that the form showed before the pull:
            the save is refused while the pull still runs"
    (with-pull-settings
      (mt/with-temporary-raw-setting-values [remote-sync-url "file:///cancel-after-save" remote-sync-transforms "true"]
        (let [src         (test-helpers/versioned-source :trees {"v1" (files (range 2))} :current "v1")
              hook-result (atom nil)
              save!       (save-settings-after-the-cancel! {:remote-sync-url         "file:///cancel-after-save"
                                                            :remote-sync-type        :read-write
                                                            :remote-sync-branch      "main"
                                                            :remote-sync-auto-import false
                                                            :remote-sync-transforms  true})
              task-id     (:id (remote-sync.task/create-sync-task! "import" (mt/user->id :rasta)))]
          (mt/with-dynamic-fn-redefs [remote-sync.task/make-progress-reporter
                                      (hook-before-forced-report! #(== 0.95 %)
                                                                  (fn [task-id]
                                                                    (let [seen (settings/remote-sync-transforms)]
                                                                      [seen (save! task-id)]))
                                                                  hook-result)]
            (impl/run-task-body! task-id new-branch
                                 (fn [tid] (impl/import! (source.p/snapshot src) tid {:force? true}))))
          (is (= [false "Remote sync task in progress"] @hook-result)
              "the pull turned the setting off, and the form save was refused while the pull still ran")
          (is (false? (settings/remote-sync-transforms)) "the setting keeps the value that the pull wrote")
          (is (=? {:status :successful :cancelled false :version "v1"} (task-row task-id))
              "the pull finished after its save and recorded its success")
          (is (= new-branch (settings/remote-sync-branch)) "the setting names the branch that the pull saved"))))))

(defn- hook-after-forced-report!
  "A progress reporter factory that runs `(hook! task-id)` once, just after the forced report of `fraction`, and
  records its value in `hook-result`."
  [fraction hook! hook-result]
  (let [orig (mt/original-fn #'remote-sync.task/make-progress-reporter)]
    (fn make-reporter
      ([task-id] (make-reporter task-id nil))
      ([task-id opts]
       (let [report (orig task-id opts)]
         (fn
           ([f] (report f))
           ([f report-opts]
            (let [x (report f report-opts)]
              (when (and (:force? report-opts) (== fraction f) (compare-and-set! hook-result nil ::running))
                (reset! hook-result (hook! task-id)))
              x))))))))

(deftest transforms-save-after-a-cancel-request-before-the-save-is-refused-test
  (testing "an admin requests a cancel of a pull of content with transforms before its save, then saves
            remote-sync-transforms off: the save is refused while the pull still runs, and the pull enables nothing
            and stops before its save"
    (mt/with-premium-features #{:transforms-basic}
      (with-pull-settings
        (mt/with-temporary-raw-setting-values [remote-sync-url "file:///cancel-after-save"]
          (let [coll-eid    "cancelaftersavetrcoll"
                src         (test-helpers/versioned-source
                             :trees {"v1" {"collections/transforms/cas_transforms/cas_transforms.yaml"
                                           (test-helpers/generate-collection-yaml coll-eid "CAS transforms"
                                                                                  :namespace "transforms")
                                           "collections/transforms/cas_transforms/cas_transform.yaml"
                                           (test-helpers/generate-transform-yaml "cancelaftersavetransf" "CAS transform"
                                                                                 :collection-id coll-eid)}}
                             :current "v1")
                task-id     (:id (remote-sync.task/create-sync-task! "import" (mt/user->id :rasta)))
                hook-result (atom nil)]
            (mt/with-dynamic-fn-redefs [remote-sync.task/make-progress-reporter
                                        (hook-after-forced-report!
                                         0.7
                                         (fn [task-id]
                                           (on-plain-thread!
                                            (fn []
                                              (remote-sync.task/cancel-sync-task! task-id)
                                              (ex-message
                                               (try
                                                 (settings/check-and-update-remote-settings!
                                                  {:remote-sync-transforms false})
                                                 (catch Exception e e))))))
                                         hook-result)]
              (impl/run-task-body! task-id new-branch (fn [tid] (impl/import! (source.p/snapshot src) tid {:force? true}))))
            (is (= "Remote sync task in progress" @hook-result)
                "the settings save was refused while the pull still ran")
            (is (false? (settings/remote-sync-transforms))
                "the setting stays off: the pull enabled nothing after the cancel request")
            (is (=? {:status :cancelled :cancelled true :version nil} (task-row task-id))
                "the pull stopped before its save")
            (is (nil? (remote-sync.task/last-version)))))))))

(defn- hook-before-set-version!
  "A replacement for `set-version!` that runs `(hook! task-id)` once, just before the version write of `task-id`,
  inside the open save transaction, and records its value in `hook-result`."
  [task-id hook! hook-result]
  (let [orig (mt/original-fn #'remote-sync.task/set-version!)]
    (fn [tid version]
      (when (and (= task-id tid) (compare-and-set! hook-result nil ::running))
        (reset! hook-result (hook! tid)))
      (orig tid version))))

(defn- pull-with-hook-before-set-version!
  "Runs a forced pull of `snapshot` to [[new-branch]] through `run-task-body!`, and runs `(hook! task-id)` on the
  worker thread while the save transaction is open, before it writes the version. Records the value of the hook in
  `hook-result` and returns the task id."
  [snapshot hook! hook-result]
  (let [task-id (:id (remote-sync.task/create-sync-task! "import" (mt/user->id :rasta)))]
    (mt/with-dynamic-fn-redefs [remote-sync.task/set-version! (hook-before-set-version! task-id hook! hook-result)]
      (impl/run-task-body! task-id new-branch (fn [tid] (impl/import! snapshot tid {:force? true}))))
    task-id))

(defn- cancel-and-create-branch!
  "A hook: on a thread that conveys no bindings, requests a cancel of the task, then creates the branch
  admin-branch from main with the source `src`. Returns the message of what the creation threw, or the branch
  setting after a successful creation."
  [src]
  (fn [task-id]
    (on-plain-thread!
     (fn []
       (mt/with-dynamic-fn-redefs [source/source-from-settings (fn [& _] src)]
         (remote-sync.task/cancel-sync-task! task-id)
         (try
           (impl/create-branch! "admin-branch" "main")
           (settings/remote-sync-branch)
           (catch Exception e
             (ex-message e))))))))

(deftest create-branch-after-a-cancel-request-during-the-save-is-refused-test
  (testing "an admin requests a cancel while the save transaction of a pull is open and has not written the version,
            then creates a branch: the creation is refused while the pull still runs, and the pull records its
            success and writes its branch"
    (with-pull-settings
      (mt/with-temporary-raw-setting-values [remote-sync-url "file:///cancel-after-save"]
        (let [src         (test-helpers/versioned-source :trees {"v1" (files (range 2))} :current "v1")
              hook-result (atom nil)
              task-id     (pull-with-hook-before-set-version! (source.p/snapshot src) (cancel-and-create-branch! src)
                                                              hook-result)]
          (is (= "Remote sync task in progress" @hook-result)
              "the branch creation was refused while the pull still ran")
          (is (= new-branch (settings/remote-sync-branch))
              "the setting names the branch that the pull saved")
          (is (=? {:status :successful :cancelled false :version "v1"} (task-row task-id))
              "the pull finished after its save and recorded its success"))))))

(deftest settings-save-of-a-new-branch-after-a-cancel-request-during-the-save-is-refused-test
  (testing "an admin requests a cancel while the save transaction of a pull is open and has not written the version,
            then saves another branch: the save is refused while the pull still runs"
    (with-pull-settings
      (mt/with-temporary-raw-setting-values [remote-sync-url "file:///cancel-after-save"]
        (let [src         (test-helpers/versioned-source :trees {"v1" (files (range 2))} :current "v1")
              hook-result (atom nil)
              task-id     (pull-with-hook-before-set-version!
                           (source.p/snapshot src)
                           (save-settings-after-the-cancel! {:remote-sync-branch "admin-branch"})
                           hook-result)]
          (is (= "Remote sync task in progress" @hook-result)
              "the settings save was refused while the pull still ran")
          (is (= new-branch (settings/remote-sync-branch))
              "the setting names the branch that the pull saved")
          (is (=? {:status :successful :cancelled false :version "v1"} (task-row task-id))
              "the pull finished after its save and recorded its success"))))))

(deftest auto-import-that-read-a-stale-branch-during-the-save-skips-its-tick-test
  (testing "an auto-import that reads the branch setting while the save transaction of a pull to another branch is
            open does not load the stale branch after the pull ends: the setting and the app DB hold the same branch"
    (with-pull-settings
      (mt/with-temporary-raw-setting-values [remote-sync-url         "file:///cancel-after-save"
                                             remote-sync-type        "read-only"
                                             remote-sync-auto-import "true"]
        (let [src         (test-helpers/versioned-source :trees {"v1" (files (range 2)) "m1" (files [0])}
                                                         :current "m1")
              old-ended   (promise)
              in-snapshot (promise)
              auto-import (atom nil)
              hook-result (atom nil)
              hook!       (fn [task-id]
                            (cancel-on-plain-thread! task-id)
                            (reset! auto-import
                                    (start-plain-thread!
                                     (fn []
                                       (mt/with-dynamic-fn-redefs [source/source-from-settings
                                                                   (fn [& _] (slow-source src in-snapshot old-ended))]
                                         (#'task.import/auto-import!)
                                         :ok))))
                            ;; the auto-import read the branch setting and waits in its fetch
                            (deref in-snapshot 20000 :timed-out))
              task-id     (pull-with-hook-before-set-version! (source.p/snapshot-at src "v1") hook! hook-result)
              _           (deliver old-ended true)
              auto-result (deref @auto-import 20000 :timed-out)]
          (is (true? @hook-result) "the auto-import read the branch setting before the pull ended")
          (is (= :ok auto-result) "the auto-import ran to its end")
          (is (= 1 (t2/count :model/RemoteSyncTask)) "the auto-import made no task of the stale branch")
          (is (=? {:status :successful :cancelled false :version "v1"} (task-row task-id))
              "the pull finished after its save and recorded its success")
          (is (= new-branch (settings/remote-sync-branch))
              "the setting names the branch that the pull saved")
          (is (= 2 (t2/count :model/Card :entity_id [:in (map card-eid (range 2))]))
              "the app DB holds the content that the pull loaded"))))))

(deftest create-branch-after-a-cancel-request-during-the-push-is-refused-test
  (testing "an admin requests a cancel of a forced export after its last cancel check and before it writes the
            version, then creates a branch: the creation is refused while the export still runs, and the export
            records its success"
    (with-pull-settings
      (mt/with-temporary-raw-setting-values [remote-sync-url "file:///cancel-after-save"]
        (let [src         (test-helpers/versioned-source :trees {"v0" (files (range 2))} :current "v0")
              _           (is (= :success (:status (import-baseline! src "v0"))) "the baseline import of v0")
              dst         (test-helpers/versioned-source :trees {"empty" {}} :current "empty")
              task-id     (:id (remote-sync.task/create-sync-task! "export" (mt/user->id :rasta)))
              hook-result (atom nil)]
          (mt/with-dynamic-fn-redefs [remote-sync.task/set-version!
                                      (hook-before-set-version! task-id (cancel-and-create-branch! src) hook-result)]
            (impl/run-task-body! task-id new-branch
                                 (fn [tid] (impl/export! (source.p/snapshot dst) tid "export" :force? true))))
          (is (= "Remote sync task in progress" @hook-result)
              "the branch creation was refused while the export still ran")
          (is (= new-branch (settings/remote-sync-branch))
              "the setting names the branch that the export pushed to")
          (is (=? {:status :successful :cancelled false :version "written-1"} (task-row task-id))
              "the export finished and recorded its success"))))))

(deftest cancel-that-arrives-after-the-success-keeps-the-success-test
  (testing "the cancel API finds the task running, then the task records its success, then the cancel runs: the row
            keeps the success"
    (mt/with-premium-features #{:remote-sync}
      (mt/with-temporary-raw-setting-values [remote-sync-branch "main"]
        (let [task-id  (:id (remote-sync.task/create-sync-task! "import" (mt/user->id :rasta)))
              running? (mt/original-fn #'remote-sync.task/running?)
              recorded (atom nil)]
          (remote-sync.task/set-version! task-id "v1")
          (mt/with-dynamic-fn-redefs [remote-sync.task/running?
                                      (fn [task]
                                        (let [r (running? task)]
                                          (when (and (= task-id (:id task)) (compare-and-set! recorded nil ::running))
                                            (reset! recorded
                                                    (on-plain-thread!
                                                     #(impl/handle-task-result!
                                                       {:status :success :outcome {:kind "pulled" :count 1 :branch new-branch}}
                                                       task-id new-branch))))
                                          r))]
            (mt/user-http-request :crowberto :post "ee/remote-sync/current-task/cancel"))
          (is (true? @recorded) "the task recorded its success after the API found it running")
          (is (=? {:status :successful :cancelled false :error_message nil :version "v1"} (task-row task-id))
              "the row keeps the success"))))))

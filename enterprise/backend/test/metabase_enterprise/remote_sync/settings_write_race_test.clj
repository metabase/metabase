(ns metabase-enterprise.remote-sync.settings-write-race-test
  "A pull that writes a setting while an admin saves settings on another thread. Each test forces the order: the
  admin save holds the `settings-last-updated` row while the worker of the pull writes its setting."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.search.test-util :as search.tu]
   [metabase.settings.core :as setting]
   [metabase.settings.models.setting.cache :as setting.cache]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each test-helpers/clean-remote-sync-state test-helpers/commit-with-temp)

(def ^:private new-branch "settings-write-race-branch")

(def ^:private url "file:///settings-write-race")

(def ^:private coll-eid "settingswriteracecoll")

(defn- card-eid [i] (format "settingswrite%08d" i))

(defn- card-files
  "A remote-synced collection with the cards `card-ids`, as a {path content} tree."
  [card-ids]
  (into {"collections/settings_write_race/settings_write_race.yaml"
         (test-helpers/generate-collection-yaml coll-eid "Settings write race" :is-remote-synced true)}
        (for [i card-ids]
          [(format "collections/settings_write_race/cards/card_%03d.yaml" i)
           (test-helpers/generate-card-yaml (card-eid i) (str "Card " i) coll-eid)])))

(def ^:private transforms-files
  "A transforms collection with one transform, as a {path content} tree."
  {"collections/transforms/swr_transforms/swr_transforms.yaml"
   (test-helpers/generate-collection-yaml coll-eid "SWR transforms" :namespace "transforms")
   "collections/transforms/swr_transforms/swr_transform.yaml"
   (test-helpers/generate-transform-yaml "settingswriteracetrns" "SWR transform" :collection-id coll-eid)})

(defn- task-row [task-id]
  (-> (t2/select-one :model/RemoteSyncTask :id task-id)
      (t2/hydrate :status)
      (select-keys [:status :cancelled :error_message :version])))

(defn- stored-branch
  "The value of the `remote-sync-branch` row of the app DB."
  []
  (t2/select-one-fn :value :model/Setting :key "remote-sync-branch"))

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

(defn- arming
  "A replacement for the function of the var `v` that sets `armed` to true, then calls the original function."
  [v armed]
  (let [orig (mt/original-fn v)]
    (fn [& args]
      (reset! armed true)
      (apply orig args))))

(defn- forced-marker-order!
  "A replacement for `update-settings-last-updated!` that orders the writes of the `settings-last-updated` row of two
  threads. On the thread in `admin-thread`, the first write runs, then delivers `admin-holds` and waits at most 20
  seconds for `worker-writes`. On any other thread, while `armed` is true, a write first delivers `worker-writes`."
  [{:keys [admin-thread admin-holds worker-writes armed]}]
  (let [orig   (mt/original-fn #'setting.cache/update-settings-last-updated!)
        first? (atom true)]
    (fn []
      (if (= (Thread/currentThread) @admin-thread)
        (let [x (orig)]
          (when (compare-and-set! first? true false)
            (deliver admin-holds true)
            (deref worker-writes 20000 nil))
          x)
        (do
          (when @armed
            (deliver worker-writes true))
          (orig))))))

(defn- start-admin!
  "Starts a future that records its thread in `admin-thread`, waits at most 20 seconds for `go`, then calls `f`.
  Returns the future. Its value is :ok, or the message of what `f` threw."
  [admin-thread go f]
  (future
    (reset! admin-thread (Thread/currentThread))
    (when (deref go 20000 nil)
      (try
        (f)
        :ok
        (catch Throwable t
          (ex-message t))))))

(defmacro ^:private with-pull-settings [& body]
  `(do
     (mt/id) ; the content of the snapshot names the test-data database
     (search.tu/with-index-disabled
       (mt/with-temporary-raw-setting-values [remote-sync-type "read-write" remote-sync-transforms "false"
                                              remote-sync-branch "main" remote-sync-url ~url]
         ~@body))))

(deftest pull-that-turns-on-transforms-and-a-multi-setting-save-both-succeed-test
  (testing "a pull that turns on remote-sync-transforms before its save, and an admin save of two other settings in one
            transaction at the same time, both succeed"
    (mt/with-premium-features #{:transforms-basic}
      (with-pull-settings
        (mt/with-temporary-raw-setting-values [site-name "Before the race" anon-tracking-enabled "false"]
          ;; an admin turned transforms sync on and then off, which leaves a Transforms ledger row
          (settings/remote-sync-transforms! true)
          (settings/remote-sync-transforms! false)
          (let [src          (test-helpers/versioned-source :trees {"v1" transforms-files} :current "v1")
                task-id      (:id (remote-sync.task/create-sync-task! "import" (mt/user->id :rasta)))
                order        {:admin-thread  (atom nil)
                              :admin-holds   (promise)
                              :worker-writes (promise)
                              :armed         (atom false)}
                go           (promise)
                hook-result  (atom nil)
                admin-result (atom nil)]
            (mt/with-dynamic-fn-redefs [setting.cache/update-settings-last-updated! (forced-marker-order! order)
                                        impl/set-transforms-setting!                (arming #'impl/set-transforms-setting!
                                                                                            (:armed order))
                                        remote-sync.task/make-progress-reporter
                                        (hook-after-forced-report! 0.7
                                                                   (fn [_]
                                                                     (deliver go true)
                                                                     (deref (:admin-holds order) 20000 :timed-out))
                                                                   hook-result)]
              (let [admin (start-admin! (:admin-thread order) go
                                        #(setting/set-many! {:site-name             "After the race"
                                                             :anon-tracking-enabled true}))]
                (impl/run-task-body! task-id new-branch
                                     (fn [tid] (impl/import! (source.p/snapshot src) tid {:force? true})))
                (reset! admin-result (deref admin 30000 :timed-out))))
            (is (true? @hook-result) "the admin save held the settings-last-updated row when the pull went on")
            (is (realized? (:worker-writes order)) "the pull wrote remote-sync-transforms while the admin save was open")
            (is (= :ok @admin-result) "the admin save succeeds")
            (is (=? {:status :successful :error_message nil :version "v1"} (task-row task-id)) "the pull succeeds")
            (is (true? (settings/remote-sync-transforms)) "the pull turned on remote-sync-transforms")
            (is (= "After the race" (setting/get :site-name)) "the admin save wrote its settings")))))))

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

(deftest settings-save-during-a-cancelled-pull-is-refused-and-the-cache-stays-equal-test
  (testing "an admin requests a cancel of a pull after its save, then saves the whole form with a new transforms
            value, while the pull still runs: the save is refused, and the branch in the settings cache equals the
            branch in the app DB"
    (with-pull-settings
      (let [src         (test-helpers/versioned-source :trees {"v1" (card-files (range 2))} :current "v1")
            task-id     (:id (remote-sync.task/create-sync-task! "import" (mt/user->id :rasta)))
            hook-result (atom nil)
            hook!       (fn [_]
                          ;; the worker parks inside this hook, so its row is still active while the admin acts
                          (on-plain-thread!
                           (fn []
                             (remote-sync.task/cancel-sync-task! task-id)
                             (try
                               (settings/check-and-update-remote-settings!
                                {:remote-sync-url         url
                                 :remote-sync-type        :read-write
                                 :remote-sync-branch      "main"
                                 :remote-sync-auto-import false
                                 :remote-sync-transforms  true})
                               :saved
                               (catch Exception e
                                 (ex-message e))))))]
        (mt/with-dynamic-fn-redefs [settings/check-git-settings! (constantly nil)
                                    remote-sync.task/make-progress-reporter
                                    (hook-after-forced-report! 0.9 hook! hook-result)]
          (impl/run-task-body! task-id new-branch
                               (fn [tid] (impl/import! (source.p/snapshot src) tid {:force? true}))))
        (is (= "Remote sync task in progress" @hook-result)
            "the settings save was refused while the pull still ran")
        (is (=? {:status :successful :error_message nil :version "v1"} (task-row task-id))
            "the pull finished after its save and recorded its success")
        (is (false? (settings/remote-sync-transforms)) "the setting keeps the value that the pull left")
        (is (= (stored-branch) (settings/remote-sync-branch))
            "the settings cache of this node holds the branch that the app DB holds")))))

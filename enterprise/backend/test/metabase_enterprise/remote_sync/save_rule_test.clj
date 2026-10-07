(ns metabase-enterprise.remote-sync.save-rule-test
  "The save rule of a merge pull: the pull writes an entity only while the entity has the content that the merge read,
  and a change that a user makes during the pull is never lost. A changed entity stops the pull with a conflict.

  Not ^:parallel: uses the shared remote-sync fixtures. A concurrent save runs on a plain Thread, not on a future: a
  future conveys the connection binding of the pull, so the save would run in the transaction of the pull."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.remote-sync.db :as remote-sync.db]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-object :as remote-sync.object]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.save-rule :as save-rule]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase.app-db.core :as mdb]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.serialization :as serdes]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2])
  (:import
   (java.time Instant OffsetDateTime ZoneOffset)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each test-helpers/clean-remote-sync-state test-helpers/commit-with-temp)

;;; ------------------------------------------------- helpers -------------------------------------------------

(defn- tree
  "The files in `snapshot`, as a map of path to content."
  [snapshot]
  (into {} (map (juxt identity #(source.p/read-file snapshot %))) (source.p/list-files snapshot)))

(defn- sync!
  "Run `f` with a new sync task of `task-type`, complete the task, and return the result of `f`."
  [task-type f]
  (let [task-id (t2/insert-returning-pk! :model/RemoteSyncTask {:sync_task_type task-type
                                                                :initiated_by   (mt/user->id :rasta)})
        result  (f task-id)]
    (remote-sync.task/complete-sync-task! task-id)
    result))

(defn- export-and-pull!
  "Push the synced content of the app DB to an empty repository as the version \"v0\", and force-pull it, so that the
  ledger records it as the last sync. Returns the files of the repository."
  []
  (let [src0 (test-helpers/versioned-source :trees {"empty" {}} :current "empty")
        _    (sync! "export" #(impl/export! (source.p/snapshot src0) % "initial" :force? true))
        t0   (tree (source.p/snapshot src0))]
    (sync! "import" #(impl/import! (source.p/snapshot (test-helpers/versioned-source :trees {"v0" t0} :current "v0"))
                                   % :force? true))
    t0))

(defn- with-report-hook
  "Call `thunk` with each progress report of an import first calling `(on-report fraction)`."
  [on-report thunk]
  (let [real (mt/original-fn #'impl/import-progress-reporter)]
    (mt/with-dynamic-fn-redefs [impl/import-progress-reporter (fn [task-id]
                                                                (let [report (real task-id)]
                                                                  (fn [fraction & opts]
                                                                    (on-report fraction)
                                                                    (apply report fraction opts))))]
      (thunk))))

(defn- merge-pull!
  "Merge-pull the files `t1` as the version \"v1\" over the base `t0` (the version \"v0\"). Calls `(on-report
  fraction)` before each progress report. Returns `[src result]`."
  ([t0 t1] (merge-pull! t0 t1 (constantly nil)))
  ([t0 t1 on-report]
   (let [src (test-helpers/versioned-source :trees {"v0" t0 "v1" t1} :current "v1")]
     (with-report-hook on-report
       #(vector src (sync! "import" (fn [task-id]
                                      (impl/import! (source.p/snapshot src) task-id
                                                    :merge? true :base-snapshot (source.p/snapshot-at src "v0")))))))))

(defn- merge-pull-again!
  "Merge-pull the current version of `src` again over the base \"v0\"."
  [src]
  (sync! "import" #(impl/import! (source.p/snapshot src) % :merge? true :base-snapshot (source.p/snapshot-at src "v0"))))

(defn- once-at!
  "A function of a progress fraction that calls `f` the first time the fraction is `fraction`."
  [fraction f]
  (let [done (atom false)]
    (fn [x]
      (when (and (= fraction x) (compare-and-set! done false true))
        (f)))))

(defn- path-of
  "The path of the file in `t` whose `name:` is `entity-name`."
  [t entity-name]
  (some (fn [[p c]] (when (str/includes? c (str "name: " entity-name "\n")) p)) t))

(defn- edit
  "`t` with the description \"original\" of the entity `entity-name` replaced by `text`."
  [t entity-name text]
  (update t (path-of t entity-name) str/replace "description: original" (str "description: " text)))

(defn- publish-card-update!
  "Publish the update event of the card `card-id`, as the card API does after its write."
  [card-id]
  (let [card (t2/select-one :model/Card card-id)]
    (events/publish-event! :event/card-update {:object card :previous-object card :user-id (mt/user->id :rasta)})))

(defn- save!
  "Set the description of the card `card-id` and publish its update event, as a save from the card API does."
  [card-id description]
  (t2/update! :model/Card card-id {:description description})
  (publish-card-update! card-id))

(defn- publish-dashboard-update!
  "Publish the update event of the dashboard `dashboard-id`, as the dashboard API does after its write."
  [dashboard-id]
  (events/publish-event! :event/dashboard-update {:object  (t2/select-one :model/Dashboard dashboard-id)
                                                  :user-id (mt/user->id :rasta)}))

(defn- row
  "The `:status`, `:content_hash` and `:file_path` of the ledger row of the entity `model-type` `id`."
  [model-type id]
  (t2/select-one [:model/RemoteSyncObject :status :content_hash :file_path] :model_type model-type :model_id id))

(defn- desc
  "The description of the card `card-id`."
  [card-id]
  (t2/select-one-fn :description :model/Card card-id))

(defn- summary
  "The parts of a pull result that a failed assertion shows."
  [result]
  (select-keys result [:status :conflicts :message]))

(defn- venues-query
  "An MBQL query of the venues table of the test data."
  []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :venues)))))

(defmacro ^:private with-sync-settings
  "Run `body` with read-write remote sync, and with no search reindex."
  [& body]
  `(mt/with-temporary-setting-values [~'remote-sync-enabled true ~'remote-sync-type :read-write]
     (mt/with-dynamic-fn-redefs [search/reindex! (constantly nil)]
       ~@body)))

(defn- do-with-synced-cards!
  "Three synced cards A, B and C with the description \"original\", pushed and pulled as the version \"v0\". Calls
  `(f {:a :b :c :t0})`."
  [f]
  (with-sync-settings
    (mt/with-temp [:model/Collection {coll-id :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                   :model/Card {a :id} {:name "Card A" :description "original" :collection_id coll-id}
                   :model/Card {b :id} {:name "Card B" :description "original" :collection_id coll-id}
                   :model/Card {c :id} {:name "Card C" :description "original" :collection_id coll-id}]
      (f {:a a :b b :c c :t0 (export-and-pull!)}))))

(defn- on-thread
  "Run `f` on a plain Thread, with no binding of the calling thread. Returns a promise of `{:ms :result}`, or of `{:ms
  :error}` with the messages of the exception and its causes."
  [f]
  (let [p (promise)]
    (.start (Thread. ^Runnable
             (fn []
               (let [start (System/nanoTime)
                     ms    #(long (/ (- (System/nanoTime) start) 1e6))]
                 (deliver p (try
                              {:result (f) :ms (ms)}
                              (catch Throwable e
                                {:ms    (ms)
                                 :error (str/join " | " (keep ex-message (take-while some? (iterate ex-cause e))))})))))))
    p))

(defn- hold-at!
  "A function that, the first time `(pred & args)` holds, starts `f` on a plain Thread and then waits `hold-ms` on the
  calling thread. Returns `[hold! user]`: call `(hold! & args)` at the fixed point, and deref `user` for the result of
  `f` (see [[on-thread]])."
  [pred f hold-ms]
  (let [user (promise)
        done (atom false)]
    [(fn [& args]
       (when (and (apply pred args) (compare-and-set! done false true))
         (deliver user (on-thread f))
         (Thread/sleep (long hold-ms))))
     user]))

(defn- user-result
  "The result of the concurrent user write of [[hold-at!]], or `{:error \"not started\"}`."
  [user]
  (let [p (deref user 60000 nil)]
    (if p (deref p 60000 {:error "timed out"}) {:error "not started"})))

(defn- ingested-is?
  "A predicate of the arguments of [[serdes/default-load-one!]] that holds for the entity `model-type` with the entity
  id `entity-id`."
  [model-type entity-id]
  (fn [ingested & _]
    (and (= model-type (-> ingested :serdes/meta last :model))
         (= entity-id (:entity_id ingested)))))

(defmacro ^:private holding-the-load
  "Run `body` with the serdes write of each entity first calling `hold!` with its arguments. The pull calls the write
  inside the transaction of the entity, after the save rule locked and compared the entity."
  [hold! & body]
  `(let [real# (mt/original-fn #'serdes/default-load-one!)]
     (mt/with-dynamic-fn-redefs [serdes/default-load-one! (fn [ingested# local#]
                                                            (~hold! ingested# local#)
                                                            (real# ingested# local#))]
       ~@body)))

(defmacro ^:private holding-the-reconcile
  "Run `body` with the delete step of the reconcile transaction of a pull first calling `hold!`. The pull runs the
  delete step after the save rule locked the entity rows of the delete closure and the ledger rows."
  [hold! & body]
  `(let [real# (mt/original-fn #'impl/delete-with-closure!)]
     (mt/with-dynamic-fn-redefs [impl/delete-with-closure! (fn [& args#]
                                                             (~hold!)
                                                             (apply real# args#))]
       ~@body)))

(defn- deadlock?
  "True when the text `s` names a deadlock."
  [s]
  (boolean (some-> s u/lower-case-en (str/includes? "deadlock"))))

;;; ------------------------------- the witness of a save is the content of the entity -------------------------------

(deftest card-write-before-the-load-with-a-late-event-keeps-the-edit-test
  (testing "The user's Card write commits at the start of the load of a merge pull that takes the remote version of
            card A. The save event (the ledger write) runs after the pull, as the card API can order it. The pull does
            not overwrite the edit."
    (do-with-synced-cards!
     (fn [{:keys [a t0]}]
       (let [[_ result] (merge-pull! t0 (edit t0 "Card A" "remote edit A")
                                     (once-at! 0.05 #(t2/update! :model/Card a {:description "edit during pull"})))]
         (publish-card-update! a)
         (is (= :conflict (:status result)) (pr-str (summary result)))
         (is (= "edit during pull" (desc a)) "the edit is not overwritten")
         (is (= "update" (:status (row "Card" a))) "the row stays dirty"))))))

(deftest save-on-a-node-with-a-slow-clock-keeps-the-edit-test
  (testing "The save handler runs on a node whose clock is 2 s behind the node of the pull. The user saves card A,
            which the remote also changed, at the start of the load."
    (do-with-synced-cards!
     (fn [{:keys [a t0]}]
       (let [real-odt   t/offset-date-time
             [_ result] (merge-pull! t0 (edit t0 "Card A" "remote edit A")
                                     (once-at! 0.05 #(with-redefs [t/offset-date-time
                                                                   (fn [& args]
                                                                     (if (seq args)
                                                                       (apply real-odt args)
                                                                       (t/minus (real-odt) (t/seconds 2))))]
                                                       (save! a "edit during pull"))))]
         (is (= :conflict (:status result)) (pr-str (summary result)))
         (is (= "edit during pull" (desc a)) "the edit is not overwritten"))))))

(deftest save-at-the-same-instant-as-the-pull-start-keeps-the-edit-test
  (testing "The save writes the same instant that the pull recorded at its start."
    (do-with-synced-cards!
     (fn [{:keys [a t0]}]
       (let [fixed      (Instant/parse "2030-01-01T00:00:00.123456Z")
             real-inst  t/instant
             real-odt   t/offset-date-time
             [_ result] (with-redefs [t/instant (fn ([] fixed) ([& args] (apply real-inst args)))]
                          (merge-pull! t0 (edit t0 "Card A" "remote edit A")
                                       (once-at! 0.05 #(with-redefs [t/offset-date-time
                                                                     (fn [& args]
                                                                       (if (seq args)
                                                                         (apply real-odt args)
                                                                         (OffsetDateTime/ofInstant fixed ZoneOffset/UTC)))]
                                                         (save! a "edit during pull")))))]
         (is (= :conflict (:status result)) (pr-str (summary result)))
         (is (= "edit during pull" (desc a)) "the edit is not overwritten"))))))

(deftest save-during-the-load-of-a-remote-changed-entity-is-not-overwritten-test
  (testing "A user saves card A at the start of the load of a merge pull that takes the remote version of A. The pull
            does not overwrite the edit: it stops before it writes A."
    (do-with-synced-cards!
     (fn [{:keys [a t0]}]
       (let [[_ result] (merge-pull! t0 (edit t0 "Card A" "remote edit A") (once-at! 0.05 #(save! a "edit during pull")))]
         (is (= :conflict (:status result)) (pr-str (summary result)))
         (is (= "edit during pull" (desc a)))
         (is (= "update" (:status (row "Card" a)))))))))

(deftest no-op-save-during-the-load-does-not-stop-the-pull-test
  (testing "The user saves card A with no change during the load of a merge pull that takes the remote version of A."
    (do-with-synced-cards!
     (fn [{:keys [a t0]}]
       (let [[_ result] (merge-pull! t0 (edit t0 "Card A" "remote edit A") (once-at! 0.05 #(publish-card-update! a)))]
         (is (= :success (:status result)) (pr-str (summary result)))
         (is (= "remote edit A" (desc a)))
         (is (= "synced" (:status (row "Card" a)))))))))

;;; ------------------------------------------------- the pre-check -------------------------------------------------

(defmacro ^:private before-the-pre-check
  "Run `body` with the pre-check of a merge pull first calling `(f)`. The pull runs the pre-check after the merge and
  before the load."
  [f & body]
  `(let [real# (mt/original-fn #'save-rule/pre-check!)]
     (mt/with-dynamic-fn-redefs [save-rule/pre-check! (fn [& args#]
                                                        (~f)
                                                        (apply real# args#))]
       ~@body)))

(deftest save-after-the-merge-and-before-the-load-stops-the-pull-before-any-write-test
  (testing "The remote edits A, B and C. After the merge read ours and before the load, the user saves B. The
            pre-check stops the pull with a conflict on B, and the pull writes nothing."
    (do-with-synced-cards!
     (fn [{:keys [a b c t0]}]
       (let [version0   (remote-sync.task/last-version)
             t1         (-> t0 (edit "Card A" "remote edit A") (edit "Card B" "remote edit B") (edit "Card C" "remote edit C"))
             [_ result] (before-the-pre-check #(save! b "edit before the load") (merge-pull! t0 t1))]
         (is (= :conflict (:status result)) (pr-str (summary result)))
         (is (= ["Card B"] (distinct (keep #(re-find #"Card [ABC]" %) (:conflicts result)))))
         (is (= (str "Import blocked: content changed locally during the pull, and the remote branch also changed it. "
                     "Your local change is kept.")
                (:message result)))
         (is (= version0 (remote-sync.task/last-version)) "a stop does not move the version")
         (is (= ["original" "edit before the load" "original"] [(desc a) (desc b) (desc c)]) "the pull writes nothing")
         (is (= "update" (:status (row "Card" b)))))))))

;;; --------------------------------------------- the stop and what follows ---------------------------------------------

(defn- stopped-pull!
  "The remote edits A, B and C. The user saves B at the start of the load, so the pull stops. Returns `m` with the
  `:src` and the `:result` of the pull."
  [{:keys [b t0] :as m}]
  (let [t1           (-> t0 (edit "Card A" "remote edit A") (edit "Card B" "remote edit B") (edit "Card C" "remote edit C"))
        [src result] (merge-pull! t0 t1 (once-at! 0.05 #(save! b "edit during pull")))]
    (assoc m :src src :result result)))

(deftest stop-reports-a-conflict-on-the-changed-entity-test
  (testing "The remote edits A, B and C. The user saves B at the start of the load. The pull stops with a conflict on
            B, and the next merge pull reports the same conflict and nothing else."
    (do-with-synced-cards!
     (fn [{:keys [b] :as m}]
       (let [version0             (remote-sync.task/last-version)
             {:keys [src result]} (stopped-pull! m)]
         (is (= :conflict (:status result)) (pr-str (summary result)))
         (is (= ["Card B"] (distinct (keep #(re-find #"Card [ABC]" %) (:conflicts result)))))
         (is (= (str "Import blocked: content changed locally during the pull, and the remote branch also changed it. "
                     "Your local change is kept.")
                (:message result)))
         (is (= version0 (remote-sync.task/last-version)) "a stop does not move the version")
         (is (= "edit during pull" (desc b)))
         (is (= "update" (:status (row "Card" b))))
         (testing "the next merge pull"
           (let [result-2 (merge-pull-again! src)]
             (is (= :conflict (:status result-2)))
             (is (= ["Card B"] (distinct (keep #(re-find #"Card [ABC]" %) (:conflicts result-2))))))))))))

(deftest after-a-stop-the-user-discards-the-local-change-test
  (testing "After a stop, the user chooses a forced pull, which discards the local change."
    (do-with-synced-cards!
     (fn [m]
       (let [{:keys [a b c src result]} (stopped-pull! m)
             _      (is (= :conflict (:status result)))
             forced (sync! "import" #(impl/import! (source.p/snapshot src) % :force? true))]
         (is (= :success (:status forced)) (pr-str (summary forced)))
         (is (= ["remote edit A" "remote edit B" "remote edit C"] [(desc a) (desc b) (desc c)]))
         (is (not (remote-sync.object/dirty?))))))))

(deftest after-a-stop-the-user-reverts-the-change-and-pulls-again-test
  (testing "After a stop, the user sets B back to its old text and merge-pulls again."
    (do-with-synced-cards!
     (fn [m]
       (let [{:keys [a b c src result]} (stopped-pull! m)
             _     (is (= :conflict (:status result)))
             _     (save! b "original")
             again (merge-pull-again! src)]
         (is (= :success (:status again)) (pr-str (summary again)))
         (is (= ["remote edit A" "remote edit B" "remote edit C"] [(desc a) (desc b) (desc c)]))
         (is (not (remote-sync.object/dirty?))))))))

(deftest after-a-stop-the-user-force-pushes-test
  (testing "After a stop, the user keeps the local change with a forced push. The preview names the remote edit of B
            as the content that the push replaces."
    (do-with-synced-cards!
     (fn [m]
       (let [{:keys [src result]} (stopped-pull! m)
             _       (is (= :conflict (:status result)))
             preview (serdes/with-cache
                       (source/preview-merge (spec/extract-entities-for-export (spec/exportable-entities))
                                             (source.p/snapshot src) (source.p/snapshot-at src "v0") nil
                                             :synced-hashes (remote-sync.db/synced-content-hashes-by-path)))
             pushed  (sync! "export" #(impl/export! (source.p/snapshot src) % "force" :source src :force? true))
             tip     (tree (source.p/snapshot src))]
         (is (some #(str/includes? % "Card B") (get-in preview [:force-push-casualties :overwritten]))
             (pr-str preview))
         (is (= :success (:status pushed)) (pr-str (summary pushed)))
         (is (str/includes? (get tip (path-of tip "Card B")) "description: edit during pull")))))))

;;; ------------------------------------------- the locks of the load -------------------------------------------

(deftest save-during-the-load-lock-test
  (testing "The remote edits card A. While the load of A holds its locks, the user saves A. The save waits for the
            load and then replaces the remote edit (the last writer wins). The row stays dirty, so the next push sends
            the user's text."
    (do-with-synced-cards!
     (fn [{:keys [a t0]}]
       (let [eid           (t2/select-one-fn :entity_id :model/Card a)
             [hold! user]  (hold-at! (ingested-is? "Card" eid) #(save! a "edit during load") 1500)
             [src result]  (holding-the-load hold! (merge-pull! t0 (edit t0 "Card A" "remote edit A")))
             {:keys [ms error]} (user-result user)]
         (is (= :success (:status result)) (pr-str (summary result)))
         (is (nil? error) "the user's save does not fail")
         (is (>= ms 1000) "the user's save waits for the load of A")
         (is (= "edit during load" (desc a)))
         (is (= "update" (:status (row "Card" a))))
         (let [push (sync! "export" #(impl/export! (source.p/snapshot src) % "push" :source src))
               tip  (tree (source.p/snapshot src))]
           (is (= :success (:status push)) (pr-str (summary push)))
           (is (str/includes? (get tip (path-of tip "Card A")) "description: edit during load"))))))))

(defn- dashcard-change-during-the-load!
  "The remote edits dashboard D. While the load of D holds its locks, after the compare, the user makes `change` to a
  dashboard card of D on another thread, with no write of the row of D, and publishes the update event of D. Returns
  `{:result :user :kept? :row}`: the pull result, the result of the user's write, whether the change stays, and the
  status of the row of D."
  [change]
  (with-sync-settings
    (mt/with-temp [:model/Collection    {coll :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                   :model/Dashboard     {d :id}    {:name "Dash D" :description "original" :collection_id coll}
                   :model/Card          {x :id}    {:name "Card X" :collection_id coll}
                   :model/Card          {z :id}    {:name "Card Z" :collection_id coll}
                   :model/DashboardCard {dc :id}   {:dashboard_id d :card_id x :size_x 4 :size_y 4}]
      (let [t0           (export-and-pull!)
            user!        (fn []
                           (case change
                             :update (t2/update! :model/DashboardCard dc {:size_x 9})
                             :insert (t2/insert! :model/DashboardCard {:dashboard_id d :card_id z :size_x 5 :size_y 5
                                                                       :row 10 :col 0})
                             :delete (t2/delete! :model/DashboardCard dc))
                           (publish-dashboard-update! d))
            [hold! user] (hold-at! (ingested-is? "Dashboard" (t2/select-one-fn :entity_id :model/Dashboard d))
                                   user! 1000)
            [_ result]   (holding-the-load hold! (merge-pull! t0 (edit t0 "Dash D" "remote edit D")))
            dashcards    (t2/select-fn-set (juxt :card_id :size_x) :model/DashboardCard :dashboard_id d)]
        {:result result
         :user   (user-result user)
         :kept?  (case change
                   :update (contains? dashcards [x 9])
                   :insert (contains? dashcards [z 5])
                   :delete (not (contains? dashcards [x 4])))
         :row    (:status (row "Dashboard" d))}))))

(deftest dashcard-only-change-between-the-compare-and-the-load-test
  (testing "The remote edits dashboard D. After the load compared D, the user changes the size of a dashboard card of
            D, with no write of the row of D. The change waits for the load of D and stays, and the row of D is dirty."
    (let [{:keys [result user kept? row]} (dashcard-change-during-the-load! :update)]
      (is (= :success (:status result)) (pr-str (summary result)))
      (is (nil? (:error user)) "the user's change does not fail")
      (is (>= (:ms user) 900) "the user's change waits for the load of D")
      (is kept? "the user's change stays")
      (is (= "update" row) "the row of D is dirty"))))

(deftest child-row-change-between-the-compare-and-the-load-is-not-lost-test
  (testing "The remote edits dashboard D. After the load compared D, the user deletes or adds a dashboard card of D.
            The change waits for the load and stays, and the row of D is dirty."
    (doseq [change [:delete :insert]
            ;; H2 does not make the insert of a dashboard card wait for the lock of its dashboard row, and the load
            ;; then removes the new dashboard card. H2 is not a production app DB.
            :when (not (and (= :insert change) (= :h2 (mdb/db-type))))]
      (testing change
        (let [{:keys [result user kept? row]} (dashcard-change-during-the-load! change)]
          (is (= :success (:status result)) (pr-str (summary result)))
          (is (nil? (:error user)) "the user's change does not fail")
          (is kept? "the user's change stays")
          (is (= "update" row) "the row of D is dirty"))))))

(deftest dashboard-api-update-of-only-dashcards-and-tabs-during-the-load-test
  (testing "The remote edits dashboard D. While the load of D holds its locks, a user sends PUT /api/dashboard/:id with
            only `dashcards` and `tabs`, which does not write the row of D. The request waits for the load, succeeds
            with no deadlock, and its change stays with the row of D dirty."
    (with-sync-settings
      (mt/with-temp [:model/Collection    {coll :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                     :model/Dashboard     {d :id}    {:name "Dash D" :description "original" :collection_id coll}
                     :model/Card          {x :id}    {:name "Card X" :collection_id coll}
                     :model/DashboardCard {dc :id}   {:dashboard_id d :card_id x :size_x 4 :size_y 4 :row 0 :col 0}]
        (let [put!         (fn [size-x]
                             (mt/user-http-request :crowberto :put 200 (str "dashboard/" d)
                                                   {:dashcards [{:id dc :card_id x :size_x size-x :size_y 4 :row 0 :col 0}]
                                                    :tabs      []}))
              ;; the first request in a JVM is slow, so a request with no change comes first: the timed request then
              ;; waits only for the load
              _            (put! 4)
              t0           (export-and-pull!)
              [hold! user] (hold-at! (ingested-is? "Dashboard" (t2/select-one-fn :entity_id :model/Dashboard d))
                                     #(put! 9)
                                     1000)
              [_ result]   (holding-the-load hold! (merge-pull! t0 (edit t0 "Dash D" "remote edit D")))
              {:keys [ms error]} (user-result user)]
          (is (= :success (:status result)) (pr-str (summary result)))
          (is (nil? error) "the request does not fail")
          (is (not (deadlock? error)) "no deadlock")
          (is (>= ms 900) "the request waits for the load of D")
          (is (= 9 (t2/select-one-fn :size_x :model/DashboardCard dc)) "the change of the request stays")
          (is (= "remote edit D" (t2/select-one-fn :description :model/Dashboard d)))
          (is (= "update" (:status (row "Dashboard" d))) "the row of D is dirty"))))))

(deftest remote-edit-of-a-dashboard-and-its-question-does-not-stop-the-pull-test
  (testing "The remote edits dashboard D and its dashboard question Q. Nobody changed anything locally. The load of the
            two is circular (Q needs D, and the dashboard cards of D need Q), so serdes writes one of them two times.
            The pull accepts its own first write."
    (with-sync-settings
      (mt/with-temp [:model/Collection    {coll :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                     :model/Dashboard     {d :id}    {:name "Dash D" :description "original" :collection_id coll}
                     :model/Card          {q :id}    {:name "Question Q" :description "original" :collection_id coll
                                                      :dashboard_id d}
                     :model/DashboardCard _          {:dashboard_id d :card_id q}]
        (let [t0         (export-and-pull!)
              [_ result] (merge-pull! t0 (-> t0 (edit "Dash D" "remote edit D") (edit "Question Q" "remote edit Q")))]
          (is (= :success (:status result)) (pr-str (summary result)))
          (is (= ["remote edit D" "remote edit Q"] [(t2/select-one-fn :description :model/Dashboard d) (desc q)]))
          (is (= ["synced" "synced"] [(:status (row "Dashboard" d)) (:status (row "Card" q))])))))))

;;; ------------------------------------------ the locks of the reconcile ------------------------------------------

(deftest save-event-during-the-reconcile-test
  (testing "The remote edits card A. During the reconcile transaction, the user saves A (a loaded entity) and C (an
            entity that the pull does not touch). Both edits stay dirty, and the save of C does not wait."
    (do-with-synced-cards!
     (fn [{:keys [a c t0]}]
       (let [user-c       (promise)
             [hold! user] (hold-at! (constantly true)
                                    #(do (deliver user-c (on-thread (fn [] (save! c "edit C during reconcile"))))
                                         (save! a "edit A during reconcile"))
                                    1500)
             [_ result]   (holding-the-reconcile hold! (merge-pull! t0 (edit t0 "Card A" "remote edit A")))
             save-a       (user-result user)
             save-c       (user-result user-c)]
         (is (= :success (:status result)) (pr-str (summary result)))
         (is (nil? (:error save-a)))
         (is (= ["edit A during reconcile" "update"] [(desc a) (:status (row "Card" a))]))
         (is (= ["edit C during reconcile" "update"] [(desc c) (:status (row "Card" c))]))
         (is (< (:ms save-c) 1000) "a save of an entity that the pull does not touch does not wait"))))))

(defn- public-link-tx!
  "The transaction of POST /api/<model>/:id/public_link: an update of the entity row, then the event in the same
  transaction."
  [model-key id]
  (t2/with-transaction [_conn]
    (t2/update! model-key id {:public_uuid (str (random-uuid)) :made_public_by_id (mt/user->id :crowberto)})
    (events/publish-event! (if (= :model/Card model-key)
                             :event/card-public-link-created
                             :event/dashboard-public-link-created)
                           {:object    (t2/select-one model-key id)
                            :object-id id
                            :user-id   (mt/user->id :crowberto)})))

(defn- hold-between-the-reconcile-locks!
  "Call `thunk` with the reconcile of a pull calling `hold!` after it locked the entity rows of the delete closure and
  before it locks the ledger rows."
  [hold! thunk]
  (let [real (mt/original-fn #'save-rule/lock-ledger-rows!)]
    (mt/with-dynamic-fn-redefs [save-rule/lock-ledger-rows! (fn [& args]
                                                              (hold!)
                                                              (apply real args))]
      (thunk))))

(defn- hold-after-the-reconcile-locks!
  "Call `thunk` with the reconcile of a pull calling `hold!` after it locked the entity rows and the ledger rows."
  [hold! thunk]
  (holding-the-reconcile hold! (thunk)))

(deftest public-link-on-a-remote-deleted-entity-during-the-reconcile-has-no-deadlock-test
  (testing "The remote deletes a dashboard (or a card). During the reconcile, an admin creates its public link, which
            locks the entity row and then, in its event, the ledger row. The reconcile takes the same order, so there
            is no deadlock: the pull succeeds, and the public link fails only because the pull deleted its entity."
    (doseq [model-key           [:model/Dashboard :model/Card]
            [fixed-point hold-in] {:between-the-reconcile-locks hold-between-the-reconcile-locks!
                                   :after-the-reconcile-locks   hold-after-the-reconcile-locks!}]
      (testing [model-key fixed-point]
        (with-sync-settings
          (mt/with-temp [:model/Collection {coll :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                         :model/Dashboard  {d :id}    {:name "Dash D" :collection_id coll}
                         :model/Card       {y :id}    {:name "Card Y" :description "original" :collection_id coll}
                         :model/Card       {x :id}    {:name "Card X" :description "original" :collection_id coll}]
            (let [t0             (export-and-pull!)
                  _              (save! x "local edit X")
                  [gone-name id] (if (= :model/Card model-key) ["Card Y" y] ["Dash D" d])
                  [hold! user]   (hold-at! (constantly true) #(public-link-tx! model-key id) 1000)
                  [_ result]     (hold-in hold! #(merge-pull! t0 (dissoc t0 (path-of t0 gone-name))))
                  {:keys [error]} (user-result user)
                  gone?          (not (t2/exists? model-key :id id))]
              (is (= :success (:status result)) (pr-str (summary result)))
              (is (not (deadlock? error)) (str "the public link does not deadlock: " error))
              (is (or (nil? error) gone?) "the public link succeeds, or it fails because the pull deleted its entity")
              (is gone? "the remote delete lands"))))))))

;;; ---------------------------------------------- the delete closure ----------------------------------------------

(defn- archive-action!
  "Archive the action `action-id` and publish its update event, as the action API does."
  [action-id]
  (t2/update! :model/Action action-id {:archived true})
  (events/publish-event! :event/action-update {:object  (t2/select-one :model/Action action-id)
                                               :user-id (mt/user->id :rasta)}))

(defn- add-action!
  "Add a query action to the model `model-id` and publish its create event, as the action API does. Returns its id."
  [model-id]
  (let [id (t2/insert-returning-pk! :model/Action {:name "New action" :type :query :model_id model-id})]
    (t2/insert! :model/QueryAction {:action_id id :dataset_query (mt/native-query {:query "select 1"})})
    (events/publish-event! :event/action-create {:object  (t2/select-one :model/Action id)
                                                 :user-id (mt/user->id :rasta)})
    id))

(defn- push!
  "Push the local changes over the synced files `t0` (the version \"v0\"). Returns the pushed files. The ledger and the
  task then record the pushed version as the last sync."
  [t0]
  (let [src    (test-helpers/versioned-source :trees {"v0" t0} :current "v0")
        result (sync! "export" #(impl/export! (source.p/snapshot src) % "push" :source src))]
    (is (= :success (:status result)) (pr-str (summary result)))
    (tree (source.p/snapshot src))))

(defn- merge-pull-over-last-push!
  "Merge-pull the files `t2` over the files `t1` of the version that the last push recorded. Returns the result."
  [t1 t2]
  (let [v1  (remote-sync.task/last-version)
        src (test-helpers/versioned-source :trees {v1 t1 "v2" t2} :current "v2")]
    (sync! "import" #(impl/import! (source.p/snapshot src) % :merge? true :base-snapshot (source.p/snapshot-at src v1)))))

(deftest archived-and-pushed-action-of-a-remote-deleted-model-test
  (testing "The user archives action A of model M and pushes, so the last sync has no file of A. The remote then
            deletes M and edits card B. The delete of the archived A loses no local change, so the pull succeeds."
    (with-sync-settings
      (mt/with-temp [:model/Collection  {coll-id :id}   {:name "Merge Test" :is_remote_synced true :location "/"}
                     :model/Card        {model-id :id}  {:name "Model M" :type :model :collection_id coll-id
                                                         :dataset_query (venues-query)}
                     :model/Card        {b :id}         {:name "Card B" :description "original" :collection_id coll-id}
                     :model/Action      {action-id :id} {:name "Old action" :type :query :model_id model-id}
                     :model/QueryAction _               {:action_id     action-id
                                                         :dataset_query (mt/native-query {:query "select 1"})}]
        (let [t0     (export-and-pull!)
              _      (archive-action! action-id)
              t1     (push! t0)
              _      (is (nil? (path-of t1 "Old action")) "the push removes the file of the archived action")
              result (merge-pull-over-last-push! t1 (-> t1 (dissoc (path-of t1 "Model M")) (edit "Card B" "remote edit B")))]
          (is (= :success (:status result)) (pr-str (summary result)))
          (is (not (t2/exists? :model/Card :id model-id)))
          (is (not (t2/exists? :model/Action :id action-id)))
          (is (nil? (row "Action" action-id)))
          (is (= "remote edit B" (desc b))))))))

(deftest archived-and-pushed-dashboard-question-of-a-remote-deleted-dashboard-test
  (testing "The user archives dashboard question Q of dashboard D and pushes. The remote then deletes D. The delete of
            the archived Q loses no local change, so the pull succeeds."
    (with-sync-settings
      (mt/with-temp [:model/Collection {coll-id :id} {:name "Merge Test" :is_remote_synced true :location "/"}
                     :model/Dashboard  {d :id}       {:name "Dash D" :collection_id coll-id}
                     :model/Card       {q :id}       {:name "Question Q" :collection_id coll-id :dashboard_id d}
                     :model/Card       _             {:name "Card B" :collection_id coll-id}]
        (let [t0     (export-and-pull!)
              _      (t2/update! :model/Card q {:archived true})
              _      (publish-card-update! q)
              t1     (push! t0)
              _      (is (nil? (path-of t1 "Question Q")) "the push removes the file of the archived question")
              result (merge-pull-over-last-push! t1 (dissoc t1 (path-of t1 "Dash D")))]
          (is (= :success (:status result)) (pr-str (summary result)))
          (is (not (t2/exists? :model/Dashboard :id d)))
          (is (not (t2/exists? :model/Card :id q)))
          (is (nil? (row "Card" q))))))))

(deftest locally-archived-action-of-a-remote-deleted-model-whose-file-the-remote-keeps-test
  (testing "The user archives action A of model M after the last sync. The remote deletes M, keeps the file of A, and
            edits card B. Both sides remove A (the user archived it, and the remote deleted its model), so its delete
            loses no local change: the pull succeeds, and A and its ledger row are gone."
    (with-sync-settings
      (mt/with-temp [:model/Collection  {coll-id :id}   {:name "Merge Test" :is_remote_synced true :location "/"}
                     :model/Card        {model-id :id}  {:name "Model M" :type :model :collection_id coll-id
                                                         :dataset_query (venues-query)}
                     :model/Card        {b :id}         {:name "Card B" :description "original" :collection_id coll-id}
                     :model/Action      {action-id :id} {:name "Old action" :type :query :model_id model-id}
                     :model/QueryAction _               {:action_id     action-id
                                                         :dataset_query (mt/native-query {:query "select 1"})}]
        (let [t0         (export-and-pull!)
              _          (archive-action! action-id)
              [_ result] (merge-pull! t0 (-> t0 (dissoc (path-of t0 "Model M")) (edit "Card B" "remote edit B")))]
          (is (some? (path-of t0 "Old action")))
          (is (= :success (:status result)) (pr-str (summary result)))
          (is (not (t2/exists? :model/Card :id model-id)))
          (is (not (t2/exists? :model/Action :id action-id)))
          (is (nil? (row "Action" action-id)))
          (is (= "remote edit B" (desc b))))))))

(deftest restore-of-an-archived-closure-entity-during-the-pull-stops-the-reconcile-test
  (testing "The user archives action A of model M after the last sync. The remote deletes M and keeps the file of A.
            After the load and before the reconcile, the user restores A. The reconcile stops the pull, and M and A
            stay."
    (with-sync-settings
      (mt/with-temp [:model/Collection  {coll-id :id}   {:name "Merge Test" :is_remote_synced true :location "/"}
                     :model/Card        {model-id :id}  {:name "Model M" :type :model :collection_id coll-id
                                                         :dataset_query (venues-query)}
                     :model/Action      {action-id :id} {:name "Old action" :type :query :model_id model-id}
                     :model/QueryAction _               {:action_id     action-id
                                                         :dataset_query (mt/native-query {:query "select 1"})}]
        (let [t0         (export-and-pull!)
              _          (archive-action! action-id)
              restore!   (fn []
                           (t2/update! :model/Action action-id {:archived false})
                           (events/publish-event! :event/action-update {:object  (t2/select-one :model/Action action-id)
                                                                        :user-id (mt/user->id :rasta)}))
              [_ result] (merge-pull! t0 (dissoc t0 (path-of t0 "Model M")) (once-at! 0.75 restore!))]
          (is (= :conflict (:status result)) (pr-str (summary result)))
          (is (= (str "Import blocked: content changed locally during the pull, and the remote branch deleted the "
                      "content that holds it. Your local change is kept.")
                 (:message result)))
          (is (t2/exists? :model/Card :id model-id) "the model stays")
          (is (false? (t2/select-one-fn :archived :model/Action action-id)) "the restored action stays"))))))

(deftest change-of-a-closure-entity-during-the-pull-stops-the-reconcile-test
  (testing "The remote deletes model M and keeps the file of its action A. After the load and before the reconcile, the
            user edits A. The reconcile stops the pull, and M and A stay with the edit."
    (with-sync-settings
      (mt/with-temp [:model/Collection  {coll-id :id}   {:name "Merge Test" :is_remote_synced true :location "/"}
                     :model/Card        {model-id :id}  {:name "Model M" :type :model :collection_id coll-id
                                                         :dataset_query (venues-query)}
                     :model/Action      {action-id :id} {:name "Old action" :description "original" :type :query
                                                         :model_id model-id}
                     :model/QueryAction _               {:action_id     action-id
                                                         :dataset_query (mt/native-query {:query "select 1"})}]
        (let [t0         (export-and-pull!)
              version0   (remote-sync.task/last-version)
              edit!      (fn []
                           (t2/update! :model/Action action-id {:description "edit during pull"})
                           (events/publish-event! :event/action-update {:object  (t2/select-one :model/Action action-id)
                                                                        :user-id (mt/user->id :rasta)}))
              [_ result] (merge-pull! t0 (dissoc t0 (path-of t0 "Model M")) (once-at! 0.75 edit!))]
          (is (= :conflict (:status result)) (pr-str (summary result)))
          (is (= (str "Import blocked: content changed locally during the pull, and the remote branch deleted the "
                      "content that holds it. Your local change is kept.")
                 (:message result)))
          (is (= version0 (remote-sync.task/last-version)) "a stop does not move the version")
          (is (t2/exists? :model/Card :id model-id) "the model stays")
          (is (= "edit during pull" (t2/select-one-fn :description :model/Action action-id)) "the edit stays"))))))

(deftest action-added-before-the-load-under-a-remote-deleted-model-stops-before-any-write-test
  (testing "The remote deletes model M and edits card B. After the merge read ours and before the load, the user adds
            an action to M. The pull stops before the load, so it writes nothing: B keeps its text."
    (with-sync-settings
      (mt/with-temp [:model/Collection {coll-id :id}  {:name "Merge Test" :is_remote_synced true :location "/"}
                     :model/Card       {model-id :id} {:name "Model M" :type :model :collection_id coll-id
                                                       :dataset_query (venues-query)}
                     :model/Card       {b :id}        {:name "Card B" :description "original" :collection_id coll-id}]
        (mt/with-model-cleanup [:model/Action]
          (let [t0         (export-and-pull!)
                version0   (remote-sync.task/last-version)
                action-id  (atom nil)
                [_ result] (before-the-pre-check #(reset! action-id (add-action! model-id))
                                                 (merge-pull! t0 (-> t0 (dissoc (path-of t0 "Model M")) (edit "Card B" "remote edit B"))))]
            (is (= :conflict (:status result)) (pr-str (summary result)))
            (is (= ["New action"] (:conflicts result)) "the conflict names the new action")
            (is (= (str "Import blocked: content was added locally during the pull under content that the remote "
                        "branch deleted. Your local change is kept.")
                   (:message result)))
            (is (= version0 (remote-sync.task/last-version)) "a stop does not move the version")
            (is (= "original" (desc b)) "the pull writes nothing")
            (is (t2/exists? :model/Card :id model-id) "the model stays")
            (is (t2/exists? :model/Action :id @action-id) "the new action stays")))))))

(deftest action-created-during-the-pull-under-a-remote-deleted-model-stops-the-pull-test
  (testing "The remote deletes model M. After the merge and before the reconcile, the user adds an action to M. The
            merge did not see the action, so the reconcile stops the pull, and the model and the action stay."
    (with-sync-settings
      (mt/with-temp [:model/Collection {coll-id :id}  {:name "Merge Test" :is_remote_synced true :location "/"}
                     :model/Card       {model-id :id} {:name "Model M" :type :model :collection_id coll-id
                                                       :dataset_query (venues-query)}]
        (mt/with-model-cleanup [:model/Action]
          (let [t0         (export-and-pull!)
                version0   (remote-sync.task/last-version)
                action-id  (atom nil)
                add!       (fn []
                             (let [id (t2/insert-returning-pk! :model/Action {:name "New action" :type :query
                                                                              :model_id model-id})]
                               (t2/insert! :model/QueryAction {:action_id     id
                                                               :dataset_query (mt/native-query {:query "select 1"})})
                               (events/publish-event! :event/action-create {:object  (t2/select-one :model/Action id)
                                                                            :user-id (mt/user->id :rasta)})
                               (reset! action-id id)))
                [_ result] (merge-pull! t0 (dissoc t0 (path-of t0 "Model M")) (once-at! 0.75 add!))]
            (is (= :conflict (:status result)) (pr-str (summary result)))
            (is (= ["New action"] (:conflicts result)) "the conflict names the new action")
            (is (= (str "Import blocked: content was added locally during the pull under content that the remote "
                        "branch deleted. Your local change is kept.")
                   (:message result)))
            (is (= version0 (remote-sync.task/last-version)) "a stop does not move the version")
            (is (t2/exists? :model/Card model-id) "the model stays")
            (is (t2/exists? :model/Action @action-id) "the new action stays")
            (is (= "create" (:status (row "Action" @action-id))))))))))

(deftest remote-model-delete-with-a-locally-archived-action-test
  (testing "The user archives action A of model M. The remote deletes M and the file of A. Both sides removed A, so the
            pull deletes M and A with no conflict."
    (with-sync-settings
      (mt/with-temp [:model/Collection  {coll-id :id}   {:name "Merge Test" :is_remote_synced true :location "/"}
                     :model/Card        {model-id :id}  {:name "Model M" :type :model :collection_id coll-id
                                                         :dataset_query (venues-query)}
                     :model/Action      {action-id :id} {:name "Old action" :type :query :model_id model-id}
                     :model/QueryAction _               {:action_id     action-id
                                                         :dataset_query (mt/native-query {:query "select 1"})}]
        (let [t0         (export-and-pull!)
              _          (t2/update! :model/Action action-id {:archived true})
              _          (events/publish-event! :event/action-update {:object  (t2/select-one :model/Action action-id)
                                                                      :user-id (mt/user->id :rasta)})
              [_ result] (merge-pull! t0 (dissoc t0 (path-of t0 "Model M") (path-of t0 "Old action")))]
          (is (some? (path-of t0 "Old action")))
          (is (= :success (:status result)) (pr-str (summary result)))
          (is (not (t2/exists? :model/Card :id model-id)))
          (is (not (t2/exists? :model/Action :id action-id)))
          (is (nil? (row "Action" action-id))))))))

;;; ------------------------------------------ a stop after the load wrote ------------------------------------------

(defn- live-hash
  "The content hash of the entity `model-type` `id` as it is now."
  [model-type id]
  (source/row->content-hash {:model_type model-type :model_id id}))

(defn- do-with-a-stop-after-the-load!
  "Model M and card B are synced as the version v0. The remote deletes M and edits B (v1). After the load and before
  the reconcile, the user adds an action to M, and then `(at-the-stop b)` runs with the id `b` of B. So the reconcile
  stops the pull after the load wrote B. Calls `(f {:t0 :t1 :b :action-id :result})`."
  [at-the-stop f]
  (with-sync-settings
    (mt/with-temp [:model/Collection {coll-id :id}  {:name "Merge Test" :is_remote_synced true :location "/"}
                   :model/Card       {model-id :id} {:name "Model M" :type :model :collection_id coll-id
                                                     :dataset_query (venues-query)}
                   :model/Card       {b :id}        {:name "Card B" :description "original" :collection_id coll-id}]
      (mt/with-model-cleanup [:model/Action]
        (let [t0         (export-and-pull!)
              t1         (-> t0 (dissoc (path-of t0 "Model M")) (edit "Card B" "remote edit B"))
              action-id  (atom nil)
              [_ result] (merge-pull! t0 t1 (once-at! 0.75 #(do (reset! action-id (add-action! model-id))
                                                                (at-the-stop b))))]
          (f {:t0 t0 :t1 t1 :b b :action-id @action-id :result result}))))))

(defn- merge-pull-over-v0!
  "Merge-pull the files `t2` as the version \"v2\" over the base `t0` (the version \"v0\"), with the files `t1` as the
  version \"v1\". Returns `[src result]`."
  [t0 t1 t2]
  (let [src (test-helpers/versioned-source :trees {"v0" t0 "v1" t1 "v2" t2} :current "v2")]
    [src (sync! "import" #(impl/import! (source.p/snapshot src) % :merge? true
                                        :base-snapshot (source.p/snapshot-at src "v0")))]))

(deftest stop-after-the-load-wrote-restores-the-base-test
  (testing "The remote deletes model M and edits card B. After the load wrote B, the user adds an action to M, so the
            reconcile stops the pull. The pull gives B its text of the last sync again, and the row of B matches B."
    (do-with-a-stop-after-the-load!
     (constantly nil)
     (fn [{:keys [b result]}]
       (is (= :conflict (:status result)) (pr-str (summary result)))
       (is (= ["New action"] (:conflicts result)))
       (is (= "original" (desc b)) "B has its text of the last sync")
       (is (= {:status "synced" :content_hash (live-hash "Card" b)}
              (select-keys (row "Card" b) [:status :content_hash]))
           "the row of B is synced and has the hash of B")))))

(deftest stop-after-the-load-wrote-then-the-remote-reverts-test
  (testing "After a stop after the load wrote B, the user archives the new action. The remote then sets B back to its
            text of the last sync. The next pull succeeds, B has that text, and a push does not send the old remote
            edit of B."
    (do-with-a-stop-after-the-load!
     (constantly nil)
     (fn [{:keys [t0 t1 b action-id result]}]
       (is (= :conflict (:status result)) (pr-str (summary result)))
       (archive-action! action-id)
       (let [t2           (dissoc t0 (path-of t0 "Model M"))
             [src again]  (merge-pull-over-v0! t0 t1 t2)]
         (is (= :success (:status again)) (pr-str (summary again)))
         (is (= "original" (desc b)))
         (publish-card-update! b)
         (let [push (sync! "export" #(impl/export! (source.p/snapshot src) % "push" :source src))
               tip  (tree (source.p/snapshot src))]
           (is (= :success (:status push)) (pr-str (summary push)))
           (is (str/includes? (get tip (path-of tip "Card B")) "description: original")
               "the push does not send the old remote edit")))))))

(deftest stop-after-the-load-wrote-then-the-remote-edits-again-test
  (testing "After a stop after the load wrote B, the user archives the new action. The remote then edits B again. The
            user did not change B, so the next pull succeeds with no conflict and loads the new edit."
    (do-with-a-stop-after-the-load!
     (constantly nil)
     (fn [{:keys [t0 t1 b action-id result]}]
       (is (= :conflict (:status result)) (pr-str (summary result)))
       (archive-action! action-id)
       (let [t2        (-> t0 (dissoc (path-of t0 "Model M")) (edit "Card B" "remote edit B2"))
             [_ again] (merge-pull-over-v0! t0 t1 t2)]
         (is (= :success (:status again)) (pr-str (summary again)))
         (is (= "remote edit B2" (desc b))))))))

(deftest stop-after-the-load-wrote-keeps-a-user-edit-made-after-the-load-test
  (testing "After the load wrote B, the user edits B and adds an action to M, so the reconcile stops the pull. The pull
            does not give B its old text: the edit of the user stays, and the row of B is dirty."
    (do-with-a-stop-after-the-load!
     #(save! % "edit after the load")
     (fn [{:keys [b result]}]
       (is (= :conflict (:status result)) (pr-str (summary result)))
       (is (= "edit after the load" (desc b)))
       (is (= "update" (:status (row "Card" b))))))))

(deftest stop-after-the-load-wrote-deletes-an-entity-that-the-remote-added-test
  (testing "The remote adds card N, deletes model M, and edits card B. After the load wrote N and B, the user adds an
            action to M, so the reconcile stops the pull. The last sync has no N, so the pull deletes N again."
    (with-sync-settings
      (mt/with-temp [:model/Collection {coll-id :id}  {:name "Merge Test" :is_remote_synced true :location "/"}
                     :model/Card       {model-id :id} {:name "Model M" :type :model :collection_id coll-id
                                                       :dataset_query (venues-query)}
                     :model/Card       {b :id}        {:name "Card B" :description "original" :collection_id coll-id}
                     :model/Card       {n :id}        {:name "Card N" :collection_id coll-id}]
        (mt/with-model-cleanup [:model/Action :model/Card]
          (let [n-eid      (t2/select-one-fn :entity_id :model/Card n)
                t-all      (export-and-pull!)
                t0         (dissoc t-all (path-of t-all "Card N"))
                _          (sync! "import" #(impl/import! (source.p/snapshot (test-helpers/versioned-source
                                                                              :trees {"v0" t0} :current "v0"))
                                                          % :force? true))
                _          (is (not (t2/exists? :model/Card :entity_id n-eid)) "precondition: the last sync has no N")
                t1         (-> t0
                               (dissoc (path-of t0 "Model M"))
                               (edit "Card B" "remote edit B")
                               (assoc (path-of t-all "Card N") (get t-all (path-of t-all "Card N"))))
                [_ result] (merge-pull! t0 t1 (once-at! 0.75 #(add-action! model-id)))]
            (is (= :conflict (:status result)) (pr-str (summary result)))
            (is (not (t2/exists? :model/Card :entity_id n-eid)) "the pull deletes the card that its load added")
            (is (= "original" (desc b)))
            (is (nil? (t2/select-one :model/RemoteSyncObject :model_type "Card" :file_path (path-of t-all "Card N")))
                "N has no row")))))))

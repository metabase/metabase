(ns metabase-enterprise.remote-sync.isolation-check-test-util
  "On-demand check that the test namespaces of the remote-sync module leave the app DB as they found it. It runs the
  tests of each namespace with that namespace's fixtures, and compares these rows before and after the namespace: the
  stored `remote-sync%` setting rows (reported by key only: the values can carry secrets), the RemoteSyncObject rows,
  the RemoteSyncTask ids, and the ids of the content models of `rs.test/imported-content-models` (personal
  collections excluded).

  Run it from a REPL; it runs every test of the module:

    (require 'metabase-enterprise.remote-sync.isolation-check-test-util)
    (metabase-enterprise.remote-sync.isolation-check-test-util/check-module!)"
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :as t]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.test.initialize :as initialize]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private this-test-ns
  "The test of this check; it runs the check itself, so the module run skips it."
  'metabase-enterprise.remote-sync.isolation-check-test)

(defn module-test-namespaces
  "The namespace of each `*_test.clj` file in the directory of this file and its subdirectories, sorted."
  []
  ;; from the files, not from `all-ns`: when a test runs alone, `all-ns` holds only the namespaces that are loaded.
  ;; Resolve this file, not the directory: the source directory has the same resource path.
  (let [this-file  "metabase_enterprise/remote_sync/isolation_check_test_util.clj"
        module-dir (.getParentFile (io/file (io/resource this-file)))
        root       (-> module-dir .getParentFile .getParentFile)]
    (sort
     (for [^java.io.File f (file-seq module-dir)
           :let  [path (str (.relativize (.toPath root) (.toPath f)))]
           :when (str/ends-with? path "_test.clj")]
       (-> path
           (str/replace #"\.clj$" "")
           (str/replace java.io.File/separator ".")
           (str/replace "_" "-")
           symbol)))))

(defn- run-namespace-tests!
  "Run the test vars of `ns-sym` in line order, with the fixtures of `ns-sym`. Returns `{:counts {:pass n :fail n
  :error n}}`, plus `:exception` when the run throws (for example from a fixture); then `:counts` has the assertions
  before the exception. The test output and the failures do not reach the caller's test report."
  [ns-sym]
  (let [results (atom {:pass 0 :fail 0 :error 0})
        test-vs (->> (ns-interns ns-sym) vals (filter (comp :test meta)) (sort-by (comp :line meta)))]
    (binding [t/*test-out*        (java.io.StringWriter.)
              t/*report-counters* (ref t/*initial-report-counters*)
              t/report            (fn [m]
                                    (when (#{:pass :fail :error} (:type m))
                                      (swap! results update (:type m) inc)))]
      (try
        (t/test-vars test-vs)
        {:counts @results}
        (catch Throwable e
          {:counts @results :exception e})))))

(defn- content-ids
  "The ids of the rows of `model`; for Collection, without personal collections."
  [model]
  ;; the table, not the model: no model hook runs
  (let [table (t2/table-name model)]
    (if (= model :model/Collection)
      (t2/select-fn-set :id [table :id] :personal_owner_id nil)
      (t2/select-fn-set :id [table :id]))))

(defn- app-db-state
  "The raw `remote-sync%` rows of the `setting` table by key, the set of raw `remote_sync_object` rows, the set of
  `remote_sync_task` ids, and the set of ids of each of `rs.test/imported-content-models`."
  []
  ;; the tables, not the models: the Setting model decrypts on select
  {:settings (into {} (map (juxt :key #(into {} %))) (rs.test/stored-remote-sync-setting-rows))
   :ledger   (into #{} (map #(into {} %)) (t2/select :remote_sync_object))
   :tasks    (t2/select-fn-set :id [(t2/table-name :model/RemoteSyncTask) :id])
   :content  (into {} (map (juxt identity content-ids)) rs.test/imported-content-models)})

(defn- set-difference
  "`{:added a :removed r}` for two sets, or nil when they are equal."
  [before after]
  ;; `set`: `t2/select-fn-set` gives nil for no row
  (let [added   (set/difference (set after) (set before))
        removed (set/difference (set before) (set after))]
    (when (or (seq added) (seq removed))
      {:added added :removed removed})))

(defn- difference
  "The difference of two [[app-db-state]]s, as a `:leaks` entry of [[check-module!]] without `:namespace`; a part
  with no difference is absent. `:settings` names the changed keys only: the rows can carry secrets."
  [before after]
  (let [settings (into (sorted-set)
                       (filter (fn [k]
                                 (not= (get-in before [:settings k]) (get-in after [:settings k]))))
                       (into (set (keys (:settings before))) (keys (:settings after))))
        ledger    (set-difference (:ledger before) (:ledger after))
        tasks     (set-difference (:tasks before) (:tasks after))
        content   (into {}
                        (keep (fn [model]
                                (when-let [d (set-difference (get-in before [:content model])
                                                             (get-in after [:content model]))]
                                  [model d])))
                        rs.test/imported-content-models)]
    (cond-> {}
      (seq settings) (assoc :settings (vec settings))
      ledger         (assoc :ledger ledger)
      tasks          (assoc :tasks tasks)
      (seq content)  (assoc :content content))))

(defn check-module!
  "Run the tests of each namespace in `namespaces` (default: [[module-test-namespaces]] without the test of this
  check) with its fixtures, one namespace at a time, and compare the app DB rows before and after each namespace.
  Requires each namespace that is not loaded. Returns

    {:namespaces <number of namespaces run>
     :counts     {:pass n :fail n :error n}  ; the assertions of all namespaces
     :leaks      [{:namespace ns-sym :settings ... :ledger ... :tasks ... :content ...} ...]
     :errors     [{:namespace ns-sym :exception e} ...]}

  with one `:leaks` entry for each namespace that left a difference, in run order. `:settings` lists each changed
  `remote-sync%` setting key, and holds no values, because the rows can carry secrets; `:ledger` has the `:added`
  and `:removed` RemoteSyncObject rows; `:tasks` has the `:added` and `:removed` RemoteSyncTask ids; `:content`
  maps each changed content model to its `:added` and `:removed` ids. An exception out of a namespace's run (for
  example from a fixture) adds an `:errors` entry, and the check compares the rows of that namespace and goes on.
  A namespace runs from the state that the namespaces before it left, so an earlier leak can hide a later one."
  ([]
   (check-module! (remove #{this-test-ns} (module-test-namespaces))))
  ([namespaces]
   (initialize/initialize-if-needed! :db)
   (doseq [ns-sym namespaces
           :when  (not (find-ns ns-sym))]
     (require ns-sym))
   (reduce (fn [result ns-sym]
             (let [before                     (app-db-state)
                   start                      (System/nanoTime)
                   {:keys [counts exception]} (run-namespace-tests! ns-sym)
                   diff                       (difference before (app-db-state))]
               (when exception
                 (log/warnf exception "Isolation check: %s throws" ns-sym))
               (log/infof "Isolation check: %s %s in %d ms%s" ns-sym (pr-str counts)
                          (quot (- (System/nanoTime) start) 1000000)
                          (if (seq diff) (str ", difference " (pr-str diff)) ""))
               (cond-> (-> result
                           (update :namespaces inc)
                           (update :counts #(merge-with + % counts)))
                 exception  (update :errors conj {:namespace ns-sym :exception exception})
                 (seq diff) (update :leaks conj (assoc diff :namespace ns-sym)))))
           {:namespaces 0
            :counts     {:pass 0 :fail 0 :error 0}
            :leaks      []
            :errors     []}
           namespaces)))

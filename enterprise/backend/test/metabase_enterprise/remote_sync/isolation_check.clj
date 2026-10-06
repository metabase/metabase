(ns metabase-enterprise.remote-sync.isolation-check
  "On-demand check that the test namespaces of the remote-sync module leave the app DB as they found it. It runs the
  tests of each namespace with that namespace's fixtures, and compares the stored `remote-sync%` setting rows and the
  RemoteSyncObject rows before and after the namespace.

  This namespace has no tests, so the test runner does not run it. Run it from a REPL in the worktree; a run of the
  whole module takes about as long as the module's tests (about 100 seconds on H2):

    (require 'metabase-enterprise.remote-sync.isolation-check)
    (metabase-enterprise.remote-sync.isolation-check/check-module!)

  An empty `:leaks` in the result means that no namespace left a difference."
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :as t]
   [metabase.test.initialize :as initialize]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private this-test-ns
  "The test of this check; it runs the check itself, so the module run skips it."
  'metabase-enterprise.remote-sync.isolation-check-test)

(defn module-test-namespaces
  "The namespace of each `*_test.clj` file in the directory of this file and its subdirectories, except the test of
  this check, sorted."
  []
  ;; from the files of the test directory: the source directory of the module has the same resource path
  (let [module-dir (.getParentFile (io/file (io/resource "metabase_enterprise/remote_sync/isolation_check.clj")))
        root       (-> module-dir .getParentFile .getParentFile)]
    (sort
     (for [^java.io.File f (file-seq module-dir)
           :let  [path   (str (.relativize (.toPath root) (.toPath f)))
                  ns-sym (when (str/ends-with? path "_test.clj")
                           (-> path
                               (str/replace #"\.clj$" "")
                               (str/replace java.io.File/separator ".")
                               (str/replace "_" "-")
                               symbol))]
           :when (and ns-sym (not= ns-sym this-test-ns))]
       ns-sym))))

(defn- run-namespace-tests!
  "Run the test vars of `ns-sym` in line order, with the fixtures of `ns-sym`. Returns `{:pass n :fail n :error n}`;
  the test output and the failures do not reach the caller's test report."
  [ns-sym]
  (let [results (atom {:pass 0 :fail 0 :error 0})
        test-vs (->> (ns-interns ns-sym) vals (filter (comp :test meta)) (sort-by (comp :line meta)))]
    (binding [t/*test-out*        (java.io.StringWriter.)
              t/*report-counters* (ref t/*initial-report-counters*)
              t/report            (fn [m]
                                    (when (#{:pass :fail :error} (:type m))
                                      (swap! results update (:type m) inc)))]
      (t/test-vars test-vs))
    @results))

(defn- app-db-state
  "The raw `remote-sync%` rows of the `setting` table by key, and the set of raw `remote_sync_object` rows."
  []
  ;; the tables, not the models: the Setting model decrypts on select
  {:settings (into {} (map (juxt :key #(into {} %))) (t2/select :setting :key [:like "remote-sync%"]))
   :ledger   (into #{} (map #(into {} %)) (t2/select :remote_sync_object))})

(defn- difference
  "The difference between two [[app-db-state]]s: `:settings` maps each changed key to `{:before row :after row}` (nil
  for no row), and `:ledger` has the `:added` and `:removed` rows. A key is absent when its part has no difference."
  [before after]
  (let [setting-keys (into (set (keys (:settings before))) (keys (:settings after)))
        settings     (into (sorted-map)
                           (for [k     setting-keys
                                 :let  [b (get-in before [:settings k])
                                        a (get-in after [:settings k])]
                                 :when (not= b a)]
                             [k {:before b :after a}]))
        added        (set/difference (:ledger after) (:ledger before))
        removed      (set/difference (:ledger before) (:ledger after))]
    (cond-> {}
      (seq settings)                 (assoc :settings settings)
      (or (seq added) (seq removed)) (assoc :ledger {:added added :removed removed}))))

(defn check-module!
  "Run the tests of each namespace in `namespaces` (default: [[module-test-namespaces]]) with its fixtures, one
  namespace at a time, and compare the app DB rows before and after each namespace. Requires each namespace that is
  not loaded. Returns

    {:namespaces <number of namespaces run>
     :counts     {:pass n :fail n :error n}  ; the assertions of all namespaces
     :leaks      [{:namespace ns-sym :settings ... :ledger ...} ...]}

  with one `:leaks` entry for each namespace that left a difference, in run order. `:settings` maps each changed
  `remote-sync%` setting key to `{:before row :after row}` (nil for no row); `:ledger` has the `:added` and `:removed`
  RemoteSyncObject rows. A namespace runs from the state that the namespaces before it left, so an earlier leak can
  hide a later one."
  ([]
   (check-module! (module-test-namespaces)))
  ([namespaces]
   (initialize/initialize-if-needed! :db)
   (doseq [ns-sym namespaces
           :when  (not (find-ns ns-sym))]
     (require ns-sym))
   (reduce (fn [result ns-sym]
             (let [before (app-db-state)
                   start  (System/nanoTime)
                   counts (run-namespace-tests! ns-sym)
                   diff   (difference before (app-db-state))]
               (log/infof "Isolation check: %s %s in %d ms%s" ns-sym (pr-str counts)
                          (quot (- (System/nanoTime) start) 1000000)
                          (if (seq diff) (str ", difference " (pr-str diff)) ""))
               (cond-> (-> result
                           (update :namespaces inc)
                           (update :counts #(merge-with + % counts)))
                 (seq diff) (update :leaks conj (assoc diff :namespace ns-sym)))))
           {:namespaces 0
            :counts     {:pass 0 :fail 0 :error 0}
            :leaks      []}
           namespaces)))

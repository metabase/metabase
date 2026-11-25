(ns metabase.app-db.worktree
  "Remote sync worktrees in the app DB: the worktree the app DB connections of a thread see. On Postgres, the worktree schema, which exists while a worktree does, has a view
  named like each table with `worktree_id`, showing a connection only the rows of the worktree its
  `metabase.worktree_id` setting names, like `metabase_table` and `metabase_field` over their overlays with the
  worktree's user settings, writing the stored rows, and like each view of `public` over those."
  (:require
   [metabase.app-db.db :as app-db.db]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def schema
  "The schema of the views, which the connections of the main app and the worktrees put first in their `search_path`."
  "worktree")

(def ^:private overlays
  "The tables whose rows belong to the main app, by the view of `public` that overlays them with a worktree's user
  settings."
  {"metabase_table" "v_worktree_table"
   "metabase_field" "v_worktree_field"})

(defn- in-dependency-order
  "`views`, each after the views it reads."
  [views]
  (loop [pending views, done #{}, ordered []]
    (if (empty? pending)
      ordered
      (let [ready (filter #(every? done (.getArray ^java.sql.Array (:reads %))) pending)]
        (when (empty? ready)
          (throw (ex-info "The views of public read each other in a cycle." {:views (map :relname pending)})))
        (recur (remove (set ready) pending) (into done (map :relname) ready) (into ordered ready))))))

(defn worktree-schema-exists?
  "Whether the worktree schema exists."
  []
  (app-db.db/worktree-schema-exists?))

(defn drop-worktree-schema!
  "Drops the worktree schema with its views, if it exists."
  []
  (app-db.db/drop-worktree-schema!))

(defn- create-views!
  "Creates the views of the worktree schema from the tables and views of `public`."
  []
  (run! app-db.db/execute-statement! (app-db.db/worktree-table-view-statements))
  (doseq [[table overlay] overlays]
    (run! app-db.db/execute-statement! (app-db.db/worktree-overlay-statements table overlay)))
  (let [views  (map :statement (in-dependency-order (app-db.db/worktree-public-view-statements (vals overlays))))
        before (app-db.db/set-search-path! (str schema ", public"))]
    (try
      (run! app-db.db/execute-statement! views)
      (finally
        (app-db.db/set-search-path! before)))))

(defn create-worktree-schema!
  "Creates the worktree schema with its views, in one transaction."
  []
  (t2/with-transaction [_conn]
    (app-db.db/create-worktree-schema!)
    (create-views!)))

(defn recreate-worktree-views!
  "Recreates the worktree schema with its views from the tables and views of `public`, in one transaction."
  []
  (t2/with-transaction [_conn]
    (app-db.db/drop-worktree-schema!)
    (app-db.db/create-worktree-schema!)
    (create-views!)))

(mr/def ::scope
  "The rows the app DB connections of a thread see: the main app's, a worktree's, or every row."
  [:multi {:dispatch :type}
   [:main     [:map {:closed true} [:type [:= :main]]]]
   [:worktree [:map {:closed true} [:type [:= :worktree]] [:worktree-id pos-int?]]]
   [:all      [:map {:closed true} [:type [:= :all]]]]])

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *scope*
  "The rows the app DB connections of this thread see, a [[::scope]]."
  {:type :main})

(defn current-worktree-scope
  "The [[::scope]] of the app DB connections of this thread."
  []
  *scope*)

(def default-worktree-id
  "The id of the default worktree, the main app, which the migration that added worktrees creates."
  1)

(defn worktree-id
  "The id of the worktree this thread works in, or nil in the main app or across every worktree."
  []
  (when (= :worktree (:type *scope*))
    (:worktree-id *scope*)))

(defn worktree-scope
  "The scope of the worktree with `worktree-id`, or of the main app when it is nil."
  [worktree-id]
  (if worktree-id
    {:type :worktree, :worktree-id worktree-id}
    {:type :main}))

(mu/defn do-with-worktree-scope
  "Impl for [[with-worktree-scope]]."
  [scope :- ::scope
   thunk :- ifn?]
  (binding [*scope* scope]
    (thunk)))

(defmacro with-worktree-scope
  "Runs `body` with the app DB connections it gets seeing the rows of `scope`, a [[::scope]]: `{:type :main}`,
  `{:type :worktree :worktree-id id}` or `{:type :all}`. A connection already bound, as in an open
  transaction, keeps the scope it was checked out with."
  {:style/indent 1}
  [scope & body]
  `(do-with-worktree-scope ~scope (^:once fn* [] ~@body)))

(defn- interrupt?
  "Whether `e`, or anything in its cause chain, is an interrupt."
  [e]
  (some #(instance? InterruptedException %) (u/full-exception-chain e)))

(defn- call-in-each-scope
  "Calls `thunk` in each of `scopes` in turn, returning `[scope exception]` for each call that threw; stops after an
  interrupt, or before the next scope once this thread has been interrupted."
  [scopes thunk]
  (reduce (fn [failures scope]
            (if (.isInterrupted (Thread/currentThread))
              (reduced (conj failures [scope (InterruptedException. "Interrupted before this worktree scope.")]))
              (try
                (do-with-worktree-scope scope thunk)
                failures
                (catch Throwable e
                  (cond-> (conj failures [scope e]) (interrupt? e) reduced)))))
          []
          scopes))

(defn do-in-each-worktree
  "Calls `thunk` in the main app, then once in each remote sync worktree other than the default one, going on when a
  call throws but stopping at an interrupt. Rethrows the interrupt, or else the first exception, and logs the others."
  [thunk]
  (let [ids      (t2/select-fn-vec :id :remote_sync_worktree :is_default false {:order-by [:id]})
        failures (call-in-each-scope (cons {:type :main} (map worktree-scope ids)) thunk)
        thrown   (or (some (fn [[_ e]] (when (interrupt? e) e)) failures)
                     (second (first failures)))]
    (doseq [[scope e] failures
            :when (not (identical? e thrown))]
      (log/warnf "Failed in worktree scope %s: %s" (pr-str scope) (ex-message e)))
    (when thrown
      (throw thrown))))

(defn checkout-sql
  "The statement a Postgres app DB connection runs when this thread checks it out, or nil for every row: it puts the
  worktree schema, which exists while a worktree does, first in the `search_path`, and in a worktree names the
  worktree. Check-in and acquisition leave every connection seeing every row of `public`."
  []
  (case (:type *scope*)
    :all      nil
    :main     (format "SET search_path = %s, public;" schema)
    :worktree (format "SET search_path = %s, public; SET metabase.worktree_id = '%d';"
                      schema
                      (long (:worktree-id *scope*)))))

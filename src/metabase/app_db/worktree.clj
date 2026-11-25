(ns metabase.app-db.worktree
  "Remote sync worktrees in the app DB. On Postgres, the worktree schema, which exists while a worktree does, has a view
  named like each table with `worktree_id`, showing a connection only the rows of the worktree its
  `metabase.worktree_id` setting names, like `metabase_table` and `metabase_field` over their overlays with the
  worktree's user settings, writing the stored rows, and like each view of `public` over those."
  (:require
   [metabase.app-db.db :as app-db.db]
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

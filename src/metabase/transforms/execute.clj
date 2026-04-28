(ns metabase.transforms.execute
  (:require
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms.interface :as transforms.i]
   [metabase.transforms.query-impl :as transforms.query-impl]))

(set! *warn-on-reflection* true)

(defn- resolve-target
  "Apply the workspace target-rewrite hook before dispatch. On a workspaced child
  instance for `(:database target)`, the hook rewrites `:schema` to the workspace
  output schema and records a TableRemapping for the canonical (schema, name).
  Off-workspace and OSS: no-op pass-through.

  Lives at the dispatch wrapper so every transform type (`:query`, `:python`, and
  any future kind registered via `transforms.i/execute!`) inherits the gate. The
  hook must run before per-type execution begins, since callees consume
  `(:target transform)` to decide where to write.

  When `target-db-id` returns nil (no per-type impl, or transform shape doesn't
  identify a target DB), the hook is skipped — workspace rewriting requires a
  known DB id to look up `db-workspace-schema`."
  [transform]
  (if-let [db-id (transforms-base.i/target-db-id transform)]
    (assoc transform :target
           (transforms.query-impl/resolve-transform-target db-id (:target transform)))
    transform))

(defn execute!
  "Run `transform` and sync its target table.

  This is executing synchronously, but supports being kicked off in the background
  by delivering the `start-promise` just before the start when the beginning of the execution has been booked
  in the database."
  ([transform]
   (execute! transform nil))
  ([transform opts]
   #_{:clj-kondo/ignore [:discouraged-var]}
   (transforms.i/execute! (resolve-target transform) opts)))

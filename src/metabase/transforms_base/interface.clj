(ns metabase.transforms-base.interface
  "Interface definitions for base transform execution.

   This namespace defines the multimethods that different transform types
   (query, python) must implement. The base module uses these for dispatch
   without any database writes for transform_run tracking.

   For scheduled execution with transform_run tracking, see metabase.transforms.interface."
  (:require
   [metabase.util.log :as log]))

(defn transform->transform-type
  "Extract the transform type from a transform's source."
  [transform]
  (-> transform :source :type keyword))

(defmulti source-db-id
  "Return the ID of the source database for a given `transform`. The source database is where the data originates from
  before being transformed and written to the target destination.

  NOTE: Currently returns a single database ID, but we may want to change this to return multiple database IDs in the
  future since transforms can have multiple input sources."
  {:added "0.57.0" :arglists '([transform])}
  transform->transform-type)

(defmulti target-db-id
  "Return the ID of the target database for a given `transform`. The target database is the destination where the
  transformed data will be written. Often this is the same database as the source database."
  {:added "0.57.0" :arglists '([transform])}
  transform->transform-type)

(defmulti table-dependencies
  "Return a set of logical table dependencies of the transform, including indirect dependencies via cards.
  The transform execution system uses these dependencies to determine the correct order of execution
  and to detect circular dependencies.

  Each dependency is represented as one of:
  - `{:table <table-id>}`
     A dependency on a table that exists and has been synced.
  - `{:transform <transform-id>}`
     A dependency on a table that does not yet exist, but is known to be the target of another transform.
     Represents a 'placeholder' table (as we no table id / metadata) for the same purposes.
  - `{:table-ref {:database_id <db-id> :schema <schema> :table <name>}}`
     A dependency on a table by name, for cases where the table_id may not exist yet (e.g., when
     bulk importing transforms that depend on each other's outputs). The ordering system will
     resolve these to transforms by matching against target table definitions.

  An empty set indicates no dependencies."
  {:added "0.57.0" :arglists '([transform])}
  transform->transform-type)

(defmulti execute-base!
  "Execute a transform's core logic and return results.

  Does NOT:
  - Write transform_run rows
  - Sync target tables (caller should use `complete-execution!` or `transforms-base.core/execute!`)
  - Publish events (caller should use `complete-execution!` or `transforms-base.core/execute!`)

  Options:
  - `:cancelled?` - (fn [] boolean), polled during execution to check for cancellation
  - `:run-id` - optional, for instrumentation/metrics (nil skips metrics recording)
  - `:with-stage-timing-fn` - optional, (fn [run-id stage thunk]) for timing instrumentation
  - `:message-log` - optional, pre-created message log atom (for python transforms)

  Returns a map:
  {:status :succeeded | :failed | :cancelled | :timeout
   :result <implementation-specific result>
   :error <exception if failed>
   :logs <string, for python transforms>}

  Implementations should:
  - Check `(cancelled?)` at safe points and return {:status :cancelled} if true
  - NOT create/update transform_run rows
  - NOT sync target tables or publish events (caller handles via complete-execution!)"
  {:added "0.57.0" :arglists '([transform options])}
  (fn [transform _options]
    (transform->transform-type transform)))

;; These defaults handle gracefully the case where transforms exist in the database with a type whose implementation
;; is not loaded (e.g. :python transforms when running without EE).

(defmethod source-db-id :default
  [transform]
  (log/warnf "No source-db-id implementation for transform type %s (id: %s)"
             (-> transform :source :type) (:id transform))
  nil)

(defmethod target-db-id :default
  [transform]
  (log/warnf "No target-db-id implementation for transform type %s (id: %s)"
             (-> transform :source :type) (:id transform))
  nil)

(defmethod table-dependencies :default
  [transform]
  (log/warnf "No table-dependencies implementation for transform type %s (id: %s)"
             (-> transform :source :type) (:id transform))
  #{})

(defmethod execute-base! :default
  [transform _options]
  (let [transform-type (-> transform :source :type)]
    (throw (ex-info (format "Cannot execute transform %d: no implementation for transform type %s"
                            (:id transform) transform-type)
                    {:transform-id   (:id transform)
                     :transform-type transform-type}))))

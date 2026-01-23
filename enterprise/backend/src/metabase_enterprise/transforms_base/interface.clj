(ns metabase-enterprise.transforms-base.interface
  "Interface definitions for transform execution.

   This namespace defines the multimethods that different transform types
   (query, python) must implement. The base module uses these for dispatch
   without any database writes for transform_run tracking.")

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
  "Execute a transform and return results in memory. Does NOT write transform_run rows.

  Options:
  - `:cancelled?` - (fn [] boolean), polled during execution to check for cancellation
  - `:run-id` - optional, for instrumentation/metrics (nil skips metrics recording)

  Returns a map:
  {:status :succeeded | :failed | :cancelled
   :result <implementation-specific result>
   :error <exception if failed>
   :logs <string, for python transforms>}

  Implementations should:
  - Check `(cancelled?)` at safe points and return {:status :cancelled} if true
  - Still sync target tables (metabase_table writes are allowed)
  - NOT create/update transform_run rows"
  {:added "0.57.0" :arglists '([transform options])}
  (fn [transform _options]
    (transform->transform-type transform)))

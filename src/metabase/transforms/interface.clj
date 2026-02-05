(ns metabase.transforms.interface)

(defn- transform->transform-type
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

(defmulti execute!
  "Execute a transform operation. Runs the actual transformation process, which might involve running SQL queries,
  Python scripts, or other transformation logic depending on the transform type.

  This method blocks and may take significant time depending on the data volume. Implementations
  should handle errors gracefully and provide appropriate logging.

  Returns nil (or a result that can be discarded).

  Options:
  - `:start-promise`
     Will have a `transform_run.run_id` value delivered once the execution is registered with the database.
     Callers can await this promise to identify the transform_run record, which enables progress / status monitoring.

  - `:run-method`
     Expected to be either `:cron` (for scheduled runs) or `:manual` (for ad-hoc or test runs)
     Used for instrumentation / metadata purposes.

  - `:user-id`
     Optional user ID to attribute the run to. For manual runs, this should be the ID of the user who
     triggered the run. For cron/scheduled runs, this is typically nil, and the run will be attributed
     to the transform's owner (if set) or creator.

  Do not use this directly. Use [[metabase.transforms.execute/execute!]] instead."
  {:added "0.57.0" :arglists '([transform options])}
  (fn [transform _options]
    (transform->transform-type transform)))

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

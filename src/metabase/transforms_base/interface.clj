(ns metabase.transforms-base.interface
  "Pure transform interface — multimethods for dispatch without transform_run lifecycle coupling.")

(defn transform->transform-type
  "Extract the transform type keyword from a transform's source."
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
  "Execute a transform's core logic and return results in-memory, without writing `transform_run` rows.

  Returns a map:
  - `:status`  — `:succeeded` or `:failed`
  - `:result`  — driver-specific result (e.g. row count, response map)
  - `:error`   — exception or error map on failure (nil on success)
  - `:logs`    — optional sequence of log entries

  This is the 'pure' execution primitive. For the full lifecycle (transform_run tracking, sync,
  events), use [[metabase.transforms.interface/execute!]]."
  {:added "0.57.0" :arglists '([transform options])}
  (fn [transform _options]
    (transform->transform-type transform)))

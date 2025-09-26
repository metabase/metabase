(ns metabase-enterprise.transforms.interface)

(defn- transform->transform-type
  [transform]
  (-> transform :source :type keyword))

(defmulti source-db-id
  "Return the ID of the source database for a given `transform`. The source database is where the data originates from
  before being transformed and written to the target destination.

  NOTE: Currently returns a single database ID, but we may want to change this to return multiple database IDs in the
  future since transforms can have multiple input sources."
  {:added "0.47.0" :arglists '([transform])}
  transform->transform-type)

(defmulti target-db-id
  "Return the ID of the target database for a given `transform`. The target database is the destination where the
  transformed data will be written. Often this is the same database as the source database."
  {:added "0.47.0" :arglists '([transform])}
  transform->transform-type)

(defmulti execute!
  "Execute a transform operation. Runs the actual transformation process, which might involve running SQL queries,
  Python scripts, or other transformation logic depending on the transform type.

  This method performs side effects and may take significant time depending on the data volume. Implementations
  should handle errors gracefully and provide appropriate logging."
  {:added "0.47.0" :arglists '([transform options])}
  (fn [transform _options]
    (transform->transform-type transform)))

(defmulti dependencies
  "Return a set of dependencies required to run this transform.

  Returns a set of maps, where each dependency is represented as either:
  - `{:table <table-id>}` for dependencies on database tables
  - `{:transform <transform-id>}` for dependencies on other transforms

  The transform execution system uses these dependencies to determine the correct order of execution
  and to detect circular dependencies. An empty set indicates no dependencies."
  {:added "0.47.0" :arglists '([transform])}
  transform->transform-type)

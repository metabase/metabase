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
  "Return the ID of the source database for a given `transform`."
  {:added "0.57.0" :arglists '([transform])}
  transform->transform-type)

(defmulti target-db-id
  "Return the ID of the target database for a given `transform`."
  {:added "0.57.0" :arglists '([transform])}
  transform->transform-type)

(defmulti table-dependencies
  "Return a set of logical table dependencies of the transform."
  {:added "0.57.0" :arglists '([transform])}
  transform->transform-type)

(defmulti execute-base!
  "Execute a transform and return results in memory. Does NOT write transform_run rows."
  {:added "0.57.0" :arglists '([transform options])}
  (fn [transform _options]
    (transform->transform-type transform)))

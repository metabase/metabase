(ns metabase-enterprise.transforms.interface)

(defn- transform->transform-type
  [transform]
  (-> transform :source :type keyword))

(defmulti source-db-id
  "Return the source db id for a given transform."
  {:added "0.47.0" :arglists '([transform])}
  transform->transform-type)

(defmulti target-db-id
  "Return the target db id for a given transform."
  {:added "0.47.0" :arglists '([transform])}
  transform->transform-type)

(defmulti execute!
  "Execute a transform with an option."
  {:added "0.47.0" :arglists '([transform options])}
  (fn [transform _options]
    (transform->transform-type transform)))

(defmulti dependencies
  "Return a set of dependencies required to run this transforms."
  {:added "0.47.0" :arglists '([transform])}
  transform->transform-type)

(ns representations.read.impl)

(defmulti representation->schema
  "Returns the schema for a given type keyword.
   Each v0 namespace implements this for its own type."
  {:arglists '([{:keys [version type]}])}
  (juxt :version :type))

(defmethod representation->schema :default
  [{:keys [version type] :as representation}]
  (throw (ex-info (format "No schema found for type %s in version %s." type version)
                  representation)))

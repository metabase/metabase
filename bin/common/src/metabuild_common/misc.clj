(ns metabuild-common.misc)

(defmacro varargs
  "Utility macro for passing varargs of a certain `klass` to a Java method.

    (Files/createTempFile \"driver\" \".jar\" (varargs FileAttribute))"
  {:style/indent 1, :arglists '([klass] [klass xs])}
  [klass & [objects]]
  (vary-meta `(into-array ~klass ~objects)
             assoc :tag (format "[L%s;" (.getCanonicalName ^Class (ns-resolve *ns* klass)))))

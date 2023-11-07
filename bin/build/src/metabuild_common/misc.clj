(ns metabuild-common.misc
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(defmacro varargs
  "Utility macro for passing varargs of a certain `klass` to a Java method.

    (Files/createTempFile \"driver\" \".jar\" (varargs FileAttribute))"
  {:arglists '([klass] [klass xs])}
  [klass & [objects]]
  (vary-meta `(into-array ~klass ~objects)
             assoc :tag (format "[L%s;" (.getCanonicalName ^Class (ns-resolve *ns* klass)))))

(defn parse-as-keyword
  "Like [[clojure.core/keyword]], but with a couple of tweaks to make it better for parsing command-line args:

  *  empty strings get parsed to `nil` instead of an empty keyword `:`
  *  strings starting with `:` e.g. `\":driver\"` get parsed to normal keywords e.g. `:driver` instead of `::driver`
     (which is super confusing, because it's an _unnamespaced_ keyword whose the _name_ is `:driver`)"
  [s]
  (cond
    (symbol? s)          (parse-as-keyword (name s))
    (keyword? s)         s
    (not (str/blank? s)) (keyword (cond-> (str s)
                                    (str/starts-with? s ":") (.substring 1)))))

(ns macros.metabase.test.util)

(defmacro with-temp-env-var-value! [bindings & body]
  `((constantly nil)
    ~@(map second (partition-all 2 bindings))
    ~@body))

(defmacro with-temporary-raw-setting-values [bindings & body]
  `((constantly nil)
    ~@(map second (partition-all 2 bindings))
     ~@body))

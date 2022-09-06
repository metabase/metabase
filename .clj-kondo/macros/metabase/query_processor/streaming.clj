(ns macros.metabase.query-processor.streaming)

(defmacro streaming-response [[x y z] & body]
  `(clojure.core/let [~x ~y]
     ~z
     ~@body))

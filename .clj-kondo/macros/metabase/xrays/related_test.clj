(ns macros.metabase.xrays.related-test)

(defmacro with-world [& body]
  `(let [~'collection-id nil
         ~'metric-id-a nil
         ~'metric-id-b nil
         ~'segment-id-a nil
         ~'segment-id-b nil
         ~'card-id-a nil
         ~'card-id-b nil
         ~'card-id-c nil]
     ~'collection-id
     ~'metric-id-a
     ~'metric-id-b
     ~'segment-id-a
     ~'segment-id-b
     ~'card-id-a
     ~'card-id-b
     ~'card-id-c
     ~@body))

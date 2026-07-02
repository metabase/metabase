(ns metabase-enterprise.transforms-test.test-util
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(defn write-temp-csv!
  "Write csv-string to a temporary File and return it."
  ^File [csv-string]
  (doto (File/createTempFile "test-run-" ".csv")
    (spit csv-string)))

(defmacro with-temp-csv-files
  "Bind temp CSV Files from [name csv-str ...] pairs; delete all in finally."
  [bindings & body]
  (let [pairs   (partition 2 bindings)
        names   (mapv first pairs)
        strings (mapv second pairs)]
    `(let [~@(mapcat (fn [n s] [n `(write-temp-csv! ~s)]) names strings)]
       (try
         ~@body
         (finally
           ~@(map (fn [n] `(.delete ~n)) names))))))

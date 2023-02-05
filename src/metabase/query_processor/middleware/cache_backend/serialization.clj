(ns metabase.query-processor.middleware.cache-backend.serialization
  (:require
   [clojure.java.io :as io]
   [clojure.tools.logging :as log]
   [clojure.tools.reader.edn :as edn]
   [clojure.walk :as walk]
   [flatland.ordered.map :as ordered-map]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor.middleware.cache-backend.interface :as i]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [taoensso.nippy :as nippy])
  (:import
   (java.io
    BufferedInputStream
    BufferedOutputStream
    DataInputStream
    DataOutputStream
    EOFException
    FilterOutputStream
    InputStream
    OutputStream)
   (java.util.zip GZIPInputStream GZIPOutputStream)))

(defn- max-bytes-output-stream ^OutputStream
  [max-bytes ^OutputStream os]
  (let [byte-count  (atom 0)
        check-total (fn [current-total]
                      (when (> current-total max-bytes)
                        (log/info (trs "Results are too large to cache.") (u/emoji "😫"))
                        (throw (ex-info (trs "Results are too large to cache.") {:type ::max-bytes}))))]
    (proxy [FilterOutputStream] [os]
      (write
        ([x]
         (if (int? x)
           (do
             (check-total (swap! byte-count inc))
             (.write os ^int x))
           (do
             (check-total (swap! byte-count + (alength ^bytes x)))
             (.write os ^bytes x))))

        ([^bytes ba ^Integer off ^Integer len]
         (check-total (swap! byte-count + len))
         (.write os ba off len))))))

;; flatland.ordered.map.OrderedMap gets encoded and decoded incorrectly, for some reason. See #25915

(nippy/extend-freeze flatland.ordered.map.OrderedMap :flatland/ordered-map
                     [x data-output]
                     (nippy/freeze-to-out! data-output (vec x)))

(nippy/extend-thaw :flatland/ordered-map
                   [data-input]
                   (ordered-map/ordered-map-reader (nippy/thaw-from-in! data-input)))

(defn- freeze!
  [^OutputStream os obj]
  (log/tracef "Freezing %s" (pr-str obj))
  (nippy/freeze-to-out! os obj)
  (.flush os))

(defn- thaw!
  [^InputStream is]
  (try
    (nippy/thaw-from-in! is)
    (catch EOFException _e
      ::eof)))

(defn- reducible-rows
  [^InputStream is]
  (reify clojure.lang.IReduceInit
    (reduce [_ rf init]
      (loop [acc init]
        ;; NORMALLY we would be checking whether `acc` is `reduced?` here and stop reading from the database if it was,
        ;; but since we currently store the final metadata at the very end of the database entry as a special pseudo-row
        ;; we actually have to keep reading the whole thing until we get to that last result. Don't worry, the reducing
        ;; functions can just throw out everything we don't need. See
        ;; [[metabase.query-processor.middleware.cache/cache-version]] for a description of our caching format.
        (let [row (thaw! is)]
          (if (= row ::eof)
            acc
            (recur (rf acc row))))))))

(def nippy-bounded-serializer
  "Nippy serializer. GZipped and frozen, bounded by size."
  (reify
    i/Ser
    (-wrapped-output-stream [_ os options]
      (let [max-bytes (:max-bytes options (* (public-settings/query-caching-max-kb) 1024))]
        (-> (max-bytes-output-stream max-bytes os)
            BufferedOutputStream.
            (GZIPOutputStream. true)
            DataOutputStream.)))
    (-add! [_ os obj]
      (freeze! os obj))
    (-options [_] {:max-bytes (* (public-settings/query-caching-max-kb) 1024)})
    (-name [_] "v3-nippy-bounded-serializer")

    i/Des
    (-metadata-and-reducible-rows [_ is f]
      (with-open [is' (DataInputStream. (GZIPInputStream. (BufferedInputStream. is)))]
        (let [metadata (thaw! is')]
          (if (= metadata ::eof) ;; v3 is here: metadata is first
            (f nil)
            (f [metadata (reducible-rows is')])))))))

(def unbounded-edn-serializer
  "Unbounded edn serializer."
  (let [eof      (Object.)
        read-edn (fn read-edn [pbr]
                   (edn/read {:eof eof, :readers *data-readers*} pbr))]
    (reify
      i/Ser
      (-wrapped-output-stream [_ os _options]
        (BufferedOutputStream. os))
      (-add! [_ os obj]
        (let [bytes (.getBytes (pr-str (walk/postwalk #(if (record? %) (into {} %) %) obj)))]
          (.write os bytes 0 (count bytes))
          (.write os (.getBytes " ") 0 (count (.getBytes " ")))
          (.flush os)))
      (-options [_] {})
      (-name [_] "v3-unbounded-edn-serializer")

      i/Des
      (-metadata-and-reducible-rows [_ is f]
        (with-open [rdr (io/reader is)
                    pbr (java.io.PushbackReader. rdr)]
          (let [metadata (read-edn pbr)]
            (if (= metadata eof)
              (f nil)
              (f [metadata (reify clojure.lang.IReduceInit
                             (reduce [_ rf init]
                               (loop [acc init]
                                 (let [row (read-edn pbr)]
                                   (if (= row eof)
                                     acc
                                     (let [result (rf acc row)]
                                       (if (reduced? result)
                                         @result
                                         (recur result))))))))]))))))))

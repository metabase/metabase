(ns metabase.zip
  (:require [clojure.java.io :as io])
  (:import (java.util.zip ZipOutputStream ZipEntry ZipInputStream)))


(defmacro ^:private with-entry
  [zip entry-name & body]
  `(let [^ZipOutputStream zip# ~zip]
     (.putNextEntry zip# (ZipEntry. ~entry-name))
     ~@body
     (flush)
     (.closeEntry zip#)))


(defn zip-secure-dump
  "Zips to `zip-path` the contents of a dump and secret from provided paths."
  [{:keys [enc-dump-path enc-secret-path zip-path]}]
  (println "Zipping " enc-dump-path enc-secret-path " --> " zip-path)
  (with-open [output (ZipOutputStream. (io/output-stream zip-path))
              input-dump (io/input-stream enc-dump-path)
              input-secret (io/input-stream enc-secret-path)]
    (with-entry output "dump.enc"
                (io/copy input-dump output))
    (with-entry output "secret.enc"
                (io/copy input-secret output))))

(defn unzip-secure-dump
  "Unzips from `zip-path` a dump and secret to provided paths."
  [{:keys [zip-path dump-path secret-path]}]
  (println "Unzipping " zip-path " --> " dump-path secret-path)
  (with-open [stream (->
                       (io/input-stream zip-path)
                       (ZipInputStream.))]
    (loop [entry (.getNextEntry stream)]
      (when entry
        (let [entry-name (.getName entry)]
          (println "Unzipping " entry-name)
          (case entry-name
            "dump.enc" (io/copy stream (io/file dump-path))
            "secret.enc" (io/copy stream (io/file secret-path)))
          (recur (.getNextEntry stream)))))))

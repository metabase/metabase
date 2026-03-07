(ns metabase.channel.temp-file
  "Tracks temporary files created during channel rendering (email attachments, inline images) so they can be deleted
  immediately after the message is sent, rather than accumulating until JVM shutdown via `.deleteOnExit`."
  (:require
   [metabase.util.log :as log])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(def ^:dynamic *tracked-temp-files*
  "When bound to an atom, temp files registered via [[track-temp-file!]] are collected here for cleanup."
  nil)

(defn track-temp-file!
  "Register a temp file for cleanup. When [[*tracked-temp-files*]] is bound (inside [[with-temp-file-cleanup]]),
  the file is tracked and will be deleted when the cleanup block exits. Otherwise, falls back to `.deleteOnExit`."
  [^File f]
  (if-let [tracker *tracked-temp-files*]
    (swap! tracker conj f)
    (.deleteOnExit f))
  f)

(defmacro with-temp-file-cleanup
  "Binds [[*tracked-temp-files*]] so that any temp files registered via [[track-temp-file!]] during `body` are deleted
  in a `finally` block after `body` completes."
  [& body]
  `(binding [*tracked-temp-files* (atom [])]
     (try
       ~@body
       (finally
         (doseq [^File f# @*tracked-temp-files*]
           (try
             (when (.exists f#)
               (.delete f#))
             (catch Exception e#
               (log/warnf e# "Failed to delete temp file: %s" (.getAbsolutePath f#)))))))))

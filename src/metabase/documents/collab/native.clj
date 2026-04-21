(ns metabase.documents.collab.native
  "Probe for the JNI-backed Y-CRDT native library. Callers use this to gate any
   initialization that would touch `net.carcdr.*` classes at startup."
  (:require
   [metabase.util.log :as log])
  (:import
   (java.time Duration)
   (java.util ServiceConfigurationError)
   (net.carcdr.yhocuspocus.core YHocuspocus)))

(set! *warn-on-reflection* true)

(defn native-library-available?
  "Build and immediately close a throwaway `YHocuspocus` to force JNI binding
   discovery. Returns `true` iff the native library loaded cleanly, `false`
   otherwise (logging a warning)."
  []
  (try
    (with-open [_ (.. (YHocuspocus/builder)
                      (debounce (Duration/ofMillis 100))
                      (maxDebounce (Duration/ofMillis 500))
                      (build))]
      true)
    (catch ServiceConfigurationError e
      (log/warn e "Y-CRDT JNI binding unavailable")
      false)
    (catch UnsatisfiedLinkError e
      (log/warn e "Y-CRDT native library failed to load")
      false)
    (catch Throwable t
      (log/warn t "Unexpected error probing Y-CRDT native library")
      false)))

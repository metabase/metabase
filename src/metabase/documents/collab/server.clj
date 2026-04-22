(ns metabase.documents.collab.server
  "Lifecycle for the embedded `YHocuspocus` server. Built lazily on first
   `get-server` call; closed on app shutdown via `metabase.core.core/destroy!`.

   `get-server` returns `nil` when the feature flag is off or when the JNI
   native library failed to load. Callers treat `nil` as \"feature unavailable\"
   (the websocket handler closes the connection with 1011 in that case)."
  (:require
   [metabase.config.core :as config]
   [metabase.documents.collab.native :as collab.native]
   [metabase.documents.collab.persistence :as collab.persistence]
   [metabase.util.log :as log])
  (:import
   (java.time Duration)
   (net.carcdr.yhocuspocus.core YHocuspocus)))

(set! *warn-on-reflection* true)

(defn- build-server! ^YHocuspocus []
  (log/info "collab: starting YHocuspocus server")
  (.. (YHocuspocus/builder)
      (extension (collab.persistence/create-persistence-extension))
      (debounce    (Duration/ofSeconds 2))
      (maxDebounce (Duration/ofSeconds 10))
      (build)))

(defonce ^:private server-delay
  (delay
    (try
      (when (and (config/config-bool :mb-enable-document-collab)
                 (collab.native/native-library-available?))
        (build-server!))
      (catch Throwable t
        (log/warnf t "collab: failed to start YHocuspocus")
        nil))))

(defn get-server
  "Return the running `YHocuspocus` or `nil` if the feature is disabled or the
   native library failed to load."
  ^YHocuspocus []
  @server-delay)

(defn stop!
  "Close the server if it was built. Idempotent — safe to call at shutdown
   whether or not the feature ever started."
  []
  (when (realized? server-delay)
    (when-let [^YHocuspocus s @server-delay]
      (try
        (log/info "collab: stopping YHocuspocus server")
        (.close s)
        (catch Throwable t
          (log/warnf t "collab: error stopping YHocuspocus"))))))

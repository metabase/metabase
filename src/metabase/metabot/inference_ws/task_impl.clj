(ns metabase.metabot.inference-ws.task-impl
  (:require
    [metabase.metabot.inference-ws-client :as inference-ws-client]
    [metabase.metabot.settings :as metabot-settings]
    [metabase.metabot.protocols :as metabot-protocols]))

(defn inference-ws-embedder
  ([base-url]
   (reify metabot-protocols/Embedder
     (single [_ prompt]
       (get (inference-ws-client/bulk-embeddings base-url {prompt prompt}) prompt))
     (bulk [_ m]
       (inference-ws-client/bulk-embeddings base-url m))))
  ([] (inference-ws-embedder
        (metabot-settings/metabot-inference-ws-url))))

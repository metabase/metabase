(ns metabase.metabot.inference-ws.task-impl
  (:require
   [metabase.metabot.inference-ws-client :as inference-ws-client]
   [metabase.metabot.settings :as metabot-settings]
   [metabase.metabot.protocols :as metabot-protocols]))

(defrecord MBFineTuneEmbedder [base-url])

(extend-type MBFineTuneEmbedder
  metabot-protocols/Embedder
  (single [{:keys [base-url]} prompt]
    (get (inference-ws-client/bulk-embeddings base-url {prompt prompt}) prompt))
  (bulk [{:keys [base-url]} m]
    (inference-ws-client/bulk-embeddings base-url m)))

(defn inference-ws-embedder
  ([base-url]
   (->MBFineTuneEmbedder base-url))
  ([] (inference-ws-embedder (metabot-settings/metabot-inference-ws-url))))

(ns metabase.metabot.inference-ws.task-impl
  (:require
   [metabase.metabot.inference-ws.client :as inference-ws-client]
   [metabase.metabot.settings :as metabot-settings]
   [metabase.metabot.task-api :as task-api]
   [metabase.metabot.util :as metabot-util]
   [metabase.models :as models]
   [toucan2.core :as t2]))

(defrecord MBFineTuneEmbedder [base-url])

(extend-type MBFineTuneEmbedder
  task-api/Embedder
  (single [{:keys [base-url]} prompt]
    (get (inference-ws-client/bulk-embeddings base-url {prompt prompt}) prompt))
  (bulk [{:keys [base-url]} m]
    (inference-ws-client/bulk-embeddings base-url m)))

(defrecord MBFineTuneMBQLInferencer [base-url])

(extend-type MBFineTuneMBQLInferencer
  task-api/MBQLInferencer
  (infer-mbql [{:keys [base-url]} request]
    (inference-ws-client/infer base-url request)))

(defn inference-ws-embedder
  ([base-url]
   (->MBFineTuneEmbedder base-url))
  ([] (inference-ws-embedder (metabot-settings/metabot-inference-ws-url))))

(defn inference-ws-mbql-inferencer
  ([base-url]
   (->MBFineTuneMBQLInferencer base-url))
  ([] (inference-ws-mbql-inferencer (metabot-settings/metabot-inference-ws-url))))

(defn inference-ws-context-generator []
  (reify task-api/ContextGenerator
    (context [_ {:keys [context-entities]}]
      (for [[entity-type entity-id] context-entities
            :let [resolved-type ({:model models/Card :card models/Card} entity-type)
                  entity (t2/select-one resolved-type :id entity-id)]]
        (metabot-util/model->context entity)))))
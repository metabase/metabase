(ns metabase.metabot.precomputes
  (:require
    [metabase.metabot.inference-ws-client :as inference-ws-client]
    [metabase.metabot.protocols :as metabot-protocols]
    [metabase.metabot.util :as metabot-util]
    [metabase.models :as models]
    [toucan2.core :as t2]))

(defrecord AtomicPrecomputes [store])

(defn all-precomputes []
  (let [models         (t2/select models/Card :dataset true :archived false)
        encoded-models (zipmap
                        (map :id models)
                        (map metabot-util/model->summary models))
        ;; TODO -- partition-all X and then this...
        embeddings     (update-keys
                        (inference-ws-client/call-bulk-embeddings-endpoint encoded-models)
                        parse-long)]
    {:embeddings    {:card embeddings :table {}}
     :compa-summary {:card encoded-models :table {}}}))

(extend-type AtomicPrecomputes
  metabot-protocols/Precomputes
  (embeddings
    ([{:keys [store]}]
     (let [{:keys [embeddings]} @store
           {:keys [card table]} embeddings]
       (into
        {}
        (concat
         (map (fn [[id embedding]] [[:card id] embedding]) card)
         (map (fn [[id embedding]] [[:table id] embedding]) table)))))
    ([{:keys [store]} entity-type entity-id]
     (get-in @store [:embeddings entity-type entity-id])))
  (compa-summary [{:keys [store]} entity-type entity-id]
    (get-in @store [:compa-summary entity-type entity-id]))
  (update! [{:keys [store]}]
    (swap! store (constantly (all-precomputes)))))

(defn atomic-precomputes []
  (map->AtomicPrecomputes {:store (atom (all-precomputes))}))
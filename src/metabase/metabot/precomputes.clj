(ns metabase.metabot.precomputes
  (:require
    [metabase.metabot.inference-ws-client :as inference-ws-client]
    [metabase.metabot.util :as metabot-util]
    [metabase.models :as models]
    [toucan2.core :as t2]))

(defprotocol Precomputes
  (embeddings [this] [this entity-type entity-id])
  (compa-summary [this entity-type entity-id])
  (context [this entity-type entity-id])
  (update! [this]))

(defrecord AtomicPrecomputes [store])

(defn all-precomputes []
  (let [models         (t2/select models/Card :dataset true :archived false)
        encoded-models (zipmap
                         (map :id models)
                         (map metabot-util/model->summary models))
        model-contexts (zipmap
                         (map :id models)
                         (map metabot-util/model->context models))
        ;; TODO -- partition-all X and then this...
        embeddings      (update-keys
                         (inference-ws-client/bulk-embeddings encoded-models)
                         parse-long)]
    {:embeddings    {:card embeddings :table {}}
     :context       {:card model-contexts :table {}}
     :compa-summary {:card encoded-models :table {}}}))

#_
(defn cache-models
  [endpoint]
  (let [models (t2/select Card :archived false)
        id->context (into {} (map (juxt :id model->context)) models)
        title->id   (into {} (map (juxt :name :id)) models)
        embeddings  (into {} (comp (map (fn [m]
                                          [(:name m) (model->summary m)]))
                                   (partition-all 100)
                                   (map (fn [part]
                                          (let [name->embed-str (into {} part)]
                                            (bulk-embeddings endpoint name->embed-str)))))
                          models)]
    {:id->context id->context
     :title->id title->id
     :embeddings embeddings}))

(extend-type AtomicPrecomputes
  Precomputes
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
  (context [{:keys [store]} entity-type entity-id]
    (get-in @store [:context entity-type entity-id]))
  (update! [{:keys [store]}]
    (swap! store (constantly (all-precomputes)))))

(defn atomic-precomputes []
  (map->AtomicPrecomputes {:store (atom (all-precomputes))}))
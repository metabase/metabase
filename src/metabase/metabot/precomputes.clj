(ns metabase.metabot.precomputes
  (:require
   [metabase.metabot.task-api :as task-api]
   [metabase.metabot.task-impl :as task-impl]
   [metabase.metabot.util :as metabot-util]
   [metabase.models :as models]
   [toucan2.core :as t2]))

(defprotocol Precomputes
  (embeddings [this] [this entity-type entity-id])
  (compa-summary [this entity-type entity-id])
  (update! [this]))

(defrecord AtomicPrecomputes [store])

(defn all-precomputes []
  (let [embedder       (task-impl/fine-tune-embedder)
        models         (t2/select models/Card :dataset true :archived false)
        encoded-models (zipmap
                        (map :id models)
                        (map metabot-util/model->summary models))
        ;; TODO -- partition-all X and then this...
        embeddings     (update-keys
                        (task-api/bulk embedder encoded-models)
                        parse-long)]
    {:embeddings    {:card embeddings :table {}}
     :compa-summary {:card encoded-models :table {}}}))

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
  (update! [{:keys [store]}]
    (swap! store (constantly (all-precomputes)))))

(defn atomic-precomputes []
  (map->AtomicPrecomputes {:store (atom (all-precomputes))}))
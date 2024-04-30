(ns metabase.models.cache-config
  "A model representing cache configuration."
  (:require
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def CacheConfig "Cache configuration" :model/CacheConfig)

(doto :model/CacheConfig
  (derive :metabase/model)
  (derive :hook/timestamped?))

(methodical/defmethod t2/table-name :model/CacheConfig [_model] :cache_config)

(t2/deftransforms :model/CacheConfig
  {:strategy mi/transform-keyword
   :config   mi/transform-json
   :state    mi/transform-json})

;;; API

(defn root-strategy
  "Returns root strategy, if it's defined."
  []
  (t2/select-one :model/CacheConfig :model "root" :model_id 0 :strategy :ttl))

(defn row->config
  "Transform from how cache config is stored to how it's used/exposed in the API."
  [row]
  (when row
    {:model    (:model row)
     :model_id (:model_id row)
     :strategy (-> (:config row)
                   (assoc :type (:strategy row)))}))

(defn card-strategy
  "Shapes `row` into strategy for a given `card`."
  [row card]
  (some-> (:strategy (row->config row))
          (m/assoc-some :invalidated-at (t/max (:invalidated_at row)
                                               (:cache_invalidated_at card)))))

(defn config->row
  "Transform cache config from API form into db storage form."
  [{:keys [model model_id strategy]}]
  {:model    model
   :model_id model_id
   :strategy (:type strategy)
   :config   (dissoc strategy :type)})

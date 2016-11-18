(ns metabase.card-cache
  (:require
    [clojure.tools.logging :as log]
    [metabase.models.card-cache :as model]
    [metabase.models.setting :as setting :refer [defsetting]]))


;;; ## ---------------------------------------- SETTINGS ----------------------------------------

(defonce all-settings [:cache-enabled :cache-scope :cache-global-max-age :cache-max-allowed-size])

(defn- set-number
  [new-value key]
  (when-not (nil? new-value)
    (assert (number? (read-string new-value))))
  (setting/set-string! key new-value))


(defn- get-number
  [key]
  (read-string (setting/get key)))


(defsetting cache-enabled
            "If cache is enabled"
            :type :boolean
            :default false)

(defsetting cache-scope
            "Where the cache is applyied (global/card)"
            :type :string
            :default nil
            :setter (fn [new-value]
                      (when-not (nil? new-value)
                        (assert (contains? #{"global" "card"} new-value)))
                      (setting/set-string! :cache-scope new-value)))

(defsetting cache-global-max-age
            "When scope is global, what is the duration of cached data?"
            :type :string
            :default nil
            :setter (fn [new-value] (set-number new-value :cache-global-max-age)))

(defsetting cache-max-allowed-size
            "The max size in bytes allowed to store data in cache"
            :type :string
            :default nil
            :setter (fn [new-value] (set-number new-value :cache-max-allowed-size)))


;;; ## ---------------------------------------- API ----------------------------------------

(defrecord CacheConfig [use-cache? scope max-allowed-size max-age])

(def no-cache (->CacheConfig false "none" 0 0))

(defn get-cache-config
  [card]
  (if (setting/get :cache-enabled)
    (if (= (setting/get :cache-scope) "global")
      (->CacheConfig true "global" (get-number :cache-max-allowed-size) (get-number :cache-global-max-age))
      (if (:cache_result card)
        (->CacheConfig true "card" (get-number :cache-max-allowed-size) (:cache_max_age card))
        no-cache))
    no-cache))

(defn uses-cache?
  "Checks if the current card should be cached"
  [card]
  (if (setting/get :cache-enabled)
    (if (= (setting/get :cache-scope) "global")
      true
      (:cache-result card))
    false))

(defn fetch-from-cache
  "Fetch the result from cache if exists and is still valid, returns nil otherwise"
  [cache-config card-id query-hash]
  (model/fetch-from-cache card-id query-hash (:max-age cache-config)))

(defn update-cache!
  "Update the cache for a card with a more recent version"
  [cache-config card-id query-hash result]
  (model/update-cache! card-id query-hash result (:max-allowed-size cache-config)))

;;; EVICTION

(defn evict!
  "Delete all card cache entries that are expired or no longer needed"
  []
  (log/info "Going to evict cache entries...")
  (model/evict!))


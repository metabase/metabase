(ns metabase.models.card-cache
  (:require
    (honeysql [core :as hsql]
              [helpers :as h])
    (metabase [db :as db])
    [metabase.models.interface :as i]
    [metabase.util :as u]
    [clojure.tools.logging :as log])
  (:import (java.util Date)))

(i/defentity CardCache :report_card_cache)

(u/strict-extend (class CardCache)
   i/IEntity
   (merge i/IEntityDefaults
          {:timestamped? (constantly true)
           :types        (constantly {:result :json})
           :can-read?    (constantly true)
           :can-write?   (constantly true)}))


(defn- calc-age
  "Returns the age in seconds from now to a given Date instance"
  [time]
  (if (some? time)
    (int (/ (- (.getTime (new Date)) (.getTime time)) 1000))
    Integer/MAX_VALUE))

(defn fetch-from-cache
  "Fetch the result from cache if exists and if it is still valid, returns nil otherwise"
  [query-id query-hash max-age]
  (let [cached (CardCache :card_id query-id :query_hash query-hash)
        time-diff (calc-age (:updated_at cached))]
    (if (and (some? cached) (<= time-diff max-age))
      (do (log/info "⚡ cached result") (:result cached))
      (log/info "☹ no cached result"))))

(defn update-cache!
  "Update the cache for a card with a more recent version"
  [card-id query-hash result]
  (let [id (db/select-field :id CardCache :card_id card-id :query_hash query-hash)]
    (if (some? id)
      (db/update! CardCache (first id) {:result result})
      (db/insert! CardCache {:card_id card-id :query_hash query-hash :result result}))))


(defn- select-expired-cache-query
  "Builds the honeysql query to select the card cache entries that should be evicted"
  []
  (-> (h/select :cc.id)
      (h/from [:report_card_cache :cc])
      (h/join [:report_card :c] [:= :c.id :cc.card_id])
      (h/where [:or
                [:= :c.cache_result false]
                [:= :c.archived true]
                [:> :%now (hsql/call :dateadd (hsql/raw "'second'") :c.cache_max_age :cc.updated_at)]])))

(defn- delete-expired-cache-query
  "Builds the honeysql query to delete the card cache entries that should be evicted"
  []
  (-> (h/delete-from :report_card_cache)
      (h/where [:in :id (select-expired-cache-query)])))

(defn evict!
  "Delete all card cache entries that are expired or no longer needed"
  []
  (log/info "Going to evict cache entries...")
  (let [result (db/execute! (delete-expired-cache-query))
        rows-affected (first result)]
    (if (zero? rows-affected)
      (log/info "No cache entries evicted")
      (log/info (format "Evicted %d cache entries" rows-affected)))))

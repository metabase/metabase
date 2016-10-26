(ns metabase.models.card-cache
  (:require
    [clojure.tools.logging :as log]
    (honeysql [core :as hsql]
              [helpers :as h])
    (metabase [config :as config]
              [db :as db]
              [util :as u])
    [metabase.models.interface :as i]
    [taoensso.nippy :as nippy]))

;;; This is a hand managed version from data stored in the cache.
;;; So if we ever change the schema of the query result or the serialization/compression of cached data we can simply ignore older versions =)
(def ^:const cache-schema-version 1)

(i/defentity CardCache :report_card_cache)

(u/strict-extend (class CardCache)
   i/IEntity
   (merge i/IEntityDefaults
          {:timestamped? (constantly true)
           :types        (constantly {:data :bytes})
           :can-read?    (constantly true)
           :can-write?   (constantly true)}))

;;;; QUERIES

(defn- is-db-postgres?
  []
  (= (config/config-kw :mb-db-type) :postgres))

(defn- expired-clause
  "Builds the right where clause depending of the MB db type"
  [operator max-age updated-at-column]
  (if (is-db-postgres?)
    [operator :%now (hsql/call :+ updated-at-column (hsql/call :* max-age (hsql/raw "interval '1 second'")))]
    [operator :%now (hsql/call :dateadd (hsql/raw "'second'") max-age updated-at-column)]))

(defn- select-cache-entry-query
  " Builds the 'where' part to fetch a cache entry. It makes
  "
  [card-id query-hash max-age]
  (h/where [:= :card_id card-id]
           [:= :query_hash query-hash]
           [:= :schema_version cache-schema-version]
           (expired-clause :<= max-age :updated_at)))

(defn- select-expired-cache-query
  "Builds the honeysql query to select the card cache entries that should be evicted"
  []
  (-> (h/select :cc.id)
      (h/from [:report_card_cache :cc])
      (h/join [:report_card :c] [:= :c.id :cc.card_id])
      (h/where [:or
                [:= :c.cache_result false]
                [:= :c.archived true]
                [:<> :cc.schema_version cache-schema-version]
                (expired-clause :> :c.cache_max_age :cc.updated_at)])))

(defn- delete-expired-cache-query
  "Builds the honeysql query to delete the card cache entries that should be evicted"
  []
  (-> (h/delete-from :report_card_cache)
      (h/where [:in :id (select-expired-cache-query)])))

;;;; SERIALIZATION

(defn- serialize
  [result]
  (nippy/freeze result {:compressor nippy/snappy-compressor}))

(defn- deserialize
  [bytes]
  (nippy/thaw bytes {:compressor nippy/snappy-compressor}))

;;;; OPERATIONS

(defn fetch-from-cache
  "Fetch the result from cache if exists and if it is still valid, returns nil otherwise"
  [card-id query-hash max-age]
  (let [card-cache (db/simple-select-one CardCache (select-cache-entry-query card-id query-hash max-age))]
    (if-let [data (:data card-cache)]
      (do
        (log/info (format "⚡ cached result. Object size is %d bytes" (count data)))
        (assoc (deserialize data) :from_cache true :cache_last_update (:updated_at card-cache)))
      (log/info "☹ no cached result"))))

(defn update-cache!
  "Update the cache for a card with a more recent version"
  [card-id query-hash result]
  (let [id (db/select-field :id CardCache :card_id card-id :query_hash query-hash)
        bytes (serialize result)
        card-cache-data {:data bytes :data_size (count bytes) :schema_version cache-schema-version}]
    (if (some? id)
      (db/update! CardCache (first id) card-cache-data)
      (db/insert! CardCache (assoc card-cache-data :card_id card-id :query_hash query-hash)))))

;;; EVICTION

(defn evict!
  "Delete all card cache entries that are expired or no longer needed"
  []
  (log/info "Going to evict cache entries...")
  (let [result (db/execute! (delete-expired-cache-query))
        rows-affected (first result)]
    (if (zero? rows-affected)
      (log/info "No cache entries evicted")
      (log/info (format "Evicted %d cache entries" rows-affected)))))

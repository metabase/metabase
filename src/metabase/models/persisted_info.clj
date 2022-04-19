(ns metabase.models.persisted-info
  (:require [buddy.core.codecs :as codecs]
            [clojure.string :as str]
            [metabase.query-processor.util :as qputil]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.models :as models]))

(def ^:dynamic *allow-persisted-substitution*
  "Allow persisted substitution. When refreshing, set this to nil to ensure that all undelrying queries are used to
  rebuild the persisted table."
  true)

(defn- slug-name
  "A slug from a card suitable for a table name."
  [nom]
  (->> (str/replace (str/lower-case nom) #"\s+" "_")
       (take 10)
       (apply str)))

(defn query-hash
  "Base64 string of the hash of a query."
  [query]
  (String. ^bytes (codecs/bytes->b64 (qputil/query-hash query))))

(models/defmodel PersistedInfo :persisted_info)

(u/strict-extend (class PersistedInfo)
  models/IModel
  (merge models/IModelDefaults
         {:types (constantly {:columns :json})}))

(defn persisted?
  "Hydrate a card :is_persisted for the frontend."
  {:hydrate :persisted}
  [card]
  (db/exists? PersistedInfo :card_id (:id card)))

(defn mark-for-deletion [conditions-map]
  (db/update-where! PersistedInfo conditions-map :active false, :state "deleteable", :state_change_at :%now))

(defn make-ready [user-id card]
  (let [slug (-> card :name slug-name)
        {:keys [dataset_query result_metadata database_id]} card
        card-id (u/the-id card)
        existing-persisted-info (db/select-one PersistedInfo :card_id card-id)
        persisted-info (cond
                         (not existing-persisted-info)
                         (db/insert! PersistedInfo {:card_id         card-id
                                                    :database_id     database_id
                                                    :question_slug   slug
                                                    :query_hash      (query-hash dataset_query)
                                                    :table_name      (format "model_%s_%s" card-id slug)
                                                    :columns         (mapv :name result_metadata)
                                                    :active          false
                                                    :refresh_begin   :%now
                                                    :refresh_end     nil
                                                    :state           "creating"
                                                    :state_change_at :%now
                                                    :creator_id      user-id})

                         (= "deleteable" (:state existing-persisted-info))
                         (do
                           (db/update! PersistedInfo :active false, :state "creating", :state_change_at :%now)
                           (db/select-one PersistedInfo :card_id card-id)))]
    persisted-info))

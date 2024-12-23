(ns metabase.models.search-index-metadata
  (:require
   [java-time.api :as t]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SearchIndexMetadata [_model] :search_index_metadata)

(doto :model/SearchIndexMetadata
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/SearchIndexMetadata
  {:engine mi/transform-keyword
   :status (mi/transform-validator mi/transform-keyword (partial mi/assert-enum #{:pending :active :retired}))})

(defn indexes
  "The current 'pending' and 'active' indexes for the given co-ordinates, where they exist."
  [engine version]
  (t2/select-fn->fn :status :index_name :model/SearchIndexMetadata
                    :engine engine
                    :version version
                    :status [:in [:active :pending]]))

(defn create-pending!
  "Create a 'pending' entry, unless one already exists. Return whether it was created."
  [engine version index-name]
  (boolean
   (when-not (t2/exists? :model/SearchIndexMetadata
                         :engine engine
                         :version version
                         :status :pending)
     (try
       (t2/insert! :model/SearchIndexMetadata {:engine     engine
                                               :version    version
                                               :status     :pending
                                               :index_name (name index-name)})
       true
       (catch Exception _
         ;; We assume that failure corresponds to a unique index conflict (a pending entry already exists)
         false)))))

(defn delete-index!
  "Delete the given pending index, as long as its still pending."
  [engine version index-name]
  (t2/delete! :model/SearchIndexMetadata :engine engine :version version :index_name (name index-name)))

(defn active-pending!
  "If there is 'pending' index, make it 'active'. Return the name of the active index, regardless."
  [engine version]
  (t2/with-transaction [_conn]
    (when (t2/exists? :model/SearchIndexMetadata :engine engine :version version :status :pending)
      (t2/delete! :model/SearchIndexMetadata :engine engine :version version :status :retired)
      (t2/update! :model/SearchIndexMetadata {:engine engine :version version :status :active} {:status :retired})
      (t2/update! :model/SearchIndexMetadata {:engine engine :version version :status :pending} {:status :active}))
    (t2/select-one-fn :index_name :model/SearchIndexMetadata :engine engine :version version :status :active)))

(defn delete-obsolete!
  "Remove metadata corresponding to obsolete Metabase versions.
  It is up to the relevant engine to delete the actual indexes themselves."
  [our-version]
  ;; If there are no recent versions, then there is nothing to delete.
  (when-let [most-recent (seq (map :version (t2/query {:select   [:version]
                                                       :from     [(t2/table-name :model/SearchIndexMetadata)]
                                                       :group-by [:version]
                                                       ;; use pk as a tie-breaker
                                                       :order-by [[[:max :updated_at] :desc]
                                                                  [[:max :id] :desc]]
                                                       :limit    3})))]
    (t2/query-one {:delete-from [(t2/table-name :model/SearchIndexMetadata)]
                   :where       [:or
                                 [:not-in :version most-recent]
                                 ;; Drop those older than 1 day, unless we are using them, or they are the most recent.
                                 [:and
                                  [:not-in :version (filter some? [our-version (first most-recent)])]
                                  [:< :updated_at (t/minus (t/zoned-date-time) (t/days 1))]]]})))

(ns metabase.search.models.search-index-metadata
  (:require
   [java-time.api :as t]
   [metabase.models.interface :as mi]
   [metabase.search.db :as search.db]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SearchIndexMetadata [_model] :search_index_metadata)

(doto :model/SearchIndexMetadata
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/SearchIndexMetadata
  {:engine mi/transform-keyword
   :status (mi/transform-validator mi/transform-keyword (partial mi/assert-enum #{:pending :active :retired}))})

(def ^:private pending-table-cut-off
  "Period after which a pending table will be discarded, as it is probably corrupted."
  (t/days 1))

(defn indexes
  "The current 'pending' and 'active' indexes for the given coordinates, where they exist."
  [engine version]
  (let [pending-cut-off (t/minus (t/offset-date-time) pending-table-cut-off)]
    (->> (search.db/index-metadata engine version (i18n/site-locale-string))
         (filter (fn [{:keys [status created_at]}]
                   (or (not= status :pending)
                       (t/before? pending-cut-off created_at))))
         (u/index-by :status :index_name))))

(defn create-pending!
  "Create a 'pending' entry, unless one already exists. Return whether it was created."
  [engine version index-name]
  ;; Clear out any expired records
  (search.db/delete-expired-pending-index-metadata! (i18n/site-locale-string) (t/minus (t/offset-date-time) pending-table-cut-off))
  (boolean
   (when-not (search.db/pending-index-metadata-exists? engine version (i18n/site-locale-string))
     (try
       (search.db/insert-index-metadata! {:engine     engine
                                          :version    version
                                          :lang_code (i18n/site-locale-string)
                                          :status     :pending
                                          :index_name (name index-name)})
       (log/infof "Inserted new pending table %s" index-name)
       true
       (catch Exception _
         ;; We assume that failure corresponds to a unique index conflict (a pending entry already exists)
         false)))))

(defn delete-index!
  "Delete the given pending index, as long as its still pending."
  [engine version index-name]
  (search.db/delete-index-metadata! engine version (i18n/site-locale-string) (name index-name)))

(defn active-pending!
  "If there is 'pending' index, make it 'active'. Return the name of the active index, regardless."
  [engine version]
  (t2/with-transaction [_conn]
    (when (search.db/pending-index-metadata-exists? engine version (i18n/site-locale-string))
      (search.db/delete-retired-index-metadata! engine version (i18n/site-locale-string))
      (search.db/retire-active-index-metadata! engine version (i18n/site-locale-string))
      (search.db/activate-pending-index-metadata! engine version (i18n/site-locale-string)))
    (search.db/active-index-name engine version (i18n/site-locale-string))))

(defn delete-obsolete!
  "Remove metadata corresponding to obsolete Metabase versions.
  It is up to the relevant engine to delete the actual indexes themselves."
  [our-version]
  ;; If there are no recent versions, then there is nothing to delete.
  (when-let [most-recent (seq (map :version (search.db/recent-index-versions 3)))]
    ;; Drop those older than 1 day, unless we are using them, or they are the most recent.
    (search.db/delete-obsolete-index-metadata! most-recent
                                               (filter some? [our-version (first most-recent)])
                                               (t/minus (t/zoned-date-time) pending-table-cut-off))))

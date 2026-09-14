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
  "The current 'pending' and 'active' indexes for the given coordinates, where they exist.
  Reads on `conn` when given."
  ([engine version]
   (indexes nil engine version))
  ([conn engine version]
   (let [pending-cut-off (t/minus (t/offset-date-time) pending-table-cut-off)]
     (->> (search.db/index-metadata conn engine version (i18n/site-locale-string))
          (filter (fn [{:keys [status created_at]}]
                    (or (not= status :pending)
                        (t/before? pending-cut-off created_at))))
          (u/index-by :status :index_name)))))

(defn create-pending!
  "Create a 'pending' entry, unless one already exists.
  Return whether it was created.
  Writes on `conn` when given, so index structure can outlive a caller's transaction."
  ([engine version index-name]
   (create-pending! nil engine version index-name))
  ([conn engine version index-name]
   ;; Clear out any expired records
   (search.db/delete-expired-pending-index-metadata! conn
                                                     (i18n/site-locale-string)
                                                     (t/minus (t/offset-date-time) pending-table-cut-off))
   (boolean
    (when-not (search.db/pending-index-metadata-exists? conn engine version (i18n/site-locale-string))
      (try
        (search.db/insert-index-metadata! conn {:engine     engine
                                                :version    version
                                                :lang_code  (i18n/site-locale-string)
                                                :status     :pending
                                                :index_name (name index-name)})
        (log/infof "Inserted new pending table %s" index-name)
        true
        (catch Exception _
          ;; We assume that failure corresponds to a unique index conflict (a pending entry already exists)
          false))))))

(defn delete-pending-index!
  "Delete an index's metadata only while it remains pending, using `conn` when provided."
  ([engine version index-name]
   (delete-pending-index! nil engine version index-name))
  ([conn engine version index-name]
   (search.db/delete-named-pending-index-metadata! conn engine version (i18n/site-locale-string) (name index-name))))

(defn replace-pending!
  "Replace any pending metadata for this coordinate with `index-name`, writing on `conn`."
  [conn engine version index-name]
  (let [lang-code (i18n/site-locale-string)]
    (search.db/delete-pending-index-metadata! conn engine version lang-code)
    (search.db/insert-index-metadata! conn {:engine     engine
                                            :version    version
                                            :lang_code  lang-code
                                            :status     :pending
                                            :index_name (name index-name)})
    true))

(defn- retire-active! [conn engine version lang-code]
  (search.db/delete-retired-index-metadata! conn engine version lang-code)
  (search.db/retire-active-index-metadata! conn engine version lang-code))

(defn active-pending!
  "If there is a pending index, make it active and return the active index name."
  [engine version]
  (t2/with-transaction [conn]
    (let [lang-code (i18n/site-locale-string)]
      (when (search.db/pending-index-metadata-exists? conn engine version lang-code)
        (retire-active! conn engine version lang-code)
        (search.db/activate-pending-index-metadata! conn engine version lang-code))
      (search.db/active-index-name conn engine version lang-code))))

(defn activate-named-pending!
  "Make `index-name` the active index on `conn` and return the active index name.
  When its pending row is gone the existing active name comes back unchanged, so compare the result with the name
  you expected to promote."
  [conn engine version index-name]
  ;; Naming the index is what stops an old worker promoting a replacement owner's pending table.
  (let [lang-code  (i18n/site-locale-string)
        index-name (name index-name)]
    (when (search.db/named-pending-index-metadata-exists? conn engine version lang-code index-name)
      (retire-active! conn engine version lang-code)
      (search.db/activate-named-pending-index-metadata! conn engine version lang-code index-name))
    (search.db/active-index-name conn engine version lang-code)))

(defn delete-obsolete!
  "Remove metadata corresponding to obsolete Metabase versions.
  It is up to the relevant engine to delete the actual indexes themselves."
  ([our-version]
   (delete-obsolete! nil our-version))
  ([conn our-version]
   ;; If there are no recent versions, then there is nothing to delete.
   (when-let [most-recent (seq (map :version (search.db/recent-index-versions conn 3)))]
     ;; Drop those older than 1 day, unless we are using them, or they are the most recent.
     (search.db/delete-obsolete-index-metadata! conn
                                                most-recent
                                                (filter some? [our-version (first most-recent)])
                                                (t/minus (t/zoned-date-time) pending-table-cut-off)))))

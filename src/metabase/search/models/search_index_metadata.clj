(ns metabase.search.models.search-index-metadata
  (:require
   [java-time.api :as t]
   [metabase.models.interface :as mi]
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

(defn- indexes* [conn engine version]
  (let [pending-cut-off (t/minus (t/offset-date-time) pending-table-cut-off)]
    (->> (if conn
           (t2/select :conn conn [:model/SearchIndexMetadata :index_name :status :created_at]
                      :engine engine
                      :version version
                      :lang_code (i18n/site-locale-string)
                      :status [:in [:active :pending]])
           (t2/select [:model/SearchIndexMetadata :index_name :status :created_at]
                      :engine engine
                      :version version
                      :lang_code (i18n/site-locale-string)
                      :status [:in [:active :pending]]))
         (filter (fn [{:keys [status created_at]}]
                   (or (not= status :pending)
                       (t/before? pending-cut-off created_at))))
         (u/index-by :status :index_name))))

(defn indexes
  "The current 'pending' and 'active' indexes for the given coordinates, where they exist."
  [engine version]
  (indexes* nil engine version))

(defn indexes-on-current-connection
  "Like [[indexes]], using the caller's explicit transaction connection."
  [conn engine version]
  (indexes* conn engine version))

(defn create-pending!
  "Create a 'pending' entry, unless one already exists. Return whether it was created."
  [engine version index-name]
  ;; Clear out any expired records
  (t2/delete! :model/SearchIndexMetadata
              {:where [:and
                       [:= :lang_code (i18n/site-locale-string)]
                       [:= :status "pending"]
                       [:< :created_at (t/minus (t/offset-date-time) pending-table-cut-off)]]})
  (boolean
   (when-not (t2/exists? :model/SearchIndexMetadata
                         :engine engine
                         :version version
                         :lang_code (i18n/site-locale-string)
                         :status :pending)
     (try
       (t2/insert! :model/SearchIndexMetadata {:engine     engine
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
  "Delete the given index if it is still pending."
  [engine version index-name]
  (t2/delete! :model/SearchIndexMetadata
              :engine engine
              :version version
              :lang_code (i18n/site-locale-string)
              :index_name (name index-name)
              :status :pending))

(defn replace-pending-on-current-connection!
  "Replace any pending metadata for this coordinate with `index-name` on the caller's current transaction."
  [conn engine version index-name]
  (let [coordinate {:engine engine, :version version, :lang_code (i18n/site-locale-string)}]
    (apply t2/delete! :conn conn :model/SearchIndexMetadata (mapcat identity (assoc coordinate :status :pending)))
    (t2/insert! :conn conn :model/SearchIndexMetadata
                (assoc coordinate :status :pending, :index_name (name index-name)))
    true))

(defn active-pending-on-current-connection!
  "Promote `expected-index-name` on the caller's current transaction and return the active index name.

  Passing the expected name prevents an old worker from promoting a replacement owner's pending table.
  When that pending row is gone the existing active name is returned unchanged, so callers compare the result with
  the name they expected to promote."
  [conn engine version expected-index-name]
  (let [coordinate {:engine engine, :version version, :lang_code (i18n/site-locale-string)}
        pending    (cond-> (assoc coordinate :status :pending)
                     expected-index-name (assoc :index_name (name expected-index-name)))]
    (when (apply t2/exists? :conn conn :model/SearchIndexMetadata (mapcat identity pending))
      (apply t2/delete! :conn conn :model/SearchIndexMetadata
             (mapcat identity (assoc coordinate :status :retired)))
      (t2/update! :conn conn :model/SearchIndexMetadata (assoc coordinate :status :active) {:status :retired})
      (t2/update! :conn conn :model/SearchIndexMetadata pending {:status :active}))
    (t2/select-one-fn :index_name :conn conn :model/SearchIndexMetadata
                      :engine engine :version version :lang_code (:lang_code coordinate) :status :active)))

(defn active-pending!
  "If there is a pending index, make it active and return the active index name."
  [engine version]
  (t2/with-transaction [conn]
    (active-pending-on-current-connection! conn engine version nil)))

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
                                  [:< :updated_at (t/minus (t/zoned-date-time) pending-table-cut-off)]]]})))

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

(defn indexes
  "The current 'pending' and 'active' indexes for the given coordinates, where they exist."
  [engine version]
  (let [pending-cut-off (t/minus (t/offset-date-time) pending-table-cut-off)]
    (->> (t2/select [:model/SearchIndexMetadata :index_name :status :created_at]
                    :engine engine
                    :version version
                    :lang_code (i18n/site-locale-string)
                    :status [:in [:active :pending]])
         (filter (fn [{:keys [status created_at]}]
                   (or (not= status :pending)
                       (t/before? pending-cut-off created_at))))
         (u/index-by :status :index_name))))

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
  "Delete the given pending index, as long as its still pending."
  [engine version index-name]
  (t2/delete! :model/SearchIndexMetadata :engine engine :version version :lang_code (i18n/site-locale-string) :index_name (name index-name)))

(defn active-pending!
  "If there is 'pending' index, make it 'active'. Return the name of the active index, regardless."
  [engine version]
  (t2/with-transaction [_conn]
    (when (t2/exists? :model/SearchIndexMetadata :engine engine :version version :lang_code (i18n/site-locale-string) :status :pending)
      (t2/delete! :model/SearchIndexMetadata :engine engine :version version :lang_code (i18n/site-locale-string) :status :retired)
      (t2/update! :model/SearchIndexMetadata {:engine engine :version version :lang_code (i18n/site-locale-string) :status :active} {:status :retired})
      (t2/update! :model/SearchIndexMetadata {:engine engine :version version :lang_code (i18n/site-locale-string) :status :pending} {:status :active}))
    (t2/select-one-fn :index_name :model/SearchIndexMetadata :engine engine :version version :lang_code (i18n/site-locale-string) :status :active)))

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
    (let [;; Versions still serving an :active index. They must never be pruned just for being crowded out of the
          ;; most-recent window: dropping a live version's metadata orphans its active table (the engine then
          ;; sweeps it), breaking in-flight reads/writes on every node still pointing at it. Without this guard,
          ;; transient/test-only versions can crowd the live version out of the window and delete it out from
          ;; under search. Such a version is only retired by the age-based clause below. (Materialized rather than
          ;; a NOT IN sub-select for portability — H2 mishandles NOT IN over an empty sub-select.)
          serving        (seq (map :version (t2/query {:select   [[[:distinct :version]]]
                                                       :from     [(t2/table-name :model/SearchIndexMetadata)]
                                                       :where    [:= :status "active"]})))
          out-of-window  (if serving
                           [:and [:not-in :version most-recent] [:not-in :version serving]]
                           [:not-in :version most-recent])]
      (t2/query-one {:delete-from [(t2/table-name :model/SearchIndexMetadata)]
                     :where       [:or
                                   out-of-window
                                   ;; Drop those older than 1 day, unless we are using them, or they are the most recent.
                                   [:and
                                    [:not-in :version (filter some? [our-version (first most-recent)])]
                                    [:< :updated_at (t/minus (t/zoned-date-time) pending-table-cut-off)]]]}))))

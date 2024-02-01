(ns metabase.api.autoarchive
  (:require
   [compojure.core :refer [DELETE GET POST PUT]]
   [honey.sql :as sql]
   [metabase.api.common :as api]
   [metabase.models.permissions :as perms]
   ;; [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private time-ago #_"6 MONTHS" "5 MINUTES")

;; TODO
;; 1. only worry about orphaned questions
;; 2. use the archive-timing

(defn- ->last-used [{:keys [last_viewed created_at] :as q}]
  (assoc q :last_used_at (or last_viewed created_at)))

(defn- ->auto-archivable [q]
  (->> q
       ->last-used
       (into {})
       ;; FIXME
       #_(select-keys [:id :name :last_used_at :model])))

;; TODO
;; - [X] audit,
;; - [X] official,
;; - [ ] used in alerts,
;; - [ ] question used by another question

(defn query
  "This query selects archiavable, orphaned cards, that have been created_at"
  [{:keys [time-ago collection-id]}]
  {:select-distinct [:card.id
                     :card.name
                     :card.created_at
                     [:vlog.timestamp :last_viewed]
                     [:vlog.model :model]]
   :from      [[:report_card :card]]
   :left-join [[:view_log :vlog] [:= :card.id :vlog.model_id]
               [:report_dashboardcard :dc] [:= :card.id :dc.card_id]
               [:collection :coll] [:= :card.collection_id :coll.id]
               [:moderation_review :mr] [:= :card.id :mr.moderated_item_id]]
   :where     [:and
               (when collection-id [:= :card.collection_id collection-id])
               [:not [:= :coll.type "instance-analytics"]]
               [:= :vlog.model "card"]
               [:not [:= :card.database_id perms/audit-db-id]]
               [:or
                [:< :vlog.timestamp {:raw (format "NOW() - INTERVAL '%s'" time-ago)}]
                [:and
                 [:= :vlog.timestamp nil]
                 [:< :card.created_at {:raw (format "NOW() - INTERVAL '%s'" time-ago)}]]]
               [:= :mr.moderated_item_type "card"]
               [:not [:= :mr.status "verified"]]]})

(defn- auto-archivable-questions [{:keys [collection-id time-ago]}]
  (->> (t2/query (query {:time-ago time-ago
                         :collection-id collection-id}))
       (mapv ->auto-archivable)))

(api/defendpoint GET "/:collection-id" [collection-id :as {query-params :query-params}]
  {collection-id [:maybe :any]
   query-params [:map [:time_ago {:optional true} :string]]}
  (let [time-ago (or (:time_ago query-params) time-ago)]
    {:archivable (auto-archivable-questions
                  {:collection-id (if collection-id collection-id parse-long)
                   :time-ago time-ago})}))

(api/define-routes)

(comment

  (t2/query (query {:time-ago time-ago :collection-id nil}))

  (sql/format (query {:time-ago "5 minutes"}))

  )

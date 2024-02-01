(ns metabase.api.autoarchive
  (:require
   [metabase.util.log :as log]
   [compojure.core :refer [DELETE GET POST PUT]]
   [honey.sql :as sql]
   [metabase.api.common :as api]
   [metabase.models.permissions :as perms]
   [metabase.util.malli.schema :as ms]
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


;; WITH latest_view_log AS (
;;   SELECT
;;     model_id,
;;     MAX(timestamp) AS max_timestamp
;;   FROM
;;     view_log
;;   WHERE
;;     model = 'card'
;;   GROUP BY
;;     model_id
;; )
;; SELECT
;;   rc.id AS model_id,
;;   vl.model AS model,
;;   vl.timestamp AS timestamp,
;;   c.id AS collection_id
;; FROM
;;   report_card rc
;;   JOIN view_log vl ON rc.id = vl.model_id
;;   JOIN latest_view_log l_vl ON vl.model_id = l_vl.model_id
;;     AND vl.timestamp = l_vl.max_timestamp
;;   LEFT JOIN collection c ON c.id = rc.collection_id;

(defn query
  "This query selects archiavable, orphaned cards, that have been created_at"
  [{:keys [time-ago collection-id]}]
  {:select    [:rc.id
               :rc.name
               :rc.created_at
               [:vl.timestamp :last_viewed]
               [:vl.model :model]]
   :from      [[:report_card :rc]]
   :left-join [[:view_log :vl] [:= :rc.id :vl.model_id]
               [:report_dashboardcard :dc] [:= :rc.id :dc.card_id]
               [:collection :coll] [:= :rc.collection_id :coll.id]]
   :where     [:and
               (when collection-id [:= :coll.id collection-id])
               [:= :dc.dashboard_id nil]
               [:= :vl.model "card"]]})

(defn- auto-archivable-questions [{:keys [collection-id time-ago] :as in}]
  (log/fatal (pr-str in))
  (def in in)
  (->> (t2/query (query {:time-ago time-ago
                         :collection-id collection-id}))
       (mapv ->auto-archivable)))

(api/defendpoint GET "/:collection-id" [collection-id :as {query-params :query-params}]
  {collection-id [:maybe ms/PositiveInt]
   query-params [:map [:time_ago {:optional true} :string]]}
  (let [time-ago (or (:time_ago query-params) time-ago)]
    {:archivable (auto-archivable-questions
                  {:collection-id collection-id
                   :time-ago time-ago})}))

(api/define-routes)

(comment

  (t2/query
   (query {:time-ago "1 MINUTE" :collection-id 4}))

  (sql/format (query in))

  )

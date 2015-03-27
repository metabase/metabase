(ns metabase.api.query
  (:require [clojure.data.csv :as csv]
            [korma.core :refer [where subselect fields order limit]]
            [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [medley.core :refer :all]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.models [common :as common]
                             [hydrate :refer :all]
                             [database :refer [Database databases-for-org]]
                             [org :refer [Org]]
                             [query :refer [Query]]
                             [query-execution :refer [QueryExecution all-fields]])
            [metabase.util :as util]))

(defannotation QueryFilterOption [symb value :nillable]
  (checkp-contains? #{:all :mine} symb (keyword value)))

(defendpoint GET "/form_input" [org]
  {org Required}
  (read-check Org org)
  {:permissions common/permissions
   :timezones   common/timezones
   :databases   (databases-for-org org)})


(defendpoint GET "/" [org f]
  {org Required, f QueryFilterOption}
  (read-check Org org)
  (-> (case (or f :all) ; default value for `f` is `:all`
        :all (sel :many Query
                  (where (or (= :creator_id *current-user-id*) (> :public_perms common/perms-none)))
               (where {:database_id [in (subselect Database (fields :id) (where {:organization_id org}))]})
               (order :name :ASC))
        :mine (sel :many Query :creator_id *current-user-id*
                (where {:database_id [in (subselect Database (fields :id) (where {:organization_id org}))]})
                (order :name :ASC)))
    (hydrate :creator :database)))


(defn query-clone
  "Create a new query by cloning an existing query.  Returns a 403 if user doesn't have acces to read query."
  [query-id]
  {:pre [(integer? query-id)]}
  (let-400 [{:keys [name] :as query} (sel :one Query :id query-id)]
    (read-check query)
    (->> (-> query
             (select-keys [:type :details :database_id])
             (assoc :name (str name " CLONED")
                    :public_perms common/perms-none
                    :creator_id *current-user-id*))
         (mapply ins Query))))


(defn query-create
  "Create a new query from user posted data."
  [{:keys [name sql timezone public_perms database]
    :or {name (str "New Query: " (java.util.Date.))
         public_perms common/perms-none}}]
  (check database [400 "'database' is a required param."]
         sql      [400 "'sql' is a required param."])
  (read-check Database database)
  (ins Query
    :type "rawsql"
    :name name
    :details {:sql sql
              :timezone timezone}
    :public_perms public_perms
    :creator_id *current-user-id*
    :database_id database))


(defendpoint POST "/" [:as {{:keys [clone] :as body} :body}]
  {clone Integer}
  (if clone
    (query-clone clone)
    (query-create body)))


(defendpoint GET "/:id" [id]
  (->404 (sel :one Query :id id)
         read-check
         (hydrate :creator :database :can_read :can_write)))


(defendpoint PUT "/:id" [id :as {{:keys [name public_perms details timezone database] :as body} :body}]
  {database     [Required Dict]
   name         NonEmptyString
   public_perms PublicPerms}
  (read-check Database (:id database))
  (let-404 [query (sel :one Query :id id)]
    (write-check query)
    (-> (util/select-non-nil-keys body :name :public_perms :details)
        (assoc :version (:version query)    ; don't increment this here. That happens on pre-update
               :database_id (:id database)) ; you can change the DB of a Query why??
        (#(mapply upd Query id %)))
    (-> (sel :one Query :id id)
        (hydrate :creator :database))))


(defendpoint DELETE "/:id" [id]
  (write-check Query id)
  (del Query :id id))


(defendpoint POST "/:id" [id]
  (let-404 [{database-id :database_id
             {:keys [sql timezone]} :details :as query} (sel :one Query :id id)]
    (read-check query)
    (let [dataset-query {:type :native
                         :database database-id
                         :native {:query sql
                                  :timezone timezone}}
          options {:executed_by *current-user-id*
                   :saved_query query
                   :synchronously false
                   :cache_result true}]
      (driver/dataset-query dataset-query options))))


(defendpoint GET "/:id/results" [id]
  (read-check Query id)
  (sel :many QueryExecution :query_id id (order :finished_at :DESC) (limit 10)))

(defendpoint GET "/:id/csv" [id]
  (let-404 [{{:keys [columns rows]} :result_data :as query-execution} (sel :one all-fields, :query_id id, (order :started_at :DESC))]
    (let-404 [{{:keys [can_read name]} :query} (hydrate query-execution :query)]
      (check-403 @can_read)
      {:status 200
       :body (with-out-str (csv/write-csv *out* (into [columns] rows)))
       :headers {"Content-Type" "text/csv"
                 "Content-Disposition" (str "attachment; filename=\"" name ".csv\"")}})))

(define-routes)

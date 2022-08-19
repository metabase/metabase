(ns metabase.api.newmetric
  (:require [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            [metabase.api.common :as api]
            [metabase.mbql.normalize :as mbql.normalize]
            [metabase.mbql.schema :as mbql.s]
            [metabase.models.card :refer [Card]]
            [metabase.models.newmetric :refer [Newmetric]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.permissions :as qp.perms]
            [metabase.query-processor.streaming :as qp.streaming]
            [metabase.util.i18n :refer [trs tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(defn- validate-dimensions!
  [dimensions]
  ;; todo: validate unique names, fields belong to underlying `card_id`, etc.
  (when (s/check [[(s/one su/NonBlankString "name") (s/one mbql.s/Field "clause")]]
                 (into []
                       (map (fn [[name form]]
                              [name (mbql.normalize/normalize-tokens form)]))
                       dimensions))
    (throw (ex-info (tru "Bad dimensions")
                    {:status-code 400
                     :dimensions dimensions}))))

(defn- validate-measure!
  [measure]
  ;; todo: validate field belongs to underlying `card_id`
  (when (s/check mbql.s/Aggregation (mbql.normalize/normalize-tokens measure))
    (throw (ex-info (tru "Bad measure")
                    {:status-code 400
                     :measure measure}))))

(api/defendpoint POST "/"
  [:as {{:keys [name display_name description card_id measure dimensions] :as body} :body}]
  {card_id      su/IntGreaterThanZero
   name         su/NonBlankString
   display_name (s/maybe s/Str)
   description  (s/maybe s/Str)}
  (validate-dimensions! dimensions)
  (validate-measure! measure)
  (db/insert! Newmetric (assoc body :creator_id api/*current-user-id*)))

;; name display_name card_id measure dimensions archived creator_id created_at updated_at

(api/defendpoint PUT "/:id"
  "Update a `Newmetric`."
  [id :as {{:keys [name display_name description card_id measure dimensions] :as metric-updates} :body}]
  {card_id      su/IntGreaterThanZero
   name         su/NonBlankString
   display_name (s/maybe s/Str)
   description  (s/maybe s/Str)}
  (validate-dimensions! dimensions)
  (validate-measure! measure)
  (db/update! Newmetric id metric-updates))

(api/defendpoint GET "/:id"
  "Get a `Newmetric`"
  [id]
  (api/read-check (Newmetric id)))

(defn- include-granularity
  [dimensions choices]
  ;; hacky
  (if-let [granularity (some-> choices :granularity keyword)]
    (walk/postwalk (fn [form]
                     (if (and (map? form) (:temporal-unit form))
                       (assoc form :temporal-unit granularity)
                       form))
                   dimensions)
    dimensions))

(defn- query-for-metric
  [card metric choices]
  (let [keyed-dimensions (into {} (:dimensions metric))
        ;; todo: assert they are all there
        dimensions (-> (or (vals (select-keys keyed-dimensions (:dimensions choices)))
                           [(-> metric :dimensions first second)])
                       (include-granularity choices))]
    (log/debug (str (trs "Using dimensions: ") (pr-str dimensions)))
    {:type :query
     :database (:database_id card)
     :query {:source-table (str "card__" (:id card))
             :breakout    dimensions
             ;; todo: filters?
             :aggregation [(:measure metric)]}}))

(api/defendpoint ^:streaming POST "/:id/query"
  "Run a query for a metric"
  [id :as {choices :body}]
  (let [metric     (api/read-check Newmetric id)
        underlying (api/read-check Card (:card_id metric))
        query      (query-for-metric underlying metric choices)
        info       (cond-> {:executed-by api/*current-user-id*
                            :context     :question
                            :card-id     (:id underlying)}
                     (:dataset underlying)
                     (assoc :metadata/dataset-metadata (:result_metadata underlying)))]
    (binding [qp.perms/*card-id* (:id underlying)]
      ;; todo: metric event (events/publish-event! :metric-read ...)
      (qp.streaming/streaming-response [context :api]
        (qp/process-query-and-save-execution! query info context)))))

(api/define-routes)

(ns metabase.api.automagic-dashboards
  (:require [buddy.core.codecs :as codecs]
            [cheshire.core :as json]
            [compojure.core :refer [GET POST]]
            [metabase.api
             [card :as card.api]
             [common :as api]]
            [metabase.automagic-dashboards
             [core :as magic]
             [comparison :as magic.comparison]
             [rules :as rules]]
            [metabase.models
             [card :refer [Card]]
             [dashboard :refer [Dashboard] :as dashboard]
             [database :refer [Database]]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [query :refer [Query]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [ring.util.codec :as codec]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(def ^:private ^{:arglists '([s])} decode-base64-json
  (comp json/decode codecs/bytes->str codec/base64-decode))

(api/defendpoint GET "/database/:id/candidates"
  "Return a list of candidates for automagic dashboards orderd by interestingness."
  [id]
  (-> (Database id)
      api/check-404
      magic/candidate-tables))

;; ----------------------------------------- API Endpoints for viewing a transient dashboard ----------------

(api/defendpoint GET "/table/:id"
  "Return an automagic dashboard for table with id `ìd`."
  [id]
  (-> id Table api/check-404 magic/automagic-dashboard))

(api/defendpoint GET "/table/:id/:prefix/:rule"
  "Return an automagic dashboard for table with id `ìd` using rule `rule`."
  [id prefix rule]
  (->> id
       Table
       api/check-404
       (magic/automagic-dashboard (rules/load-rule (str prefix "/" rule ".yaml")))))

(api/defendpoint GET "/segment/:id"
  "Return an automagic dashboard analyzing segment with id `id`."
  [id]
  (-> id Segment api/check-404 magic/automagic-dashboard))

(api/defendpoint GET "/segment/:id/:prefix/:rule"
  "Return an automagic dashboard analyzing segment with id `id`. using rule `rule`."
  [id prefix rule]
  (-> id
      Segment
      api/check-404
      (magic/automagic-dashboard (rules/load-rule (str prefix "/" rule ".yaml")))))

(api/defendpoint GET "/question/:id/cell/:cell-query"
  "Return an automagic dashboard analyzing cell in question  with id `id` defined by
   query `cell-querry`."
  [id cell-query]
  (-> (card.api/adhoc-query {:query {:filter (decode-base64-json cell-query)}})
      (magic/inject-segment (-> id Card api/check-404))
      magic/automagic-dashboard))

(api/defendpoint GET "/question/:id/cell/:cell-query/:prefix/:rule"
  "Return an automagic dashboard analyzing cell in question  with id `id` defined by
   query `cell-querry` using rule `rule`."
  [id cell-query prefix rule]
  (-> (card.api/adhoc-query {:query {:filter (decode-base64-json cell-query)}})
      (magic/inject-segment (-> id Card api/check-404))
      (magic/automagic-dashboard (rules/load-rule (str prefix "/" rule ".yaml")))))

(api/defendpoint GET "/metric/:id"
  "Return an automagic dashboard analyzing metric with id `id`."
  [id]
  (-> id Metric api/check-404 magic/automagic-analysis))

(api/defendpoint GET "/field/:id"
  "Return an automagic dashboard analyzing field with id `id`."
  [id]
  (-> id Field api/check-404 magic/automagic-analysis))

(api/defendpoint GET "/question/:id"
  "Return an automagic dashboard analyzing question with id `id`."
  [id]
  (-> id Card api/check-404 magic/automagic-analysis))

(api/defendpoint GET "/adhoc/:query"
  "Return an automagic dashboard analyzing ad hoc query."
  [query]
  (-> query
      decode-base64-json
      card.api/adhoc-query
      magic/automagic-analysis))

(def ^:private valid-comparison-pair?
  #{["segment" "segment"]
    ["segment" "table"]
    ["segment" "adhoc"]
    ["table" "segment"]
    ["table" "adhoc"]
    ["adhoc" "table"]
    ["adhoc" "segment"]
    ["adhoc" "adhoc"]})

(defmulti
  ^{:private true
    :doc "Turn `x` into segment-like."
    :arglists '([x])}
  ->segment (comp keyword :type))

(defmethod ->segment :table
  [{:keys [id]}]
  (-> id Table api/check-404))

(defmethod ->segment :segment
  [{:keys [id]}]
  (-> id Segment api/check-404))

(defmethod ->segment :adhoc
  [{:keys [query name]}]
  (-> query
      card.api/adhoc-query
      (assoc :name name)))

(api/defendpoint POST "/compare"
  "Return an automagic comparison dashboard based on given dashboard."
  [:as {{:keys [dashboard left right]} :body}]
  (api/check-404 (valid-comparison-pair? (map :type [left right])))
  (magic.comparison/comparison-dashboard (if (number? dashboard)
                                           (-> (Dashboard dashboard)
                                               api/check-404
                                               (hydrate [:ordered_cards
                                                         [:card :in_public_dashboard]
                                                         :series]))
                                           dashboard)
                                         (->segment left)
                                         (->segment right)))

(api/define-routes)

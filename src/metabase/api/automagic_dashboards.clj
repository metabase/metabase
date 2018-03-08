(ns metabase.api.automagic-dashboards
  (:require [compojure.core :refer [GET POST]]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards
             [core :as magic]
             [comparison :as magic.comparison]]
            [metabase.models
             [dashboard :refer [Dashboard] :as dashboard]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]
             [field :refer [Field]]]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(api/defendpoint GET "/database/:id/candidates"
  "Return a list of candidates for automagic dashboards orderd by interestingness."
  [id]
  (-> (Dashboard id)
      api/check-404
      magic/candidate-tables))

;; ----------------------------------------- API Endpoints for viewing a transient dashboard ----------------

(api/defendpoint GET "/table/:id"
  "Return an automagic dashboard for table with id `ìd`."
  [id]
  (magic/automagic-dashboard (Table id)))

(api/defendpoint GET "/metric/:id"
  "Return an automagic dashboard analyzing metric with id `id`."
  [id]
  (magic/automagic-analysis (Metric id)))

(api/defendpoint GET "/segment/:id"
  "Return an automagic dashboard analyzing segment with id `id`."
  [id]
  (magic/automagic-analysis (Metric id)))

(api/defendpoint GET "/field/:id"
  "Return an automagic dashboard analyzing field with id `id`."
  [id]
  (magic/automagic-analysis (Field id)))

(api/defendpoint GET "/question/:id"
  "Return an automagic dashboard analyzing question with id `id`."
  [id]
  id)

(api/defendpoint GET "/adhoc/:querystring"
  "Return an automagic dashboard analyzing ad hoc query`id`."
  [querystring]
  querystring)

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
  [_]
  {:name "entire dataset"})

(defmethod ->segment :segment
  [{:keys [id]}]
  (-> id
      Segment
      api/check-404
      (update :name (partial str "segment "))))

(defmethod ->segment :adhoc
  [{:keys [filter name]}]
  {:definition {:filter filter}
   :name       (or name "adhoc segment")})

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

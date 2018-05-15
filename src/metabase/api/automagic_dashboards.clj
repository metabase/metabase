(ns metabase.api.automagic-dashboards
  (:require [buddy.core.codecs :as codecs]
            [cheshire.core :as json]
            [compojure.core :refer [GET POST]]
            [metabase.api.common :as api]
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
             [query :refer [Query] :as query]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.util.schema :as su]
            [puppetlabs.i18n.core :refer [tru]]
            [ring.util.codec :as codec]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(def ^:private Show
  (su/with-api-error-message (s/maybe (s/enum "all"))
    (tru "invalid show value")))

(def ^:private Prefix
  (su/with-api-error-message
      (->> ["table" "metric" "field"]
           (mapcat rules/load-rules)
           (filter :indepth)
           (map :rule)
           (apply s/enum))
    (tru "invalid value for prefix")))

(def ^:private Rule
  (su/with-api-error-message
      (->> ["table" "metric" "field"]
           (mapcat rules/load-rules)
           (mapcat :indepth)
           (map :rule)
           (apply s/enum))
    (tru "invalid value for rule name")))

(def ^:private ^{:arglists '([s])} decode-base64-json
  (comp #(json/decode % keyword) codecs/bytes->str codec/base64-decode))

(def ^:private Base64EncodedJSON
  (su/with-api-error-message
      (s/pred decode-base64-json "valid base64 encoded json")
    (tru "value couldn''t be parsed as base64 encoded JSON")))

(defn- load-rule
  [entity prefix rule]
  (rules/load-rule (format "%s/%s/%s.yaml" entity prefix rule)))

(api/defendpoint GET "/database/:id/candidates"
  "Return a list of candidates for automagic dashboards orderd by interestingness."
  [id]
  (-> (Database id)
      api/check-404
      magic/candidate-tables))


;; ----------------------------------------- API Endpoints for viewing a transient dashboard ----------------

(api/defendpoint GET "/table/:id"
  "Return an automagic dashboard for table with id `ìd`."
  [id show]
  {show Show}
  (-> id Table api/check-404 (magic/automagic-analysis {:show (keyword show)})))

(api/defendpoint GET "/table/:id/rule/:prefix/:rule"
  "Return an automagic dashboard for table with id `ìd` using rule `rule`."
  [id prefix rule show]
  {show   Show
   prefix Prefix
   rule   Rule}
  (-> id
      Table
      api/check-404
      (magic/automagic-analysis
       {:rule (load-rule "table" prefix rule)
        :show (keyword show)})))

(api/defendpoint GET "/segment/:id"
  "Return an automagic dashboard analyzing segment with id `id`."
  [id show]
  {show Show}
  (-> id Segment api/check-404 (magic/automagic-analysis {:show (keyword show)})))

(api/defendpoint GET "/segment/:id/rule/:prefix/:rule"
  "Return an automagic dashboard analyzing segment with id `id`. using rule `rule`."
  [id prefix rule show]
  {show   Show
   prefix Prefix
   rule   Rule}
  (-> id
      Segment
      api/check-404
      (magic/automagic-analysis
       {:rule (load-rule "table" prefix rule)
        :show (keyword show)})))

(api/defendpoint GET "/question/:id/cell/:cell-query"
  "Return an automagic dashboard analyzing cell in question  with id `id` defined by
   query `cell-querry`."
  [id cell-query show]
  {show       Show
   cell-query Base64EncodedJSON}
  (-> id
      Card
      api/check-404
      (magic/automagic-analysis {:show       (keyword show)
                                 :cell-query (decode-base64-json cell-query)})))

(api/defendpoint GET "/question/:id/cell/:cell-query/rule/:prefix/:rule"
  "Return an automagic dashboard analyzing cell in question  with id `id` defined by
   query `cell-querry` using rule `rule`."
  [id cell-query prefix rule show]
  {show       Show
   prefix     Prefix
   rule       Rule
   cell-query Base64EncodedJSON}
  (-> id
      Card
      api/check-404
      (magic/automagic-analysis {:show       (keyword show)
                                 :rule       (load-rule "table" prefix rule)
                                 :cell-query (decode-base64-json cell-query)})))

(api/defendpoint GET "/metric/:id"
  "Return an automagic dashboard analyzing metric with id `id`."
  [id show]
  {show Show}
  (-> id Metric api/check-404 (magic/automagic-analysis {:show (keyword show)})))

(api/defendpoint GET "/field/:id"
  "Return an automagic dashboard analyzing field with id `id`."
  [id show]
  {show Show}
  (-> id Field api/check-404 (magic/automagic-analysis {:show (keyword show)})))

(api/defendpoint GET "/question/:id"
  "Return an automagic dashboard analyzing question with id `id`."
  [id show]
  {show Show}
  (-> id Card api/check-404 (magic/automagic-analysis {:show (keyword show)})))

(api/defendpoint GET "/question/:id/rule/:prefix/:rule"
  "Return an automagic dashboard analyzing question with id `id` using rule `rule`."
  [id prefix rule show]
  {show Show
   prefix Prefix
   rule   Rule}
  (-> id Card api/check-404 (magic/automagic-analysis {:show (keyword show)
                                                       :rule (load-rule "table" prefix rule)})))

(api/defendpoint GET "/adhoc/:query"
  "Return an automagic dashboard analyzing ad hoc query."
  [query show]
  {show  Show
   query Base64EncodedJSON}
  (-> query
      decode-base64-json
      query/adhoc-query
      (magic/automagic-analysis {:show (keyword show)})))

(api/defendpoint GET "/adhoc/:query/rule/:prefix/:rule"
  "Return an automagic dashboard analyzing ad hoc query."
  [query prefix rule show]
  {show   Show
   query  Base64EncodedJSON
   prefix Prefix
   rule   Rule}
  (-> query
      decode-base64-json
      query/adhoc-query
      (magic/automagic-analysis {:show (keyword show)
                                 :rule (load-rule "table" prefix rule)})))

(api/defendpoint GET "/adhoc/:query/cell/:cell-query"
  "Return an automagic dashboard analyzing ad hoc query."
  [query cell-query show]
  {show       Show
   query      Base64EncodedJSON
   cell-query Base64EncodedJSON}
  (let [query      (decode-base64-json query)
        cell-query (decode-base64-json cell-query)]
    (-> query
        query/adhoc-query
        (magic/automagic-analysis {:show       (keyword show)
                                   :cell-query cell-query}))))

(api/defendpoint GET "/adhoc/:query/cell/:cell-query/rule/:prefix/:rule"
  "Return an automagic dashboard analyzing cell in question  with id `id` defined by
   query `cell-querry` using rule `rule`."
  [query cell-query prefix rule show]
  {show       Show
   prefix     Prefix
   rule       Rule
   query      Base64EncodedJSON
   cell-query Base64EncodedJSON}
  (let [query      (decode-base64-json query)
        cell-query (decode-base64-json cell-query)]
    (-> query
        query/adhoc-query
        (magic/automagic-analysis {:show       (keyword show)
                                   :cell-query cell-query
                                   :rule       (load-rule "table" prefix rule)}))))

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
      query/adhoc-query
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

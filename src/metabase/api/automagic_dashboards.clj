(ns metabase.api.automagic-dashboards
  (:require [buddy.core.codecs :as codecs]
            [cheshire.core :as json]
            [compojure.core :refer [GET POST]]
            [metabase.api.common :as api]
            [metabase.automagic-dashboards
             [comparison :refer [comparison-dashboard]]
             [core :refer [candidate-tables automagic-analysis]]
             [rules :as rules]]
            [metabase.models
             [card :refer [Card]]
             [database :refer [Database]]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [permissions :as perms]
             [query :as query]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.models.query.permissions :as query-perms]
            [metabase.util.schema :as su]
            [puppetlabs.i18n.core :refer [tru]]
            [ring.util.codec :as codec]
            [schema.core :as s]))

(def ^:private Show
  (su/with-api-error-message (s/maybe (s/enum "all"))
    (tru "invalid show value")))

(def ^:private Prefix
  (su/with-api-error-message
      (s/pred (fn [prefix]
                (some #(not-empty (rules/get-rules [% prefix])) ["table" "metric" "field"])))
    (tru "invalid value for prefix")))

(def ^:private Rule
  (su/with-api-error-message
      (s/pred (fn [rule]
                (some (fn [toplevel]
                        (some (comp rules/get-rule
                                    (fn [prefix]
                                      [toplevel prefix rule])
                                    :rule)
                              (rules/get-rules [toplevel])))
                      ["table" "metric" "field"])))
    (tru "invalid value for rule name")))

(def ^:private ^{:arglists '([s])} decode-base64-json
  (comp #(json/decode % keyword) codecs/bytes->str codec/base64-decode))

(def ^:private Base64EncodedJSON
  (su/with-api-error-message
      (s/pred decode-base64-json)
    (tru "value couldn''t be parsed as base64 encoded JSON")))

(api/defendpoint GET "/database/:id/candidates"
  "Return a list of candidates for automagic dashboards orderd by interestingness."
  [id]
  (-> (Database id)
      api/read-check
      candidate-tables))

;; ----------------------------------------- API Endpoints for viewing a transient dashboard ----------------

(defn- adhoc-query-read-check
  [query]
  (api/check-403 (perms/set-has-full-permissions-for-set?
                   @api/*current-user-permissions-set*
                   (query-perms/perms-set (:dataset_query query) :throw-exceptions)))
  query)

(defn- ensure-int
  [x]
  (if (string? x)
    (Integer/parseInt x)
    x))

(def ^:private ->entity
  {"table"    (comp api/read-check Table ensure-int)
   "segment"  (comp api/read-check Segment ensure-int)
   "question" (comp api/read-check Card ensure-int)
   "adhoc"    (comp adhoc-query-read-check query/adhoc-query decode-base64-json)
   "metric"   (comp api/read-check Metric ensure-int)
   "field"    (comp api/read-check Field ensure-int)})

(def ^:private Entity
  (su/with-api-error-message
      (apply s/enum (keys ->entity))
    (tru "Invalid entity type")))

(def ^:private ComparisonEntity
  (su/with-api-error-message
      (s/enum "segment" "adhoc" "table")
    (tru "Invalid comparison entity type. Can only be one of \"table\", \"segment\", or \"adhoc\"")))

(api/defendpoint GET "/:entity/:entity-id-or-query"
  "Return an automagic dashboard for entity `entity` with id `ìd`."
  [entity entity-id-or-query show]
  {show   Show
   entity Entity}
  (-> entity-id-or-query ((->entity entity)) (automagic-analysis {:show (keyword show)})))

(api/defendpoint GET "/:entity/:entity-id-or-query/rule/:prefix/:rule"
  "Return an automagic dashboard for entity `entity` with id `ìd` using rule `rule`."
  [entity entity-id-or-query prefix rule show]
  {entity Entity
   show   Show
   prefix Prefix
   rule   Rule}
  (-> entity-id-or-query ((->entity entity)) (automagic-analysis {:show (keyword show)
                                                                  :rule ["table" prefix rule]})))

(api/defendpoint GET "/:entity/:entity-id-or-query/cell/:cell-query"
  "Return an automagic dashboard analyzing cell in  automagic dashboard for entity `entity`
   defined by
   query `cell-querry`."
  [entity entity-id-or-query cell-query show]
  {entity     Entity
   show       Show
   cell-query Base64EncodedJSON}
  (-> entity-id-or-query
      ((->entity entity))
      (automagic-analysis {:show       (keyword show)
                           :cell-query (decode-base64-json cell-query)})))

(api/defendpoint GET "/:entity/:entity-id-or-query/cell/:cell-query/rule/:prefix/:rule"
  "Return an automagic dashboard analyzing cell in question  with id `id` defined by
   query `cell-querry` using rule `rule`."
  [entity entity-id-or-query cell-query prefix rule show]
  {entity     Entity
   show       Show
   prefix     Prefix
   rule       Rule
   cell-query Base64EncodedJSON}
  (-> entity-id-or-query
      ((->entity entity))
      (automagic-analysis {:show       (keyword show)
                           :rule       ["table" prefix rule]
                           :cell-query (decode-base64-json cell-query)})))

(api/defendpoint GET "/:entity/:entity-id-or-query/compare/:comparison-entity/:comparison-entity-id-or-query"
  "Return an automagic comparison dashboard for entity `entity` with id `ìd` compared with entity
   `comparison-entity` with id `comparison-entity-id-or-query.`"
  [entity entity-id-or-query show comparison-entity comparison-entity-id-or-query]
  {show              Show
   entity            Entity
   comparison-entity ComparisonEntity}
  (let [left      ((->entity entity) entity-id-or-query)
        right     ((->entity comparison-entity) comparison-entity-id-or-query)
        dashboard (automagic-analysis left {:show         (keyword show)
                                            :query-filter nil
                                            :comparison?  true})]
    (comparison-dashboard dashboard left right {})))

(api/defendpoint GET "/:entity/:entity-id-or-query/rule/:prefix/:rule/compare/:comparison-entity/:comparison-entity-id-or-query"
  "Return an automagic comparison dashboard for entity `entity` with id `ìd` using rule `rule`;
   compared with entity `comparison-entity` with id `comparison-entity-id-or-query.`."
  [entity entity-id-or-query prefix rule show comparison-entity comparison-entity-id-or-query]
  {entity            Entity
   show              Show
   prefix            Prefix
   rule              Rule
   comparison-entity ComparisonEntity}
  (let [left      ((->entity entity) entity-id-or-query)
        right     ((->entity comparison-entity) comparison-entity-id-or-query)
        dashboard (automagic-analysis left {:show         (keyword show)
                                            :rule         ["table" prefix rule]
                                            :query-filter nil
                                            :comparison?  true})]
    (comparison-dashboard dashboard left right {})))

(api/defendpoint GET "/:entity/:entity-id-or-query/cell/:cell-query/compare/:comparison-entity/:comparison-entity-id-or-query"
  "Return an automagic comparison dashboard for cell in automagic dashboard for entity `entity`
   with id `ìd` defined by query `cell-querry`; compared with entity `comparison-entity` with id
   `comparison-entity-id-or-query.`."
  [entity entity-id-or-query cell-query show comparison-entity comparison-entity-id-or-query]
  {entity            Entity
   show              Show
   cell-query        Base64EncodedJSON
   comparison-entity ComparisonEntity}
  (let [left      ((->entity entity) entity-id-or-query)
        right     ((->entity comparison-entity) comparison-entity-id-or-query)
        dashboard (automagic-analysis left {:show         (keyword show)
                                            :query-filter nil
                                            :comparison?  true})]
    (comparison-dashboard dashboard left right {:left {:cell-query (decode-base64-json cell-query)}})))

(api/defendpoint GET "/:entity/:entity-id-or-query/cell/:cell-query/rule/:prefix/:rule/compare/:comparison-entity/:comparison-entity-id-or-query"
  "Return an automagic comparison dashboard for cell in automagic dashboard for entity `entity`
   with id `ìd` defined by query `cell-querry` using rule `rule`; compared with entity
   `comparison-entity` with id `comparison-entity-id-or-query.`."
  [entity entity-id-or-query cell-query prefix rule show comparison-entity comparison-entity-id-or-query]
  {entity            Entity
   show              Show
   prefix            Prefix
   rule              Rule
   cell-query        Base64EncodedJSON
   comparison-entity ComparisonEntity}
  (let [left      ((->entity entity) entity-id-or-query)
        right     ((->entity comparison-entity) comparison-entity-id-or-query)
        dashboard (automagic-analysis left {:show         (keyword show)
                                            :rule         ["table" prefix rule]
                                            :query-filter nil})]
    (comparison-dashboard dashboard left right {:left {:cell-query (decode-base64-json cell-query)}})))

(api/define-routes)

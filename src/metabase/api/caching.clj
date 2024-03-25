(ns metabase.api.caching
  (:require
   [clojure.walk :as walk]
   [compojure.core :refer [GET]]
   [metabase.api.common :as api]
   [metabase.api.common.validation :as validation]
   [metabase.db.query :as mdb.query]
   [metabase.events :as events]
   [metabase.public-settings.premium-features :as premium-features :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;; Data shape

(defn row->config
  "Transform from how cache config is stored to how it's used/exposed in the API"
  [row]
  {:model    (:model row)
   :model_id (:model_id row)
   :strategy (assoc (:config row) :type (:strategy row))})

(defn config->row
  "Transform cache config from API form into db storage from"
  [{:keys [model model_id strategy]}]
  {:model    model
   :model_id model_id
   :strategy (:type strategy)
   :config   (dissoc strategy :type)})

(defn- drop-internal-fields
  "See `metabase-enterprise.caching.strategies/CacheStrategy`"
  [schema]
  (walk/prewalk
   (fn [x]
     (if (and (vector? x) (= (first x) :map))
       (into [] (remove #(:internal (meta %))) x)
       x))
   schema))

;; TODO: figure out how to combine `defenterprise` and `defendpoint` - right now OpenAPI only "sees" OSS version of
;; the schema, so docs for enterprise version won't be correct until we figure out the way to support this
(defenterprise CacheStrategy
  "Schema for a caching strategy"
  metabase-enterprise.caching.strategies
  []
  [:and
   [:map
    [:type [:enum :nocache :ttl]]]
   [:multi {:dispatch :type}
    [:nocache  [:map ;; not closed due to a way it's used in tests for clarity
                [:type keyword?]]]
    [:ttl      [:map {:closed true}
                [:type [:= :ttl]]
                [:multiplier ms/PositiveInt]
                [:min_duration_ms ms/IntGreaterThanOrEqualToZero]]]]])

(defn CacheStrategyAPI
  "Schema for a caching strategy for the API"
  []
  (drop-internal-fields (CacheStrategy)))

(def ^:private CachingModel [:enum "root" "database" "dashboard" "question"])

(defn- assert-valid-models [model ids premium?]
  (cond
    (= model "root")
    (when-not (some zero? ids)
      (throw (ex-info (tru "Root configuration is only valid with model_id = 0") {:status-code 404
                                                                                  :model_id    (first ids)})))

    (not premium?)
    (throw (premium-features/ee-feature-error (tru "Granular Caching")))

    :else
    (api/check-404 (t2/select-one (case model
                                    "database"  :model/Database
                                    "dashboard" :model/Dashboard
                                    "question"  :model/Card)
                                  :id [:in ids]))))

(defn- audit-caching-change! [id prev new]
  (events/publish-event!
   :event/caching-update
   {:user-id  api/*current-user-id*
    :model    :model/CacheConfig
    :model-id id
    :details  {:model     (or (:model prev) (:model new))
               :model-id  (or (:model_id prev) (:model_id new))
               :old-value (dissoc prev :model :model_id)
               :new-value (dissoc new :model :model_id)}}))

(api/defendpoint GET "/"
  "Return cache configuration."
  [:as {{:strs [model collection]
         :or   {model "root"}}
        :query-params}]
  {model      (ms/QueryVectorOf CachingModel)
   ;; note that `nil` in `collection` means all configurations not scoped to any particular collection
   collection [:maybe ms/PositiveInt]}
  (validation/check-has-application-permission :setting)
  (let [items (if (premium-features/enable-cache-granular-controls?)
                (t2/select :model/CacheConfig
                           :model [:in model]
                           {:left-join [:report_card      [:and
                                                           [:= :model [:inline "question"]]
                                                           [:= :model_id :report_card.id]
                                                           [:= :report_card.collection_id collection]]
                                        :report_dashboard [:and
                                                           [:= :model [:inline "dashboard"]]
                                                           [:= :model_id :report_dashboard.id]
                                                           [:= :report_dashboard.collection_id collection]]]
                            :where     [:case
                                        [:= :model [:inline "question"]]  [:!= :report_card.id nil]
                                        [:= :model [:inline "dashboard"]] [:!= :report_dashboard.id nil]
                                        :else                             true]})
                (t2/select :model/CacheConfig :model "root"))]
    {:data (mapv row->config items)}))

(api/defendpoint PUT "/"
  "Store cache configuration."
  [:as {{:keys [model model_id strategy] :as config} :body}]
  {model    CachingModel
   model_id ms/IntGreaterThanOrEqualToZero
   strategy (CacheStrategyAPI)}
  (validation/check-has-application-permission :setting)
  (assert-valid-models model [model_id] (premium-features/enable-cache-granular-controls?))
  (t2/with-transaction [_tx]
    (let [data    (config->row config)
          current (t2/select-one :model/CacheConfig :model model :model_id model_id {:for :update})]
      {:id (u/prog1 (mdb.query/update-or-insert! :model/CacheConfig {:model model :model_id model_id}
                                                 (constantly data))
             (audit-caching-change! <> current data))})))

(api/defendpoint DELETE "/"
  "Delete cache configuration."
  [:as {{:keys [model model_id]} :body}]
  {model    CachingModel
   model_id (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)}
  (validation/check-has-application-permission :setting)
  (assert-valid-models model model_id (premium-features/enable-cache-granular-controls?))
  (when-let [current (seq (t2/select :model/CacheConfig :model model :model_id [:in model_id]))]
    (t2/delete! :model/CacheConfig :model model :model_id [:in model_id])
    (doseq [item current]
      (audit-caching-change! (:id item)
                             (select-keys item [:strategy :config :model :model_id])
                             nil)))
  nil)

(api/define-routes)

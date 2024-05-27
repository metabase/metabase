(ns metabase-enterprise.serialization.upsert
  "Upsert-or-skip functionality for our models."
  (:require
   [cheshire.core :as json]
   [clojure.data :as data]
   [medley.core :as m]
   [metabase-enterprise.serialization.names :refer [name-for-logging]]
   [metabase.models.card :refer [Card]]
   [metabase.models.collection :refer [Collection]]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.dashboard-card :refer [DashboardCard]]
   [metabase.models.dashboard-card-series :refer [DashboardCardSeries]]
   [metabase.models.database :as database :refer [Database]]
   [metabase.models.dimension :refer [Dimension]]
   [metabase.models.field :refer [Field]]
   [metabase.models.field-values :refer [FieldValues]]
   [metabase.models.legacy-metric :refer [LegacyMetric]]
   [metabase.models.native-query-snippet :refer [NativeQuerySnippet]]
   [metabase.models.pulse :refer [Pulse]]
   [metabase.models.pulse-card :refer [PulseCard]]
   [metabase.models.pulse-channel :refer [PulseChannel]]
   [metabase.models.segment :refer [Segment]]
   [metabase.models.setting :as setting :refer [Setting]]
   [metabase.models.table :refer [Table]]
   [metabase.models.user :refer [User]]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [trs]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.tools.after :as t2.after]))

(def ^:private identity-condition
  {Database            [:name :engine]
   Table               [:schema :name :db_id]
   Field               [:name :table_id]
   LegacyMetric              [:name :table_id]
   Segment             [:name :table_id]
   Collection          [:name :location :namespace]
   Dashboard           [:name :collection_id]
   DashboardCard       [:card_id :dashboard_id :visualization_settings]
   DashboardCardSeries [:dashboardcard_id :card_id]
   FieldValues         [:field_id]
   Dimension           [:field_id :human_readable_field_id]
   Setting             [:key]
   Pulse               [:name :collection_id]
   PulseCard           [:pulse_id :card_id]
   PulseChannel        [:pulse_id :channel_type :details]
   Card                [:name :collection_id]
   User                [:email]
   NativeQuerySnippet  [:name :collection_id]})

;; This could potentially be unrolled into one giant select
(defn- select-identical
  [model entity]
  (->> (or (identity-condition model)
           (throw (ex-info (trs "Model {0} does not support upsert" model) {:model model})))
       (select-keys entity)
       (m/map-vals (fn [v]
                     (if (coll? v)
                       (json/encode v)
                       v)))
       (m/mapply t2/select-one model)))

(defn- has-post-insert?
  [model]
  (not (methodical/is-default-primary-method? t2.after/each-row-fn [:toucan.query-type/insert.* model])))

(defmacro with-error-handling
  "Execute body and catch and log any exceptions doing so throws."
  [message & body]
  `(try
     (do ~@body)
     (catch Throwable e#
       (log/error e# (u/format-color 'red "%s: %s" ~message (.getMessage e#)))
       nil)))

(defn- insert-many-individually!
  [model on-error entities]
  (for [entity entities]
    (when-let [entity-id (if (= :abort on-error)
                           (first (t2/insert-returning-pks! model entity))
                           (with-error-handling
                             (trs "Error inserting {0}" (name-for-logging model entity))
                             (first (t2/insert-returning-pks! model entity))))]
      entity-id)))

(defn- maybe-insert-many!
  [model on-error entities]
  (if (has-post-insert? model)
    (insert-many-individually! model on-error entities)
    (if (= :abort on-error)
      (t2/insert-returning-pks! model entities)
      (try
        (t2/insert-returning-pks! model entities)
        ;; Retry each individually so we can do as much as we can
        (catch Throwable _
          (insert-many-individually! model on-error entities))))))

(defn- group-by-action
  "Return `entities` grouped by the action that needs to be done given the `context`."
  [{:keys [mode]} model entities]
  (let [same? (comp nil? second data/diff)]
    (->> entities
         (map-indexed (fn [position entity]
                        [position
                         entity
                         (select-identical model entity)]))
         (group-by (fn [[_ entity existing]]
                     (case mode
                       :update (cond
                                 (same? existing entity) :skip
                                 existing                :update
                                 :else                   :insert)
                       :skip   (if existing
                                 :skip
                                 :insert)))))))

(defn maybe-upsert-many!
  "Batch upsert many entities.

  Within the `context` map, the following keys are recognized:
  `mode` indicates mode of operation for existing entities (`:upsert` or `:skip`), as per the `identity-condition`
  `on-error` indicates what to do in case of upsert error (`:continue` or `:abort`)
  `pre-insert-fn` (optional) is a function to call on each entity to be inserted, before it is inserted
  `post-insert-fn` (optional) is a function to call on each entity to be inserted, after it is inserted"
  [{:keys [mode on-error pre-insert-fn post-insert-fn]
    :or   {pre-insert-fn  identity
           post-insert-fn identity}
    :as context}
   model
   entities]
  (let [{:keys [update insert skip]} (group-by-action context model entities)]
    (doseq [[_ entity _] insert]
      (log/infof "Inserting %s" (name-for-logging (name model) entity)))
    (doseq [[_ _ existing] skip]
      (if (= mode :skip)
        (log/infof "%s already exists -- skipping" (name-for-logging (name model) existing))
        (log/infof "Skipping %s (nothing to update)" (name-for-logging (name model) existing))))
    (doseq [[_ _ existing] update]
      (log/infof "Updating %s" (name-for-logging (name model) existing)))
    (->> (concat (for [[position _ existing] skip]
                   [(u/the-id existing) position])
                 (map vector (map post-insert-fn
                                  (maybe-insert-many! model on-error (map (comp pre-insert-fn second) insert)))
                      (map first insert))
                 (for [[position entity existing] update]
                   (let [id (u/the-id existing)]
                     (if (= on-error :abort)
                       (t2/update! model id entity)
                       (with-error-handling
                         (trs "Error updating {0}" (name-for-logging (name model) entity))
                         (t2/update! model id entity)))
                     [id position])))
         (sort-by second)
         (map first))))

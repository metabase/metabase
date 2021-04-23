(ns metabase-enterprise.serialization.upsert
  "Upsert-or-skip functionality for our models."
  (:require [cheshire.core :as json]
            [clojure.data :as diff]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase-enterprise.serialization.names :refer [name-for-logging]]
            [metabase.models.card :refer [Card]]
            [metabase.models.collection :refer [Collection]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.dashboard-card :refer [DashboardCard]]
            [metabase.models.dashboard-card-series :refer [DashboardCardSeries]]
            [metabase.models.database :as database :refer [Database]]
            [metabase.models.dependency :refer [Dependency]]
            [metabase.models.dimension :refer [Dimension]]
            [metabase.models.field :refer [Field]]
            [metabase.models.field-values :refer [FieldValues]]
            [metabase.models.metric :refer [Metric]]
            [metabase.models.pulse :refer [Pulse]]
            [metabase.models.pulse-card :refer [PulseCard]]
            [metabase.models.pulse-channel :refer [PulseChannel]]
            [metabase.models.segment :refer [Segment]]
            [metabase.models.setting :as setting :refer [Setting]]
            [metabase.models.table :refer [Table]]
            [metabase.models.user :refer [User]]
            [metabase.util :as u]
            [metabase.util.i18n :as i18n :refer [trs]]
            [toucan.db :as db]
            [toucan.models :as models]))

(def ^:private identity-condition
  {Database            [:name]
   Table               [:schema :name :db_id]
   Field               [:name :table_id]
   Metric              [:name :table_id]
   Segment             [:name :table_id]
   Collection          [:name :location]
   Dashboard           [:name :collection_id]
   DashboardCard       [:card_id :dashboard_id :visualization_settings]
   DashboardCardSeries [:dashboardcard_id :card_id]
   FieldValues         [:field_id]
   Dimension           [:field_id :human_readable_field_id]
   Dependency          [:model_id :model :dependent_on_model :dependent_on_id]
   Setting             [:key]
   Pulse               [:name :collection_id]
   PulseCard           [:pulse_id :card_id]
   PulseChannel        [:pulse_id :channel_type :details]
   Card                [:name :collection_id]
   User                [:email]})

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
       (m/mapply db/select-one model)))

(defn- has-post-insert?
  [model]
  (not= (find-protocol-method models/IModel :post-insert model) identity))

(defmacro with-error-handling
  "Execute body and catch and log any exceptions doing so throws."
  [message & body]
  `(try
     (do ~@body)
     (catch Throwable e#
       (log/error (u/format-color 'red "%s: %s" ~message (.getMessage e#)))
       nil)))

(defn- insert-many-individually!
  [model on-error entities]
  (for [entity entities]
    (when-let [entity (if (= :abort on-error)
                        (db/insert! model entity)
                        (with-error-handling
                          (trs "Error inserting {0}" (name-for-logging model entity))
                          (db/insert! model entity)))]
      (u/the-id entity))))

(defn- maybe-insert-many!
  [model on-error entities]
  (if (has-post-insert? model)
    (insert-many-individually! model on-error entities)
    (if (= :abort on-error)
      (db/insert-many! model entities)
      (try
        (db/insert-many! model entities)
        ;; Retry each individually so we can do as much as we can
        (catch Throwable _
          (insert-many-individually! model on-error entities))))))

(defn- group-by-action
  "Return `entities` grouped by the action that needs to be done given the `context`."
  [{:keys [mode on-error]} model entities]
  (let [same?                        (comp nil? second diff/diff)]
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
  "Batch upsert-or-skip"
  [{:keys [mode on-error] :as context} model entities]
  (let [{:keys [update insert skip]} (group-by-action context model entities)]
    (doseq [[_ entity _] insert]
      (log/info (trs "Inserting {0}" (name-for-logging (name model) entity))))
    (doseq [[_ _ existing] skip]
      (if (= mode :skip)
        (log/info (trs "{0} already exists -- skipping"  (name-for-logging (name model) existing)))
        (log/info (trs "Skipping {0} (nothing to update)" (name-for-logging (name model) existing)))))
    (doseq [[_ _ existing] update]
      (log/info (trs "Updating {0}" (name-for-logging (name model) existing))))

    (->> (concat (for [[position _ existing] skip]
                   [(u/the-id existing) position])
                 (map vector (maybe-insert-many! model on-error (map second insert))
                      (map first insert))
                 (for [[position entity existing] update]
                   (let [id (u/the-id existing)]
                     (if (= on-error :abort)
                       (db/update! model id entity)
                       (with-error-handling
                         (trs "Error updating {0}" (name-for-logging (name model) entity))
                         (db/update! model id entity)))
                     [id position])))
         (sort-by second)
         (map first))))

(defn maybe-fixup-card-template-ids!
  "Upserts `entities` that are in `selected-ids`. Cards with template-tags that refer to other cards need a second pass
  of fixing the card-ids. To not overwrite cards that were skipped in previous step, classify entities and validate
  against the ones that were just modified."
  [context model entities selected-ids]
  (let [{:keys [update _ _]} (group-by-action context model entities)
        id-set (set selected-ids)
        final-ents (filter #(id-set (:id (nth % 2))) update)]
    (maybe-upsert-many! context model
                        (map second final-ents))))

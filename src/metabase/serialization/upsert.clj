(ns metabase.serialization.upsert
  "Upsert-or-skip functionality for our models."
  (:require [cheshire.core :as json]
            [clojure.data :as diff]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [dashboard-card-series :refer [DashboardCardSeries]]
             [database :refer [Database] :as database]
             [dependency :refer [Dependency]]
             [dimension :refer [Dimension]]
             [field :refer [Field]]
             [field-values :refer [FieldValues]]
             [metric :refer [Metric]]
             [pulse :refer [Pulse]]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :refer [PulseChannel]]
             [segment :refer [Segment]]
             [setting :refer [Setting] :as setting]
             [table :refer [Table]]
             [user :refer [User]]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs] :as i18n]
            [toucan.db :as db]))

(def ^:private identity-condition
  {Database            [:name]
   Table               [:schema :name :db_id]
   Field               [:name :table_id]
   Metric              [:name :table_id]
   Segment             [:name :table_id]
   Collection          [:name :location]
   Dashboard           [:name :collection_id]
   DashboardCard       [:card_id :dashboard_id :visualiation_settings]
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
           (throw (i18n/ex-info (trs "Model {0} does not support upsert" model) {:model model})))
       (select-keys entity)
       (m/map-vals (fn [v]
                     (if (coll? v)
                       (json/encode v)
                       v)))
       (m/mapply db/select-one model)))

(defn- name-for-logging
  [{:keys [name id]}]
  (if name
    (format "\"%s\" (ID %s)" name id)
    (str "ID " id)))

(defn maybe-upsert-many!
  "Batch upsert-or-skip"
  [mode model entities]
  (let [same?                        (comp nil? second diff/diff)
        {:keys [update insert skip]} (->> entities
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
                                                                  :insert)))))]

    (doseq [[_ entity _] insert]
      (log/info (trs "Inserting {0} {1}" (:name model) (name-for-logging entity))))
    (doseq [[_ _ existing] skip]
      (if (= mode :skip)
        (log/info (trs "{0} {1} already exists -- skipping"
                       (:name model) (name-for-logging existing)))
        (log/info (trs "Skipping {0} {1} (nothing to update)"
                       (:name model) (name-for-logging existing)))))
    (doseq [[_ _ existing] update]
      (log/info (trs "Updating {0} {1}" (:name model) (name-for-logging existing))))

    (->> (concat (for [[position _ existing] skip]
                   [(u/get-id existing) position])
                 (map vector (db/insert-many! model (map second insert)) (map first insert))
                 (for [[position entity existing] update]
                   (let [id (u/get-id existing)]
                     (db/update! model id entity)
                     [id position])))
         (sort-by second)
         (map first))))

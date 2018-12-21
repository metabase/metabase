(ns metabase.serialization.load
  "Load entities serialized by `metabase.serialization.dump`."
  (:require [cheshire.core :as json]
            [clojure.data :as diff]
            [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [clojure.string :as str]
            [clojure.walk :as walk]
            [medley.core :as m]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [dashboard-card-series :refer [DashboardCardSeries]]
             [database :refer [Database]]
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
            [metabase.query-processor.util :as qp.util]
            [metabase.serialization.dump :as dump]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db]
            [yaml.core :as yaml])
  (:refer-clojure :exclude [load]))

(defn- slurp-dir
  [path]
  (doall
   (for [^java.io.File file (.listFiles ^java.io.File (io/file path))
         :when (-> file (.getName) (str/ends-with? ".yaml"))]
     (yaml/from-file file true))))

(defn- slurp-many
  [paths]
  (apply concat (map slurp-dir paths)))

(defn- list-dirs
  [path]
  (for [^java.io.File file (.listFiles ^java.io.File (io/file path))
        :when (.isDirectory file)]
    (.getPath file)))

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
   Card                [:name :collection_id]})

;; This could potentially be unrolled into one giant select
(defn- select-identical
  [model entity]
  (->> model
       identity-condition
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

(defn- maybe-upsert-many!
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

(defmulti
  ^{:doc      "Extract entities from a logical path."
    :private  true
    :arglists '([context model entity-name])}
  path->context* (fn [_ model _]
                   model))

(def ^:private ^{:arglists '([context model entity-name])} path->context
  (memoize path->context*))

(defmethod path->context* "databases"
  [context _ db-name]
  (assoc context :database (if (= db-name "__virtual")
                             -1337
                             (db/select-one-id Database :name db-name))))

(defmethod path->context* "schemas"
  [context _ schema]
  (assoc context :schema schema))

(defmethod path->context* "tables"
  [context _ table-name]
  (assoc context :table (db/select-one-id Table
                          :db_id  (:database context)
                          :schema (:schema context)
                          :name   table-name)))

(defmethod path->context* "fields"
  [context _ field-name]
  (assoc context :field (db/select-one-id Field
                          :table_id (:table context)
                          :name     field-name)))

(defmethod path->context* "metrics"
  [context _ metric-name]
  (assoc context :metric (db/select-one-id Metric
                           :table_id (:table context)
                           :name     metric-name)))

(defmethod path->context* "segments"
  [context _ segment-name]
  (assoc context :segment (db/select-one-id Segment
                            :table_id (:table context)
                            :name     segment-name)))

(defmethod path->context* "collections"
  [context _ [collection-name & path-rest :as path]]
  (if (= collection-name "root")
    (assoc context :collection nil)
    (assoc context :collection (db/select-one-id Collection
                                 :name     collection-name
                                 :location (or (some-> context
                                                       :collection
                                                       Collection
                                                       :location
                                                       (str (:collection context) "/"))
                                               "/")))))

(defmethod path->context* "dashboards"
  [context _ dashboard-name]
  (assoc context :dashboard (db/select-one-id Dashboard
                              :collection_id (:collection context)
                              :name          dashboard-name)))

(defmethod path->context* "pulses"
  [context _ pulse-name]
  (assoc context :dashboard (db/select-one-id Pulse
                              :collection_id (:collection context)
                              :name          pulse-name)))

(defmethod path->context* "cards"
  [context _ dashboard-name]
  (assoc context :card (db/select-one-id Card
                         :collection_id (:collection context)
                         :name          dashboard-name)))

(defn- fully-qualified-name->context
  [fully-qualified-name]
  (->> (str/split fully-qualified-name #"/")
       rest
       (partition 2)
       (reduce (fn [context [model entity-name]]
                 (path->context context model entity-name))
               {})))

(defn- fully-qualified-name->entity-reference
  [[op & args :as form]]
  (if (-> op qp.util/normalize-token (= :field-literal))
    form
    (into [op]
          (map (fn [arg]
                 (if (string? arg)
                   ((some-fn :field :metric :segment) (fully-qualified-name->context arg))
                   arg)))
          args)))

(defn- humanized-field-references->ids
  [entity]
  (walk/postwalk (fn [form]
                   (if (dump/entity-reference? form)
                     (fully-qualified-name->entity-reference form)
                     form))
                 entity))

(def ^:private default-user (delay (or (db/select-one-id User :is_superuser true)
                                       (u/get-id
                                        (db/insert! User {:email        "admin@example.com"
                                                          :password     "load"
                                                          :first_name   "Admin"
                                                          :last_name    ""
                                                          :is_superuser true})))))

(defmulti
  ^{:doc      "Load an entity of type `model` stored at `path` in the context `context`.

               Passing in parent entities as context instead of decoding them from the path each
               time, saves a lot of queriying."
    :arglists '([path context model])}
  load (fn [_ _ model]
         model))

(defn- load-dimensions
  [path context]
  (maybe-upsert-many! (:mode context) Dimension
    (for [dimension (yaml/from-file (str path "/dimensions.yaml") true)]
      (-> dimension
          (update :human_readable_field_id (comp :field fully-qualified-name->context))
          (update :field_id (comp :field fully-qualified-name->context))))))

(defmethod load Database
  [path context _]
  (doseq [path (list-dirs (str path "/databases"))]
    (maybe-upsert-many! (:mode context) Database (slurp-dir path))
    (doseq [path (list-dirs (str path "/schemas"))]
      (load path context Table)
      (load-dimensions path context))))

(defmethod load Table
  [path context _]
  (let [context   (merge context (fully-qualified-name->context path))
        paths     (list-dirs (str path "/tables"))
        table-ids (maybe-upsert-many! (:mode context) Table
                                    (for [table (slurp-many paths)]
                                      (assoc table :db_id (:database context))))]
    (doseq [[path table-id] (map vector paths table-ids)]
      (let [context (assoc context :table table-id)]
        (load path context Field)
        (load path context Metric)
        (load path context Segment)))))

(defn- fully-qualified-name->card-id
  [fully-qualified-name]
  (some->> fully-qualified-name fully-qualified-name->context :card))

(defmethod load Field
  [path context _]
  (let [fields       (slurp-dir (str path "/fields"))
        field-values (map :values fields)
        field-ids    (maybe-upsert-many! (:mode context) Field
                                         (for [field fields]
                                           (-> field
                                               (dissoc :values)
                                               (assoc :table_id (:table context)))))]
    (maybe-upsert-many! (:mode context) FieldValues
      (for [[field-value field-id] (map vector field-values field-ids)]
        (assoc field-value :field_id field-id)))))

(defmethod load Metric
  [path context _]
  (maybe-upsert-many! (:mode context) Metric
    (for [metric (slurp-dir (str path "/metrics"))]
      (-> metric
          (assoc :table_id   (:table context)
                 :creator_id @default-user)
          (assoc-in [:definition :source-table] (:table context))
          humanized-field-references->ids))))

(defmethod load Segment
  [path context _]
  (maybe-upsert-many! (:mode context) Segment
    (for [metric (slurp-dir (str path "/segments"))]
      (-> metric
          (assoc :table_id   (:table context)
                 :creator_id @default-user)
          (assoc-in [:definition :source-table] (:table context))
          humanized-field-references->ids))))

(defn- update-parameter-mappings
  [parameter-mappings]
  (map #(update % :card_id fully-qualified-name->card-id) parameter-mappings))

(defmethod load Dashboard
  [path context _]
  (let [dashboards         (slurp-dir "/dashboards")
        dashboard-ids      (maybe-upsert-many! (:mode context) Dashboard
                             (for [dashboard dashboards]
                               (-> dashboard
                                   (dissoc :dashboard_cards)
                                   (assoc :collection_id (:collection context)
                                          :creator_id @default-user)
                                   humanized-field-references->ids)))
        dashboard-cards    (map :dashboard_cards dashboards)
        dashboard-card-ids (maybe-upsert-many! (:mode context) DashboardCard
                             (for [[dashboard-card dashboard-id] (map vector dashboard-cards
                                                                      dashboard-ids)]
                               (-> dashboard-card
                                   (dissoc :series)
                                   (update :card_id fully-qualified-name->card-id)
                                   (assoc :dashboard_id dashboard-id)
                                   (update :parameter_mappings update-parameter-mappings)
                                   humanized-field-references->ids)))]
    (maybe-upsert-many! (:mode context) DashboardCardSeries
      (for [[dashboard-card-series dashboard-card-id] (map vector (map :series dashboard-cards)
                                                           dashboard-card-ids)]
        (-> dashboard-card-series
            (assoc :dashboardcard_id dashboard-card-id)
            (update :card_id fully-qualified-name->card-id))))))

(defmethod load Pulse
  [path context _]
  (let [pulses    (slurp-dir (str path "/pulses"))
        cards     (map :cards pulses)
        channels  (map :channels pulses)
        pulse-ids (maybe-upsert-many! (:mode context) Pulse
                                      (for [pulse pulses]
                                        (-> pulse
                                            (assoc :collection_id (:collection context)
                                                   :creator_id    @default-user)
                                            (dissoc :channels :cards))))]
    (maybe-upsert-many! (:mode context) PulseCard
      (for [[cards pulse-id] (map vector cards pulse-ids)
            card             cards]
        (-> card
            (assoc :pulse_id pulse-id)
            (update :card_id fully-qualified-name->card-id))))
    (maybe-upsert-many! (:mode context) PulseChannel
      (for [[channels pulse-id] (map vector channels pulse-ids)
            channel             channels]
        (assoc channel :pulse_id pulse-id)))))

(defn- source-table
  [source-table]
  (let [{:keys [card table]} (fully-qualified-name->context source-table)]
    (if card
      (str "card__" card)
      table)))

(defmethod load Card
  [path context _]
  (let [paths    (list-dirs (str path "/cards"))
        card-ids (maybe-upsert-many! (:mode context) Card
                   (for [card (slurp-many paths)]
                     (let [table (->> card
                                      :table_id
                                      fully-qualified-name->context
                                      :table
                                      Table)
                           db    (:db_id table)]
                       (-> card
                           (assoc :table_id      (u/get-id table)
                                  :creator_id    @default-user
                                  :collection_id (:collection context)
                                  :database_id   db)
                           (assoc-in [:dataset_query :database] db)
                           (cond->
                               (-> card
                                   :dataset_quer
                                   :type
                                   qp.util/normalize-token
                                   (= :query))
                             (update-in [:dataset_query :query :source-table] source-table))
                           humanized-field-references->ids))))]
    ;; Nested cards
    (doseq [[path card-id] (map vector paths card-ids)]
      (load path (assoc context :card card-id) Card))))

(defn- derive-location
  [context]
  (if-let [parent-id (:collection context)]
    (str (-> parent-id Collection :location) parent-id "/")
    "/"))

(defmethod load Collection
  [path context _]
  (let [root?   (not (contains? context :collection))
        context (assoc context
                  :collection (when (not root?)
                                (slurp-one-id (fn [collection]
                                                (maybe-upsert! (:mode context) Collection
                                                  (assoc collection
                                                    :location (derive-location context))))
                                              path)))]
    (doseq [path (list-dirs (if root?
                              (str path "/collections/collections")
                              (str path "/collections")))]
      (load path context Collection))
    (load path context Card)
    (load path context Pulse)
    (load path context Dashboard)))

(defmethod load Collection
  [path context _]
  (let [root?   (not (contains? context :collection))
        context (assoc context
                  :collection (when (not root?)
                                (->> (slurp-dir path)
                                     (map (fn [collection]
                                            (assoc collection
                                              :location (derive-location context))))
                                     (maybe-upsert-many! (:mode context) Collection)
                                     first)))]
    (doseq [path (list-dirs (if root?
                              (str path "/collections/collections")
                              (str path "/collections")))]
      (load path context Collection))
    (load path context Card)
    (load path context Pulse)
    (load path context Dashboard)))

(defn load-settings
  "Load a dump of settings."
  [path context]
  (doseq [[k v] (yaml/from-file (str path "/settings.yaml") true)
          :when (or (= (:mode context) :update)
                    (nil? (setting/get-string k)))]
    (setting/set-string! k v)))

(defn load-dependencies
  "Load a dump of dependencies."
  [path context]
  (let [fully-qualified-name->entity (comp (some-fn (comp Card :card)
                                                    (comp Metric :metric)
                                                    (comp Segment :segment)
                                                    (comp Pulse :pulse))
                                           fully-qualified-name->context)]
    (maybe-upsert-many! (:mode context) Dependency
      (for [{:keys [model_id dependent_on_id]} (yaml/from-file (str path "/dependencies.yaml") true)]
        (let [model        (fully-qualified-name->entity model_id)
              dependent-on (fully-qualified-name->entity dependent_on_id)]
          {:model              (name model)
           :model_id           (u/get-id model)
           :dependent_on_model (name dependent-on)
           :dependent_on_id    (u/get-id dependent-on)
           :created_at         (java.util.Date.)})))))

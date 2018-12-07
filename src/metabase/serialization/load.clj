(ns metabase.serialization.load
  "Load entities serialized by `metabase.serialization.dump`."
  (:require [cheshire.core :as json]
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
  [f path]
  (doall
   (for [^java.io.File file (.listFiles ^java.io.File (io/file path))
         :when (-> file (.getName) (str/ends-with? ".yaml"))]
     (f (yaml/from-file file true)))))

(defn- slurp-one-id
  [f path]
  (some->> path
           (slurp-dir f)
           first
           u/get-id))

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

(def ^:dynamic *upsert-statistics*
  "Accumulator for statistics on what we updated/skipped/added."
  (atom {}))

(defmacro with-upsert-statistics
  "Collect and return statistics about what was updated/skipped/added."
  [& body]
  `(binding [*upsert-statistics* (atom {})]
     ~@body
     @*upsert-statistics*))

(defn- maybe-upsert!
  [mode model entity]
  (let [existing (select-identical model entity)]
    (case mode
      :update (cond
                (= (select-keys existing (keys entity)) entity)
                existing

                existing
                (do
                  (log/infof (str (trs "Updating {0} \"{1}\" (ID {2})"
                                       (:name model)
                                       ((some-fn :email :name) existing)
                                       (u/get-id existing))))
                  (swap! *upsert-statistics* update-in [:update (:name model)] (fnil inc 0))
                  (db/update! model (u/get-id existing) entity)
                  (merge existing entity))

                :else
                (do
                  (log/infof (str (trs "Adding {0} \"{1}\""
                                       (:name model)
                                       ((some-fn :email :name) entity))))
                  (swap! *upsert-statistics* update-in [:insert (:name model)] (fnil inc 0))
                  (db/insert! model entity)))

      :skip   (if existing
                (do
                  (log/infof (str (trs "{0} \"{1}\" (ID {2}) already exists -- skipping"
                                       (:name model)
                                       ((some-fn :email :name) existing)
                                       (u/get-id existing))))
                  (swap! *upsert-statistics* update-in [:skip (:name model)] (fnil inc 0))
                  existing)
                (do
                  (log/infof (str (trs "Adding {0} \"{1}\""
                                       (:name model)
                                       ((some-fn :email :name) entity))))
                  (swap! *upsert-statistics* update-in [:insert (:name model)] (fnil inc 0))
                  (db/insert! model entity))))))

(defmulti
  ^{:doc      "Extract entities from a logical path."
    :private  true
    :arglists '([path context])}
  path->context (fn [_ [model & _]]
                  model))

(defmethod path->context "databases"
  [context [_ & [db-name & path]]]
  (-> context
      (assoc :database (if (= db-name "__virtual")
                         -1337
                         (db/select-one-id Database :name db-name)))
      (path->context path)))

(defmethod path->context "schemas"
  [context [_ & [schema & path]]]
  (-> context
      (assoc :schema schema)
      (path->context path)))

(defmethod path->context "tables"
  [context [_ & [table-name & path]]]
  (-> context
      (assoc :table (db/select-one-id Table
                      :db_id  (:database context)
                      :schema (:schema context)
                      :name   table-name))
      (path->context path)))

(defmethod path->context "fields"
  [context [_ & [field-name & path]]]
  (-> context
      (assoc :field (db/select-one-id Field
                      :table_id (:table context)
                      :name     field-name))
      (path->context path)))

(defmethod path->context "metrics"
  [context [_ & [metric-name & path]]]
  (-> context
      (assoc :metric (db/select-one-id Metric
                       :table_id (:table context)
                       :name     metric-name))
      (path->context path)))

(defmethod path->context "segments"
  [context [_ & [segment-name & path]]]
  (-> context
      (assoc :segment (db/select-one-id Segment
                        :table_id (:table context)
                        :name     segment-name))
      (path->context path)))

(defmethod path->context "collections"
  [context [_ & [collection-name & path-rest :as path]]]
  (if (contains? context :collection)
    (-> context
        (assoc :collection (db/select-one-id Collection
                             :name     collection-name
                             :location (or (some-> context
                                                   :collection
                                                   Collection
                                                   :location
                                                   (str (:collection context) "/"))
                                           "/")))
        (path->context path-rest))
    ;; root collection
    (path->context (assoc context :collection nil) path)))

(defmethod path->context "dashboards"
  [context [_ & [dashboard-name & path]]]
  (-> context
      (assoc :dashboard (db/select-one-id Dashboard
                          :collection_id (:collection context)
                          :name          dashboard-name))
      (path->context path)))

(defmethod path->context "pulses"
  [context [_ & [pulse-name & path]]]
  (-> context
      (assoc :dashboard (db/select-one-id Pulse
                          :collection_id (:collection context)
                          :name          pulse-name))
      (path->context path)))

(defmethod path->context "cards"
  [context [_ & [dashboard-name & path]]]
  (-> context
      (assoc :card (db/select-one-id Card
                     :collection_id (:collection context)
                     :name          dashboard-name))
      (path->context path)))

(defmethod path->context nil
  [context _]
  context)

(defn- fully-qualified-name->context
  [context fully-qualified-name]
  (->> (str/split fully-qualified-name #"/")
       rest
       (path->context context)))

(defn- fully-qualified-name->entity-reference
  [context [op & args :as form]]
  (if (-> op qp.util/normalize-token (= :field-literal))
    form
    (into [op]
          (map (fn [arg]
                 (if (string? arg)
                   ((some-fn :field :metric :segment) (fully-qualified-name->context context arg))
                   arg)))
          args)))

(defn- humanized-field-references->ids
  [entity context]
  (walk/postwalk (fn [form]
                   (if (dump/entity-reference? form)
                     (fully-qualified-name->entity-reference context form)
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
  (let [fully-qualified-name->field-id (comp :field (partial fully-qualified-name->context context))]
    (doseq [dimension (yaml/from-file (str path "/dimensions.yaml") true)]
      (maybe-upsert! (:mode context) Dimension
        (-> dimension
            (update :human_readable_field_id fully-qualified-name->field-id)
            (update :field_id fully-qualified-name->field-id))))))

(defmethod load Database
  [path context _]
  (doseq [path (list-dirs (str path "/databases"))]
    (slurp-dir (partial maybe-upsert! (:mode context) Database) path)
    (doseq [path (list-dirs (str path "/schemas"))]
      (load path context Table)
      (load-dimensions path context))))

(defmethod load Table
  [path context _]
  (let [context (merge context (fully-qualified-name->context context path))]
    (doseq [path (list-dirs (str path "/tables"))]
      (let [context (assoc context
                      :table (slurp-one-id (fn [table]
                                             (maybe-upsert! (:mode context) Table
                                               (assoc table :db_id (:database context))))
                                           path))]
        (load path context Field)
        (load path context Metric)
        (load path context Segment)))))

(defn- fully-qualified-name->card-id
  [context fully-qualified-name]
  (some->> fully-qualified-name (fully-qualified-name->context context) :card))

(defmethod load Field
  [path context _]
  (slurp-dir
   (fn [field]
     (let [field-values (select-keys field [:values :human_readable_values])
           field        (maybe-upsert! (:mode context) Field
                          (-> field
                              (dissoc :values :human_readable_values)
                              (assoc :table_id (:table context))))]
       (when (:values field-values)
         (maybe-upsert! (:mode context) FieldValues
           (assoc field-values :field_id (u/get-id field))))
       field))
   (str path "/fields")))

(defmethod load Metric
  [path context _]
  (slurp-dir (fn [metric]
               (maybe-upsert! (:mode context) Metric
                 (-> metric
                     (assoc :table_id   (:table context)
                            :creator_id @default-user)
                     (assoc-in [:definition :source-table] (:table context))
                     (humanized-field-references->ids context))))
             (str path "/metrics")))

(defmethod load Segment
  [path context _]
  (slurp-dir (fn [segment]
               (maybe-upsert! (:mode context) Segment
                 (-> segment
                     (assoc :table_id   (:table context)
                            :creator_id @default-user)
                     (assoc-in [:definition :source-table] (:table context))
                     (humanized-field-references->ids context))))
             (str path "/segments")))

(defn- update-parameter-mappings
  [parameter-mappings context]
  (map #(update % :card_id (partial fully-qualified-name->card-id context)) parameter-mappings))

(defmethod load Dashboard
  [path context _]
  (slurp-dir
   (fn [dashboard]
     (let [dashboard-cards (:dashboard_cards dashboard)
           dashboard       (maybe-upsert! (:mode context) Dashboard
                             (-> dashboard
                                 (dissoc :dashboard_cards)
                                 (assoc :collection_id (:collection context)
                                        :creator_id @default-user)
                                 (humanized-field-references->ids context)))]
       (doseq [dashboard-card dashboard-cards]
         (let [series         (:series dashboard-card)
               dashboard-card (maybe-upsert! (:mode context) DashboardCard
                                (-> dashboard-card
                                    (dissoc :series)
                                    (update :card_id (partial fully-qualified-name->card-id context))
                                    (assoc :dashboard_id (:id dashboard))
                                    (update :parameter_mappings update-parameter-mappings context)
                                    (humanized-field-references->ids context)))]
           (doseq [dashboard-card-series series]
             (maybe-upsert! (:mode context) DashboardCardSeries
               (-> dashboard-card-series
                   (assoc :dashboardcard_id (:id dashboard-card))
                   (update :card_id (partial fully-qualified-name->card-id context)))))))
       dashboard))
   (str path "/dashboards")))

(defmethod load Pulse
  [path context _]
  (slurp-dir
   (fn [pulse]
     (let [{:keys [cards channels]} pulse
           pulse                    (maybe-upsert! (:mode context) Pulse
                                      (-> pulse
                                          (assoc :collection_id (:collection context)
                                                 :creator_id    @default-user)
                                          (dissoc :channels :cards)))]
       (doseq [card cards]
         (maybe-upsert! (:mode context) PulseCard
           (-> card
               (assoc :pulse_id (u/get-id pulse))
               (update :card_id (partial fully-qualified-name->card-id context)))))
       (doseq [channel channels]
         (maybe-upsert! (:mode context) PulseChannel
           (assoc channel :pulse_id (u/get-id pulse))))))
   (str path "/pulses")))

(defn- source-table
  [source-table context]
  (let [{:keys [card table]} (fully-qualified-name->context context source-table)]
    (if card
      (str "card__" card)
      table)))

(defmethod load Card
  [path context _]
  (doseq [path (list-dirs (str path "/cards"))]
    (let [context (assoc context
                    :card (slurp-one-id
                           (fn [card]
                             (let [table (->> card
                                              :table_id
                                              (fully-qualified-name->context context)
                                              :table
                                              Table)
                                   db    (:db_id table)]
                               (maybe-upsert! (:mode context) Card
                                 (-> card
                                     (assoc :table_id      (u/get-id table)
                                            :creator_id    @default-user
                                            :collection_id (:collection context)
                                            :database_id   db)
                                     (assoc-in [:dataset_query :database] db)
                                     (cond->
                                       (-> card
                                           :dataset_query
                                           :type
                                           qp.util/normalize-token
                                           (= :query))
                                       (update-in [:dataset_query :query :source-table] source-table context))
                                     (humanized-field-references->ids context)))))
                           path))]
      ;; Nested cards
      (load path context Card))))

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

(defn load-settings
  "Load a dump of settings."
  [path context]
  (doseq [[k v] (yaml/from-file (str path "/settings.yaml") true)]
    (when (or (= (:mode context) :update)
              (nil? (setting/get-string k)))
      (setting/set-string! k v))))

(defn load-dependencies
  "Load a dump of dependencies."
  [path context]
  (let [fully-qualified-name->entity (comp (some-fn (comp Card :card)
                                                    (comp Metric :metric)
                                                    (comp Segment :segment)
                                                    (comp Pulse :pulse))
                                           (partial fully-qualified-name->context {}))]
    (for [{:keys [model_id dependent_on_id]} (yaml/from-file (str path "/dependencies.yaml") true)]
      (let [model        (fully-qualified-name->entity model_id)
            dependent-on (fully-qualified-name->entity dependent_on_id)]
        (maybe-upsert! (:mode context) Dependency {:model              (name model)
                                                   :model_id           (u/get-id model)
                                                   :dependent_on_model (name dependent-on)
                                                   :dependent_on_id    (u/get-id dependent-on)
                                                   :created_at         (java.util.Date.)})))))

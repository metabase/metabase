(ns metabase-enterprise.serialization.load
  "Load entities serialized by `metabase-enterprise.serialization.dump`."
  (:refer-clojure :exclude [load])
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase-enterprise.serialization.names :refer [fully-qualified-name->context]]
            [metabase-enterprise.serialization.upsert :refer [maybe-fixup-card-template-ids! maybe-upsert-many!]]
            [metabase.config :as config]
            [metabase.mbql.normalize :as mbql.normalize]
            [metabase.mbql.util :as mbql.util]
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
            [metabase.models.setting :as setting]
            [metabase.models.table :refer [Table]]
            [metabase.models.user :refer [User]]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db]
            [yaml.core :as yaml]
            [yaml.reader :as y.reader])
  (:import java.time.temporal.Temporal))

(extend-type Temporal y.reader/YAMLReader
  (decode [data]
    (u.date/parse data)))

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

(defn- mbql-fully-qualified-names->ids
  [entity]
  (mbql.util/replace (mbql.normalize/normalize-tokens entity)
    ;; handle legacy `:field-id` forms encoded prior to 0.39.0
    [:field-id (fully-qualified-name :guard string?)]
    (mbql-fully-qualified-names->ids [:field fully-qualified-name nil])

    [:field (fully-qualified-name :guard string?) opts]
    [:field (:field (fully-qualified-name->context fully-qualified-name)) opts]

    [:metric (fully-qualified-name :guard string?)]
    [:metric (:metric (fully-qualified-name->context fully-qualified-name))]

    [:segment (fully-qualified-name :guard string?)]
    [:segment (:segment (fully-qualified-name->context fully-qualified-name))]))

(def ^:private default-user (delay
                             (let [user (db/select-one-id User :is_superuser true)]
                               (assert user (trs "No admin users found! At least one admin user is needed to act as the owner for all the loaded entities."))
                               user)))

(defn- terminal-dir
  "Return the last path component (presumably a dir)"
  [path]
  (.getName (clojure.java.io/file path)))

(defn- update-capture-missing*
  [m ks resolve-fn get-fn update-fn]
  (let [orig-v (get-fn m ks)
        res    (update-fn m ks resolve-fn)
        new-v  (get-fn res ks)]
    (if (and (some? orig-v) (nil? new-v))
      (update res ::unresolved-names #(assoc % orig-v ks))
      res)))

(defn- update-existing-in-capture-missing
  [m ks resolve-fn]
  (update-capture-missing* m ks resolve-fn get-in m/update-existing-in))

(defn- update-existing-capture-missing
  [m k resolve-fn]
  (update-capture-missing* m [k] resolve-fn get-in m/update-existing-in))

(defn- pull-unresolved-names-up
  "Assocs the given value `v` to the given key sequence `ks` in the given map `m`. If the given `v` contains any
  ::unresolved-names, these are \"pulled into\" `m` directly by prepending `ks` to their existing paths and dissocing
  them from `v`."
  [m ks v]
  (if-let [unresolved-names (::unresolved-names v)]
    (-> (assoc m ::unresolved-names (m/map-vals #(vec (concat ks %)) unresolved-names))
        (assoc-in ks (dissoc v ::unresolved-names)))
    (assoc-in m ks v)))

(defmulti load
  "Load an entity of type `model` stored at `path` in the context `context`.

   Passing in parent entities as context instead of decoding them from the path each time,
   saves a lot of queriying."
  (fn [path _]
    (terminal-dir path)))

(defn- load-dimensions
  [path context]
  (maybe-upsert-many! context Dimension
    (for [dimension (yaml/from-file (str path "/dimensions.yaml") true)]
      (-> dimension
          (update :human_readable_field_id (comp :field fully-qualified-name->context))
          (update :field_id (comp :field fully-qualified-name->context))))))

(defmethod load "databases"
  [path context]
  (doseq [path (list-dirs path)]
    ;; If we failed to load the DB no use in trying to load its tables
    (when-let [db (first (maybe-upsert-many! context Database (slurp-dir path)))]
      (doseq [inner-path (conj (list-dirs (str path "/schemas")) path)
              :let [context (merge context {:database db
                                            :schema   (when (not= inner-path path)
                                                        (terminal-dir path))})]]
        (load (str inner-path "/tables") context)
        (load-dimensions inner-path context)))))

(defmethod load "tables"
  [path context]
  (let [paths     (list-dirs path)
        table-ids (maybe-upsert-many! context Table
                    (for [table (slurp-many paths)]
                      (assoc table :db_id (:database context))))]
    ;; First load fields ...
    (doseq [[path table-id] (map vector paths table-ids)
            :when table-id]
      (let [context (assoc context :table table-id)]
        (load (str path "/fields") context)))
    ;; ... then everything else so we don't have issues with cross-table referencess
    (doseq [[path table-id] (map vector paths table-ids)
            :when table-id]
      (let [context (assoc context :table table-id)]
        (load (str path "/fks") context)
        (load (str path "/metrics") context)
        (load (str path "/segments") context)))))

(def ^:private fully-qualified-name->card-id
  (comp :card fully-qualified-name->context))

(defn- load-fields
  [path context]
  (let [fields       (slurp-dir path)
        field-values (map :values fields)
        field-ids    (maybe-upsert-many! context Field
                       (for [field fields]
                         (-> field
                             (update :parent_id (comp :field fully-qualified-name->context))
                             (update :last_analyzed u.date/parse)
                             (update :fk_target_field_id (comp :field fully-qualified-name->context))
                             (dissoc :values)
                             (assoc :table_id (:table context)))))]
    (maybe-upsert-many! context FieldValues
      (for [[field-value field-id] (map vector field-values field-ids)
            :when field-id]
        (assoc field-value :field_id field-id)))))

(defmethod load "fields"
  [path context]
  (load-fields path context))

(defmethod load "fks"
  [path context]
  (load-fields path context))

(defmethod load "metrics"
  [path context]
  (maybe-upsert-many! context Metric
    (for [metric (slurp-dir path)]
      (-> metric
          (assoc :table_id   (:table context)
                 :creator_id @default-user)
          (assoc-in [:definition :source-table] (:table context))
          (update :definition mbql-fully-qualified-names->ids)))))

(defmethod load "segments"
  [path context]
  (maybe-upsert-many! context Segment
    (for [metric (slurp-dir path)]
      (-> metric
          (assoc :table_id   (:table context)
                 :creator_id @default-user)
          (assoc-in [:definition :source-table] (:table context))
          (update :definition mbql-fully-qualified-names->ids)))))

(defn- update-parameter-mappings
  [parameter-mappings]
  (for [parameter-mapping parameter-mappings]
    (-> parameter-mapping
        (update-existing-capture-missing :card_id fully-qualified-name->card-id)
        (update-existing-capture-missing :target mbql-fully-qualified-names->ids))))

(defn load-dashboards
  "Loads `dashboards` (which is a sequence of maps parsed from a YAML dump of dashboards) in a given `context`."
  {:added "0.40.0"}
  [context dashboards]
  (let [dashboard-ids   (maybe-upsert-many! context Dashboard
                          (for [dashboard dashboards]
                            (-> dashboard
                                (dissoc :dashboard_cards)
                                (assoc :collection_id (:collection context)
                                       :creator_id    @default-user))))
        dashboard-cards (map :dashboard_cards dashboards)
        ;; a function that prepares a dash card for insertion, while also validating to ensure the underlying
        ;; card_id could be resolved from the fully qualified name
        prepare-card-fn (fn [idx dashboard-id card]
                          (let [proc-card  (-> card
                                               (update-existing-capture-missing :card_id fully-qualified-name->card-id)
                                               (assoc :dashboard_id dashboard-id))
                                new-pm     (update-parameter-mappings (:parameter_mappings proc-card))
                                final-card (pull-unresolved-names-up proc-card [:parameter_mappings] new-pm)]
                            (if (::unresolved-names final-card)
                              {;; index means something different here than in the Card case (it's actually the index
                               ;; of the dashboard)
                               ::revisit-index idx
                               ::revisit       final-card}
                              {::process final-card})))
        prep-init-acc   {::process [] ::revisit-index [] ::revisit []}
        filtered-cards  (reduce-kv
                         (fn [acc idx [cards dash-id]]
                           (if dash-id
                             (let [map-fn (map (partial prepare-card-fn idx dash-id) cards)
                                   res    (apply merge-with conj prep-init-acc map-fn)]
                               (merge-with concat acc res))
                             acc))
                         prep-init-acc
                         (mapv vector dashboard-cards dashboard-ids))
        revisit-indexes (vec (::revisit-index filtered-cards))
        proceed-cards   (vec (::process filtered-cards))
        dashcard-ids    (maybe-upsert-many! context DashboardCard (map #(dissoc % :series) proceed-cards))
        series-pairs    (map vector (map :series proceed-cards) dashcard-ids)]
    (maybe-upsert-many! context DashboardCardSeries
      (for [[series dashboard-card-id] series-pairs
            dashboard-card-series      series
            :when (and dashboard-card-series dashboard-card-id)]
        (-> dashboard-card-series
            (assoc :dashboardcard_id dashboard-card-id)
            (update :card_id fully-qualified-name->card-id))))
    (let [revisit-dashboards (map (partial nth dashboards) revisit-indexes)]
      (if-not (empty? revisit-dashboards)
        (fn []
          (log/infof
           "Retrying dashboards for collection %s: %s"
           (or (:collection context) "root")
           (str/join ", " (map :name revisit-dashboards)))
          (load-dashboards context revisit-dashboards))))))

(defmethod load "dashboards"
  [path context]
  (load-dashboards context (slurp-dir path)))

(defmethod load "pulses"
  [path context]
  (let [pulses    (slurp-dir path)
        cards     (map :cards pulses)
        channels  (map :channels pulses)
        pulse-ids (maybe-upsert-many! context Pulse
                    (for [pulse pulses]
                      (-> pulse
                          (assoc :collection_id (:collection context)
                                 :creator_id    @default-user)
                          (dissoc :channels :cards))))]
    (maybe-upsert-many! context PulseCard
      (for [[cards pulse-id] (map vector cards pulse-ids)
            card             cards
            :when pulse-id]
        (-> card
            (assoc :pulse_id pulse-id)
            (update :card_id fully-qualified-name->card-id))))
    (maybe-upsert-many! context PulseChannel
      (for [[channels pulse-id] (map vector channels pulse-ids)
            channel             channels
            :when pulse-id]
        (assoc channel :pulse_id pulse-id)))))

(defn- source-table
  [source-table]
  (let [{:keys [card table]} (fully-qualified-name->context source-table)]
    (if card
      (str "card__" card)
      table)))

(defn- fully-qualified-name->id-rec [query]
  (cond
    (:source-table query) (update-in query [:source-table] source-table)
    (:source-query query) (update-in query [:source-query] fully-qualified-name->id-rec)
    :default query))

(defn- source-card
  [fully-qualified-name]
  (try
    (-> (fully-qualified-name->context fully-qualified-name) :card)
    (catch Throwable e
      (log/warn e))))

(defn- resolve-native
  [card]
  (let [ks                [:dataset_query :native :template-tags]
        template-tags     (get-in card ks)
        new-template-tags (reduce-kv
                           (fn [m k v]
                             (let [new-v (update-existing-capture-missing v :card-id source-card)]
                               (pull-unresolved-names-up m [k] new-v)))
                           {}
                           template-tags)]
    (pull-unresolved-names-up card ks new-template-tags)))

(defn- resolve-card [card context]
  (-> card
      (update :table_id (comp :table fully-qualified-name->context))
      (update :database_id (comp :database fully-qualified-name->context))
      (update :dataset_query mbql-fully-qualified-names->ids)
      (assoc :creator_id    @default-user
             :collection_id (:collection context))
      (update-in [:dataset_query :database] (comp :database fully-qualified-name->context))
      (cond->
          (-> card
              :dataset_query
              :type
              mbql.util/normalize-token
              (= :query)) (update-in [:dataset_query :query] fully-qualified-name->id-rec)
          (-> card
              :dataset_query
              :native
              :template-tags
              not-empty) (resolve-native))))

(defn- make-dummy-card
  "Make a dummy card for first pass insertion"
  [card]
  (-> card
      (assoc :dataset_query {:type :native :native {:query "-- DUMMY QUERY FOR SERIALIZATION FIRST PASS INSERT"}})
      (dissoc ::unresolved-names)))

(defn load-cards
  "Loads cards in a given `context`, from a given sequence of `paths` (strings).  If specified, then `only-cards` (maps
  having the structure of cards loaded from YAML dumps) will be used instead of loading data from `paths` (to serve as
  a retry mechanism)."
  {:added "0.40.0"}
  [context paths only-cards]
  (let [cards              (or only-cards (slurp-many paths))
        resolved-cards     (for [card cards]
                             (resolve-card card context))
        grouped-cards      (reduce-kv
                            (fn [acc idx card]
                              (if (::unresolved-names card)
                                (-> acc
                                    (update ::revisit #(conj % card))
                                    (update ::revisit-index #(conj % idx)))
                                (update acc ::process #(conj % card))))
                            {::revisit [] ::revisit-index [] ::process []}
                            (vec resolved-cards))
        dummy-insert-cards (not-empty (::revisit grouped-cards))
        process-cards      (::process grouped-cards)
        touched-card-ids   (maybe-upsert-many!
                            context Card
                            process-cards)]
    (maybe-fixup-card-template-ids!
     (assoc context :mode :update)
     Card
     (for [card (slurp-many paths)] (resolve-card card (assoc context :mode :update)))
     touched-card-ids)

    ;; Nested cards
    (doseq [path paths]
      (load (str path "/cards") context))

    (if dummy-insert-cards
      (let [dummy-inserted-ids (maybe-upsert-many!
                                context
                                Card
                                (map make-dummy-card dummy-insert-cards))
            id-and-cards       (map vector dummy-insert-cards dummy-inserted-ids)
            retry-info-fn      (fn [[card card-id]]
                                 (format
                                  "\"%s\" (inserted as ID %d), missing:%n%s%n"
                                  (:name card)
                                  card-id
                                  (str/join
                                   "\n  "
                                   (map
                                    (fn [[k v]]
                                      (format "  for %s -> %s" (str/join "/" v) k))
                                    (::unresolved-names card)))))]
        (log/infof
         "Unresolved references found for cards in collection %d; will reload after first pass%n%s%n"
         (:collection context)
         (str/join "%n" (map retry-info-fn id-and-cards)))
        (fn []
          (log/infof "Attempting to reload cards in collection %d" (:collection context))
          (let [revisit-indexes (::revisit-index grouped-cards)]
            (load-cards context paths (mapv (partial nth cards) revisit-indexes))))))))

(defmethod load "cards"
  [path context]
  (load-cards context (list-dirs path) nil))

(defmethod load "users"
  [path context]
  ;; Currently we only serialize the new owner user, so it's fine to ignore mode setting
  (maybe-upsert-many! context User
    (for [user (slurp-dir path)]
      (dissoc user :password))))

(defn- derive-location
  [context]
  (if-let [parent-id (:collection context)]
    (str (-> parent-id Collection :location) parent-id "/")
    "/"))

(defmethod load "collections"
  [path context]
  (let [res-fns (for [path (list-dirs path)]
                  (let [context (assoc context
                                  :collection (->> (slurp-dir path)
                                                   (map (fn [collection]
                                                          (assoc collection :location (derive-location context))))
                                                   (maybe-upsert-many! context Collection)
                                                   first))]
                    (filter fn? [(load (str path "/collections") context)
                                 (load (str path "/cards") context)
                                 (load (str path "/pulses") context)
                                 (load (str path "/dashboards") context)])))
        all-fns (apply concat res-fns)]
    (if-not (empty? all-fns)
      (fn []
        (doseq [reload-fn all-fns]
          (reload-fn))))))

(defn load-settings
  "Load a dump of settings."
  [path context]
  (doseq [[k v] (yaml/from-file (str path "/settings.yaml") true)
          :when (or (= context :update)
                    (nil? (setting/get-string k)))]
    (setting/set-string! k v)))

(defn- log-or-die
  [on-error message]
  (if (= on-error :abort)
    (throw (Exception. (str message)))
    (log/error message)))

(defn load-dependencies
  "Load a dump of dependencies."
  [path context]
  (let [fully-qualified-name->entity (comp (some-fn (comp Card :card)
                                                    (comp Metric :metric)
                                                    (comp Segment :segment)
                                                    (comp Pulse :pulse))
                                           fully-qualified-name->context)]
    (maybe-upsert-many! context Dependency
      (for [{:keys [model_id dependent_on_id]} (yaml/from-file (str path "/dependencies.yaml") true)]
        (let [model        (fully-qualified-name->entity model_id)
              dependent-on (fully-qualified-name->entity dependent_on_id)]
          (cond
            (and model dependent-on)
            {:model              (name model)
             :model_id           (u/the-id model)
             :dependent_on_model (name dependent-on)
             :dependent_on_id    (u/the-id dependent-on)
             :created_at         (java.util.Date.)}

            (nil? model)
            (log-or-die (:on-error model) (trs "Error loading dependencies: reference to an unknown entity {0}" model_id))

            (nil? dependent-on)
            (log-or-die (:on-error model) (trs "Error loading dependencies: reference to an unknown entity {0}" dependent_on_id))))))))

(defn compatible?
  "Is dump at path `path` compatible with the currently running version of Metabase?"
  [path]
  (-> (str path "/manifest.yaml")
      (yaml/from-file true)
      :metabase-version
      (= config/mb-version-info)))

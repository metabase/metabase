(ns metabase-enterprise.serialization.load
  "Load entities serialized by `metabase-enterprise.serialization.dump`."
  (:refer-clojure :exclude [load])
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.serialization.names
    :as names
    :refer [fully-qualified-name->context]]
   [metabase-enterprise.serialization.upsert :refer [maybe-upsert-many!]]
   [metabase.config :as config]
   [metabase.db.connection :as mdb.connection]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.card :refer [Card]]
   [metabase.models.collection :refer [Collection]]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.dashboard-card :refer [DashboardCard]]
   [metabase.models.dashboard-card-series :refer [DashboardCardSeries]]
   [metabase.models.database :as database :refer [Database]]
   [metabase.models.dimension :refer [Dimension]]
   [metabase.models.field :refer [Field]]
   [metabase.models.field-values :refer [FieldValues]]
   [metabase.models.metric :refer [Metric]]
   [metabase.models.native-query-snippet :refer [NativeQuerySnippet]]
   [metabase.models.pulse :refer [Pulse]]
   [metabase.models.pulse-card :refer [PulseCard]]
   [metabase.models.pulse-channel :refer [PulseChannel]]
   [metabase.models.segment :refer [Segment]]
   [metabase.models.setting :as setting]
   [metabase.models.table :refer [Table]]
   [metabase.models.user :as user :refer [User]]
   [metabase.shared.models.visualization-settings :as mb.viz]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2])
  (:import
   (java.util UUID)))

(set! *warn-on-reflection* true)

(defn- slurp-dir
  [path]
  (doall
   (for [^java.io.File file (.listFiles ^java.io.File (io/file path))
         :when (-> file (.getName) (str/ends-with? ".yaml"))]
     (yaml/from-file file))))

(defn- slurp-many
  [paths]
  (apply concat (map slurp-dir paths)))

(defn- list-dirs
  [path]
  (for [^java.io.File file (.listFiles ^java.io.File (io/file path))
        :when (.isDirectory file)]
    (.getPath file)))

(defn- source-table
  [source-table]
  (if (and (string? source-table) (str/starts-with? source-table "card__"))
    source-table
    (let [{:keys [card table]} (fully-qualified-name->context source-table)]
      (if card
        (str "card__" card)
        table))))

(defn- fq-table-or-card?
  "Returns true if the given `nm` is either a fully qualified table name OR fully
  qualified card name."
  [nm]
  (or (names/fully-qualified-table-name? nm) (names/fully-qualified-card-name? nm)))

(defn- update-capture-missing*
  [m ks resolve-fn get-fn update-fn]
  (let [orig-v (get-fn m ks)
        res    (update-fn m ks resolve-fn)
        new-v  (get-fn res ks)]
    (if (and (some? orig-v) (nil? new-v))
      (update res ::unresolved-names #(assoc % orig-v ks))
      res)))

(defn- update-in-capture-missing
  [m ks resolve-fn]
  (update-capture-missing* m ks resolve-fn get-in update-in))

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
  ([m ks]
   (pull-unresolved-names-up m ks (get-in m ks)))
  ([m ks v]
   (if-let [unresolved-names (::unresolved-names v)]
     (-> (update m ::unresolved-names (fn [nms] (merge nms (m/map-vals #(vec (concat ks %)) unresolved-names))))
         (assoc-in ks (dissoc v ::unresolved-names)))
     (assoc-in m ks v))))

(defn- paths-to-key-in
  "Finds all paths to a particular key anywhere in the structure `m` (recursively).  `m` must be a map, but values
  inside can also be vectors (in which case, the index will be used as the key).

  Adapted from: https://dnaeon.github.io/clojure-map-ks-paths/"
  [m match-key]
  (letfn [(children [node]
            (let [v (get-in m node)]
              (cond
                (map? v)
                (map (fn [x] (conj node x)) (keys v))

                (vector? v)
                (map (fn [x] (conj node x)) (range (count v)))

                :else
                [])))
          (branch? [node] (-> (children node) seq boolean))]
    (->> (keys m)
         (map vector)
         (mapcat #(tree-seq branch? children %))
         (filter #(= match-key (last %))))))

(defn- gather-all-unresolved-names
  "This is less efficient than calling `pull-unresolved-names-up` because it walks the entire tree, but is
  necessary when dealing with the full MBQL query tree (which can have arbitrary nesting of maps and
  vectors)."
  [m]
  (let [paths (paths-to-key-in m ::unresolved-names)]
    (if-not (empty? paths)
      (reduce (fn [acc ks]
                (let [ks* (drop-last ks)]
                  (if-not (empty? ks*)
                    (pull-unresolved-names-up acc ks*)
                    acc)))
              m
              paths)
      m)))

(defn- mbql-fully-qualified-names->ids*
  [entity]
  (mbql.u/replace entity
    ;; handle legacy `:field-id` forms encoded prior to 0.39.0
    ;; and also *current* expresion forms used in parameter mapping dimensions
    ;; example relevant clause - [:dimension [:fk-> [:field-id 1] [:field-id 2]]]
    [:field-id (fully-qualified-name :guard string?)]
    (mbql-fully-qualified-names->ids* [:field fully-qualified-name nil])

    [:field (fully-qualified-name :guard names/fully-qualified-field-name?) opts]
    [:field (:field (fully-qualified-name->context fully-qualified-name)) (mbql-fully-qualified-names->ids* opts)]

    ;; source-field is also used within parameter mapping dimensions
    ;; example relevant clause - [:field 2 {:source-field 1}]
    {:source-field (fully-qualified-name :guard string?)}
    (assoc &match :source-field (:field (fully-qualified-name->context fully-qualified-name)))

    [:metric (fully-qualified-name :guard string?)]
    [:metric (:metric (fully-qualified-name->context fully-qualified-name))]

    [:segment (fully-qualified-name :guard string?)]
    [:segment (:segment (fully-qualified-name->context fully-qualified-name))]

    (_ :guard (every-pred map? #(fq-table-or-card? (:source-table %))))
    (-> (mbql-fully-qualified-names->ids* (dissoc &match :source-table)) ;; process other keys
        (assoc :source-table (:source-table &match))                     ;; add :source-table back in for lookup
        (update-existing-capture-missing :source-table source-table))))  ;; look up :source-table and capture missing

(defn- mbql-fully-qualified-names->ids
  [entity]
  (mbql-fully-qualified-names->ids* (mbql.normalize/normalize-tokens entity)))

(def ^:private ^{:arglists '([])} default-user-id
  (mdb.connection/memoize-for-application-db
   (fn []
     (let [user (t2/select-one-pk User :is_superuser true)]
       (assert user (trs "No admin users found! At least one admin user is needed to act as the owner for all the loaded entities."))
       user))))

(defn- terminal-dir
  "Return the last path component (presumably a dir)"
  [path]
  (.getName (io/file path)))

(defn- unresolved-names->string
  ([model]
   (unresolved-names->string model nil))
  ([model insert-id]
   (str
    (when-let [nm (:name model)] (str "\"" nm "\""))
    (when insert-id (format " (inserted as ID %d) " insert-id))
    "missing:\n  "
    (str/join
     "\n  "
     (map
      (fn [[k v]]
        (format "at %s -> %s" (str/join "/" v) k))
      (::unresolved-names model))))))

(defmulti load
  "Load an entity of type `model` stored at `path` in the context `context`.

   Passing in parent entities as context instead of decoding them from the path each time,
   saves a lot of queriying."
  {:arglists '([path context])}
  (fn [path _context]
    (terminal-dir path)))

(defn- load-dimensions
  [path context]
  (maybe-upsert-many! context Dimension
    (for [dimension (yaml/from-file (str path "/dimensions.yaml"))]
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
                 :creator_id (default-user-id))
          (assoc-in [:definition :source-table] (:table context))
          (update :definition mbql-fully-qualified-names->ids)))))

(defmethod load "segments"
  [path context]
  (maybe-upsert-many! context Segment
    (for [metric (slurp-dir path)]
      (-> metric
          (assoc :table_id   (:table context)
                 :creator_id (default-user-id))
          (assoc-in [:definition :source-table] (:table context))
          (update :definition mbql-fully-qualified-names->ids)))))

(defn- update-card-parameter-mappings
  [parameter-mappings]
  (for [parameter-mapping parameter-mappings]
    (-> parameter-mapping
        (update-existing-capture-missing :card_id fully-qualified-name->card-id)
        (update-existing-capture-missing :target mbql-fully-qualified-names->ids))))

(defn- resolve-column-settings-key
  [col-key]
  (if-let [field-name (::mb.viz/field-str col-key)]
    (let [field-id ((comp :field fully-qualified-name->context) field-name)]
      (if (nil? field-id)
        {::unresolved-names {field-name [::column-settings-key]}}
        {::mb.viz/field-id field-id}))
    col-key))

(defn- resolve-param-mapping-key [k]
  (mbql-fully-qualified-names->ids k))

(defn- resolve-dimension [dimension]
  (mbql-fully-qualified-names->ids dimension))

(defn- resolve-param-ref [param-ref]
  (cond-> param-ref
    (= "dimension" (::mb.viz/param-ref-type param-ref))
    (-> ; from outer cond->
        (m/update-existing ::mb.viz/param-ref-id mbql-fully-qualified-names->ids)
        (m/update-existing ::mb.viz/param-dimension resolve-dimension))))

(defn- resolve-param-mapping-val [v]
  (-> v
      (m/update-existing ::mb.viz/param-mapping-id mbql-fully-qualified-names->ids)
      (m/update-existing ::mb.viz/param-mapping-source resolve-param-ref)
      (m/update-existing ::mb.viz/param-mapping-target resolve-param-ref)))

(defn- resolve-click-behavior-parameter-mapping [parameter-mapping]
  (->> parameter-mapping
       mb.viz/db->norm-param-mapping
       (reduce-kv (fn [acc k v]
                    (assoc acc (resolve-param-mapping-key k)
                               (resolve-param-mapping-val v))) {})
       mb.viz/norm->db-param-mapping))

(defn- resolve-click-behavior
  [click-behavior]
  (-> (if-let [link-type (::mb.viz/link-type click-behavior)]
        (case link-type
          ::mb.viz/card (let [card-id (::mb.viz/link-target-id click-behavior)]
                          (when (string? card-id)
                            (update-existing-in-capture-missing
                             click-behavior
                             [::mb.viz/link-target-id]
                             (comp :card fully-qualified-name->context))))
          ::mb.viz/dashboard (let [dashboard-id (::mb.viz/link-target-id click-behavior)]
                               (when (string? dashboard-id)
                                 (update-existing-in-capture-missing
                                  click-behavior
                                  [::mb.viz/link-target-id]
                                  (comp :dashboard fully-qualified-name->context))))
          click-behavior)
        click-behavior)
      (m/update-existing ::mb.viz/parameter-mapping resolve-click-behavior-parameter-mapping)))

(defn- update-col-settings-click-behavior [col-settings-value]
  (let [new-cb (resolve-click-behavior (::mb.viz/click-behavior col-settings-value))]
    (pull-unresolved-names-up col-settings-value [::mb.viz/click-behavior] new-cb)))

(defn- resolve-column-settings-value
  [col-value]
  (cond-> col-value
    (::mb.viz/click-behavior col-value) update-col-settings-click-behavior))

(defn- accumulate-converted-column-settings
  [acc col-key v]
  (let [new-key (resolve-column-settings-key col-key)
        new-val (resolve-column-settings-value v)]
    (-> (pull-unresolved-names-up acc [::column-settings-key] new-key)
        (dissoc ::column-settings-key)
        (pull-unresolved-names-up [new-key] new-val))))

(defn- resolve-top-level-click-behavior [vs-norm]
  (if-let [click-behavior (::mb.viz/click-behavior vs-norm)]
    (let [resolved-cb (resolve-click-behavior click-behavior)]
      (pull-unresolved-names-up vs-norm [::mb.viz/click-behavior] resolved-cb))
    vs-norm))

(defn- resolve-column-settings
  "Resolve the entries in a :column_settings map (which is under a :visualization_settings map). These map entries
  may contain fully qualified field names, or even other cards. In case of an unresolved name (i.e. a card that hasn't
  yet been loaded), we will track it under ::unresolved-names and revisit on the next pass."
  [vs-norm]
  (if-let [col-settings (::mb.viz/column-settings vs-norm)]
    (let [resolved-cs (reduce-kv accumulate-converted-column-settings {} col-settings)]
      (pull-unresolved-names-up vs-norm [::mb.viz/column-settings] resolved-cs))
    vs-norm))

(defn- resolve-table-column-field-ref [[f-type f-str f-md]]
  (if (names/fully-qualified-field-name? f-str)
    [f-type ((comp :field fully-qualified-name->context) f-str) f-md]
    [f-type f-str f-md]))

(defn- resolve-pivot-table-settings
  "Resolve the entries in a :pivot_table.column_split map (which is under a :visualization_settings map). These map entries
  may contain fully qualified field names, or even other cards. In case of an unresolved name (i.e. a card that hasn't
  yet been loaded), we will track it under ::unresolved-names and revisit on the next pass."
  [vs-norm]
  (if (:pivot_table.column_split vs-norm)
    (letfn [(resolve-vec [pivot vec-type]
              (update-in pivot [:pivot_table.column_split vec-type] (fn [tbl-vecs]
                                                                      (mapv resolve-table-column-field-ref tbl-vecs))))]
      (-> vs-norm
          (resolve-vec :rows)
          (resolve-vec :columns)))
    vs-norm))

(defn- resolve-table-columns
  "Resolve the :table.columns key from a :visualization_settings map, which may contain fully qualified field names.
  Such fully qualified names will be converted to the numeric field ID before being filled into the loaded card. Only
  other field names (not cards, or other collection based entity types) should be referenced here, so there is no need
  to detect or track ::unresolved-names."
  [vs-norm]
  (if (::mb.viz/table-columns vs-norm)
    (letfn [(resolve-field-id [tbl-col]
              (update tbl-col ::mb.viz/table-column-field-ref resolve-table-column-field-ref))]
      (update vs-norm ::mb.viz/table-columns (fn [tbl-cols]
                                               (mapv resolve-field-id tbl-cols))))
    vs-norm))

(defn- resolve-visualization-settings
  "Resolve all references from a :visualization_settings map, the various submaps of which may contain:
    - fully qualified field names
    - fully qualified card or dashboard names

  Any unresolved entities from this resolution process will be tracked via ::unresolved-named so that the card or
  dashboard card holding these visualization settings can be revisited in a future pass."
  [entity]
  (if-let [viz-settings (:visualization_settings entity)]
    (let [resolved-vs (-> (mb.viz/db->norm viz-settings)
                          resolve-top-level-click-behavior
                          resolve-column-settings
                          resolve-table-columns
                          resolve-pivot-table-settings
                          mb.viz/norm->db)]
      (pull-unresolved-names-up entity [:visualization_settings] resolved-vs))
    entity))

(defn- resolve-dashboard-parameters
  [parameters]
  (for [p parameters]
    ;; Note: not using the full ::unresolved-names functionality here because this is a fix
    ;; for a deprecated feature
    (m/update-existing-in p [:values_source_config :card_id] fully-qualified-name->card-id)))

(defn load-dashboards
  "Loads `dashboards` (which is a sequence of maps parsed from a YAML dump of dashboards) in a given `context`."
  {:added "0.40.0"}
  [context dashboards]
  (let [dashboard-ids   (maybe-upsert-many! context Dashboard
                                            (for [dashboard dashboards]
                                              (-> dashboard
                                                  (update :parameters resolve-dashboard-parameters)
                                                  (dissoc :dashboard_cards)
                                                  (assoc :collection_id (:collection context)
                                                         :creator_id    (default-user-id)))))
        ;; MEGA HACK -- if `load` is ran with `--mode update` we should delete any Cards that were removed from a
        ;; Dashboard (according to #20786). However there are literally zero facilities for doing this sort of thing in
        ;; the current dump/load codebase. So for now we'll just delete ALL DashboardCards for the dumped Dashboard when
        ;; running with `--mode update` and recreate them from the serialized definitions. This is definitely a wack way
        ;; of doing things but no one actually understands how this code is supposed to work so this will have to do
        ;; until we can come in here and clean things up. -- Cam 2022-03-24
        _               (when (and (= (:mode context) :update)
                                   (seq dashboard-ids))
                          (t2/delete! DashboardCard :dashboard_id [:in (set dashboard-ids)]))
        dashboard-cards (map :dashboard_cards dashboards)
        ;; a function that prepares a dash card for insertion, while also validating to ensure the underlying
        ;; card_id could be resolved from the fully qualified name
        prepare-card-fn (fn [dash-idx dashboard-id acc card-idx card]
                          (let [proc-card  (-> card
                                               (update-existing-capture-missing :card_id fully-qualified-name->card-id)
                                               (assoc :dashboard_id dashboard-id))
                                new-pm     (update-card-parameter-mappings (:parameter_mappings proc-card))
                                with-pm    (pull-unresolved-names-up proc-card [:parameter_mappings] new-pm)
                                with-viz   (resolve-visualization-settings with-pm)]
                            (if-let [unresolved (::unresolved-names with-viz)]
                              ;; prepend the dashboard card index and :visualization_settings to each unresolved
                              ;; name path for better debugging
                              (let [add-keys         [:dashboard_cards card-idx :visualization_settings]
                                    fixed-names      (m/map-vals #(concat add-keys %) unresolved)
                                    with-fixed-names (assoc with-viz ::unresolved-names fixed-names)]
                                (-> acc
                                    (update ::revisit (fn [revisit-map]
                                                        (update revisit-map dash-idx #(cons with-fixed-names %))))
                                    ;; index means something different here than in the Card case (it's actually the index
                                    ;; of the dashboard)
                                    (update ::revisit-index #(conj % dash-idx))))
                              (update acc ::process #(conj % with-viz)))))
        prep-init-acc   {::process [] ::revisit-index #{} ::revisit {}}
        filtered-cards  (reduce-kv
                         (fn [acc idx [cards dash-id]]
                           (if dash-id
                             (let [res (reduce-kv (partial prepare-card-fn idx dash-id) prep-init-acc (vec cards))]
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
      (when (seq revisit-dashboards)
        (let [revisit-map    (::revisit filtered-cards)
              revisit-inf-fn (fn [[dash-idx dashcards]]
                               (format
                                "For dashboard %s:%n%s"
                                (->> dash-idx (nth dashboards) :name)
                                (str/join "\n" (map unresolved-names->string dashcards))))]
          (log/infof
           "Unresolved references found for dashboard cards in collection %d; will reload after first pass%n%s%n"
           (:collection context)
           (str/join "\n" (map revisit-inf-fn revisit-map)))
          (fn []
            (log/infof
             "Retrying dashboards for collection %s: %s"
             (or (:collection context) "root")
             (str/join ", " (map :name revisit-dashboards)))
            (load-dashboards (assoc context :mode :update) revisit-dashboards)))))))

(defmethod load "dashboards"
  [path context]
  (binding [names/*suppress-log-name-lookup-exception* true]
    (load-dashboards context (slurp-dir path))))

(defn- load-pulses [pulses context]
  (let [cards       (map :cards pulses)
        channels    (map :channels pulses)
        pulse-ids   (maybe-upsert-many! context Pulse
                      (for [pulse pulses]
                        (-> pulse
                            (assoc :collection_id (:collection context)
                                   :creator_id    (default-user-id))
                            (dissoc :channels :cards))))
        pulse-cards (for [[cards pulse-id pulse-idx] (map vector cards pulse-ids (range 0 (count pulse-ids)))
                          card             cards
                          :when pulse-id]
                      (-> card
                          (assoc :pulse_id pulse-id)
                          ;; gather the pulse's name and index for easier bookkeeping later
                          (assoc ::pulse-index pulse-idx)
                          (assoc ::pulse-name (:name (nth pulses pulse-idx)))
                          (update-in-capture-missing [:card_id] fully-qualified-name->card-id)))
        grouped     (group-by #(empty? (::unresolved-names %)) pulse-cards)
        process     (get grouped true)
        revisit     (get grouped false)]
    (maybe-upsert-many! context PulseCard (map #(dissoc % ::pulse-index ::pulse-name) process))
    (maybe-upsert-many! context PulseChannel
      (for [[channels pulse-id] (map vector channels pulse-ids)
            channel             channels
            :when pulse-id]
        (assoc channel :pulse_id pulse-id)))
    (when (seq revisit)
      (let [revisit-info-map (group-by ::pulse-name revisit)]
        (log/infof "Unresolved references for pulses in collection %s; will reload after first pass complete:%n%s%n"
                   (or (:collection context) "root")
                   (str/join "\n" (map
                                   (fn [[pulse-name revisit-cards]]
                                     (format " for %s:%n%s"
                                           pulse-name
                                           (str/join "\n" (map (comp unresolved-names->string #(into {} %)) revisit-cards))))
                                   revisit-info-map)))
        (fn []
          (log/infof "Reloading pulses from collection %d" (:collection context))
          (let [pulse-indexes (map ::pulse-index revisit)]
            (load-pulses (map (partial nth pulses) pulse-indexes) (assoc context :mode :update))))))))

(defmethod load "pulses"
  [path context]
  (binding [names/*suppress-log-name-lookup-exception* true]
    (load-pulses (slurp-dir path) context)))

(defn- resolve-source-query [query]
  (if (:source-query query)
    (update-in-capture-missing query [:source-query] resolve-source-query)
    query))

(defn- source-card
  [fully-qualified-name]
  (try
    (-> (fully-qualified-name->context fully-qualified-name) :card)
    (catch Throwable e
      (log/warn e (trs "Could not find context for fully qualified card name {0}" fully-qualified-name)))))

(defn- resolve-snippet
  [fully-qualified-name]
  (try
    (-> (fully-qualified-name->context fully-qualified-name) :snippet)
    (catch Throwable e
      (log/debug e (trs "Could not find context for fully qualified snippet name {0}" fully-qualified-name)))))

(defn- resolve-native
  [card]
  (let [ks                [:dataset_query :native :template-tags]
        template-tags     (get-in card ks)
        new-template-tags (reduce-kv
                           (fn [m k v]
                             (let [new-v (-> (update-existing-capture-missing v :card-id source-card)
                                             (update-existing-capture-missing :snippet-id resolve-snippet))]
                               (pull-unresolved-names-up m [k] new-v)))
                           {}
                           template-tags)]
    (pull-unresolved-names-up card ks new-template-tags)))

(defn- resolve-card-dataset-query [card]
  (let [ks    [:dataset_query :query]
        new-q (update-in-capture-missing card ks resolve-source-query)]
    (-> (pull-unresolved-names-up card ks (get-in new-q ks))
        (gather-all-unresolved-names))))

(defn- resolve-card [card context]
  (-> card
      (update :table_id (comp :table fully-qualified-name->context))
      (update :database_id (comp :database fully-qualified-name->context))
      (update :dataset_query mbql-fully-qualified-names->ids)
      (assoc :creator_id    (default-user-id)
             :collection_id (:collection context))
      (update-in [:dataset_query :database] (comp :database fully-qualified-name->context))
      resolve-visualization-settings
      (cond->
          (-> card
              :dataset_query
              :type
              mbql.u/normalize-token
              (= :query)) resolve-card-dataset-query
          (-> card
              :dataset_query
              :native
              :template-tags
              not-empty) (resolve-native))))

(defn- make-dummy-card
  "Make a dummy card for first pass insertion"
  [card]
  (-> card
      (assoc :dataset_query {:type     :native
                             :native   {:query "-- DUMMY QUERY FOR SERIALIZATION FIRST PASS INSERT"}
                             :database (:database_id card)})
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
                            {::revisit [] ::revisit-index #{} ::process []}
                            (vec resolved-cards))
        dummy-insert-cards (not-empty (::revisit grouped-cards))
        process-cards      (::process grouped-cards)]
    (maybe-upsert-many! context Card process-cards)
    (when dummy-insert-cards
      (let [dummy-inserted-ids (maybe-upsert-many!
                                context
                                Card
                                (map make-dummy-card dummy-insert-cards))
            id-and-cards       (map vector dummy-insert-cards dummy-inserted-ids)
            retry-info-fn      (fn [[card card-id]]
                                 (unresolved-names->string card card-id))]
        (log/infof
         "Unresolved references found for cards in collection %d; will reload after first pass%n%s%n"
         (:collection context)
         (str/join "\n" (map retry-info-fn id-and-cards)))
        (fn []
          (log/infof "Attempting to reload cards in collection %d" (:collection context))
          (let [revisit-indexes (::revisit-index grouped-cards)]
            (load-cards (assoc context :mode :update) paths (mapv (partial nth cards) revisit-indexes))))))))

(defmethod load "cards"
  [path context]
  (binding [names/*suppress-log-name-lookup-exception* true]
    (load-cards context (list-dirs path) nil)))

(defn- pre-insert-user
  "A function called on each User instance before it is inserted (via upsert)."
  [user]
  (log/infof "User with email %s is new to target DB; setting a random password" (:email user))
  (assoc user :password (str (UUID/randomUUID))))

;; leaving comment out for now (deliberately), because this will send a password reset email to newly inserted users
;; when enabled in a future release; see `defmethod load "users"` below
#_(defn- post-insert-user
    "A function called on the ID of each `User` instance after it is inserted (via upsert)."
    [user-id]
    (when-let [{email :email, google-auth? :google_auth, is-active? :is_active}
               (t2/select-one [User :email :google_auth :is_active] :id user-id)]
      (let [reset-token        (user/set-password-reset-token! user-id)
            site-url           (public-settings/site-url)
            password-reset-url (str site-url "/auth/reset_password/" reset-token)
            ;; in a web server context, the server-name ultimately comes from ServletRequest/getServerName
            ;; (i.e. the Java class, via Ring); this is the closest approximation in our batch context
            server-name        (.getHost (URL. site-url))]
        (let [email-res (email/send-password-reset-email! email google-auth? server-name password-reset-url is-active?)]
          (if (:error email-res)
            (log/infof "Failed to send password reset email generated for user ID %d (%s): %s"
                       user-id
                       email
                       (:message email-res))
            (log/infof "Password reset email generated for user ID %d (%s)" user-id email)))
        user-id)))

(defmethod load "users"
  [path context]
  ;; Currently we only serialize the new owner user, so it's fine to ignore mode setting
  ;; add :post-insert-fn post-insert-user back to start sending password reset emails
  (maybe-upsert-many! (assoc context :pre-insert-fn pre-insert-user) User
    (for [user (slurp-dir path)]
      (dissoc user :password))))

(defn- derive-location
  [context]
  (if-let [parent-id (:collection context)]
    (str (t2/select-one-fn :location Collection :id parent-id) parent-id "/")
    "/"))

(defn- make-reload-fn [all-results]
  (let [all-fns (filter fn? all-results)]
    (when (seq all-fns)
      (let [new-fns (doall all-fns)]
        (fn []
          (make-reload-fn (for [reload-fn new-fns]
                            (reload-fn))))))))

(defn- load-collections
  [path context]
  (let [subdirs      (list-dirs path)
        by-ns        (group-by #(let [[_ coll-ns] (re-matches #".*/:([^:/]+)" %)]
                                  coll-ns)
                               subdirs)
        grouped      (group-by (comp nil? first) by-ns)
        ns-paths     (get grouped false)
        entity-paths (->> (get grouped true)
                          (map last)
                          first)
        results      (for [path entity-paths]
                       (let [context (assoc context
                                       :collection (->> (slurp-dir path)
                                                        (map #(assoc % :location  (derive-location context)
                                                                       :namespace (-> context
                                                                                      :collection-namespace)))
                                                        (maybe-upsert-many! context Collection)
                                                        first))]
                         (log/infof "Processing collection at path %s" path)
                         [(load (str path "/collections") context)
                          (load (str path "/cards") context)
                          (load (str path "/pulses") context)
                          (load (str path "/dashboards") context)
                          (load (str path "/snippets") context)]))
        load-ns-fns  (for [[coll-ns [coll-ns-path]] ns-paths]
                       (do (log/infof "Loading %s namespace for collection at path %s" coll-ns coll-ns-path)
                           (load-collections coll-ns-path (assoc context :collection-namespace coll-ns))))]
    (make-reload-fn (concat (apply concat results) ; these are each sequences, so need to flatten those first
                            load-ns-fns))))

(defmethod load "collections"
  [path context]
  (load-collections path context))

(defn- prepare-snippet [context snippet]
  (assoc snippet :creator_id    (default-user-id)
                 :collection_id (:collection context)))

(defmethod load "snippets"
  [path context]
  (let [paths       (list-dirs path)
        snippets    (map (partial prepare-snippet context) (slurp-many paths))]
    (maybe-upsert-many! context NativeQuerySnippet snippets)))

(defn load-settings
  "Load a dump of settings."
  [path context]
  (doseq [[k v] (yaml/from-file (str path "/settings.yaml"))
          :when (or (= context :update)
                    (nil? (setting/get-value-of-type :string k)))]
    (setting/set-value-of-type! :string k v)))

(defn compatible?
  "Is dump at path `path` compatible with the currently running version of Metabase?"
  [path]
  (-> (str path "/manifest.yaml")
      yaml/from-file
      :metabase-version
      (= config/mb-version-info)))

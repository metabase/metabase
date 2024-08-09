(ns metabase-enterprise.serialization.serialize
  "Transform entity into a form suitable for serialization."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.serialization.names :refer [fully-qualified-name]]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.card :refer [Card]]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.dashboard-card :refer [DashboardCard]]
   [metabase.models.dashboard-card-series :refer [DashboardCardSeries]]
   [metabase.models.database :as database :refer [Database]]
   [metabase.models.dimension :refer [Dimension]]
   [metabase.models.field :as field :refer [Field]]
   [metabase.models.interface :as mi]
   [metabase.models.legacy-metric :refer [LegacyMetric]]
   [metabase.models.native-query-snippet :refer [NativeQuerySnippet]]
   [metabase.models.pulse :refer [Pulse]]
   [metabase.models.pulse-card :refer [PulseCard]]
   [metabase.models.pulse-channel :refer [PulseChannel]]
   [metabase.models.segment :refer [Segment]]
   [metabase.models.table :refer [Table]]
   [metabase.models.user :refer [User]]
   [metabase.shared.models.visualization-settings :as mb.viz]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:const ^Long serialization-protocol-version
  "Current serialization protocol version.

  This gets stored with each dump, so we can correctly recover old dumps."
  ;; version 2 - start adding namespace portion to /collections/ paths
  2)

(def ^:dynamic *include-entity-id*
  "If entity_id should be included in v1 serialization dump"
  false)

(def ^:private ^{:arglists '([form])} mbql-entity-reference?
  "Is given form an MBQL entity reference?"
  (partial mbql.normalize/is-clause? #{:field :field-id :fk-> :metric :segment}))

(defn- mbql-id->fully-qualified-name
  [mbql]
  (-> mbql
      mbql.normalize/normalize-tokens
      (lib.util.match/replace
        ;; `integer?` guard is here to make the operation idempotent
        [:field (id :guard integer?) opts]
        [:field (fully-qualified-name Field id) (mbql-id->fully-qualified-name opts)]

        ;; field-id is still used within parameter mapping dimensions
        ;; example relevant clause - [:dimension [:fk-> [:field-id 1] [:field-id 2]]]
        [:field-id (id :guard integer?)]
        [:field-id (fully-qualified-name Field id)]

        ;; source-field is also used within parameter mapping dimensions
        ;; example relevant clause - [:field 2 {:source-field 1}]
        {:source-field (id :guard integer?)}
        (assoc &match :source-field (fully-qualified-name Field id))

        [:metric (id :guard integer?)]
        [:metric (fully-qualified-name LegacyMetric id)]

        [:segment (id :guard integer?)]
        [:segment (fully-qualified-name Segment id)])))

(defn- ids->fully-qualified-names
  [entity]
  (lib.util.match/replace entity
    mbql-entity-reference?
    (mbql-id->fully-qualified-name &match)

    map?
    (as-> &match entity
      (m/update-existing entity :database (fn [db-id]
                                            (if (= db-id lib.schema.id/saved-questions-virtual-database-id)
                                              "database/__virtual"
                                              (fully-qualified-name Database db-id))))
      (m/update-existing entity :card_id (partial fully-qualified-name Card)) ; attibutes that refer to db fields use _
      (m/update-existing entity :card-id (partial fully-qualified-name Card)) ; template-tags use dash
      (m/update-existing entity :source-table (fn [source-table]
                                                (if (and (string? source-table)
                                                         (str/starts-with? source-table "card__"))
                                                  (fully-qualified-name Card (-> source-table
                                                                                 (str/split #"__")
                                                                                 second
                                                                                 Integer/parseInt))
                                                  (fully-qualified-name Table source-table))))
      (m/update-existing entity :breakout (fn [breakout]
                                            (map mbql-id->fully-qualified-name breakout)))
      (m/update-existing entity :aggregation (fn [aggregation]
                                               (m/map-vals mbql-id->fully-qualified-name aggregation)))
      (m/update-existing entity :filter (fn [filter]
                                          (m/map-vals mbql-id->fully-qualified-name filter)))
      (m/update-existing entity ::mb.viz/param-mapping-source (partial fully-qualified-name Field))
      (m/update-existing entity :snippet-id (partial fully-qualified-name NativeQuerySnippet))
      (m/map-vals ids->fully-qualified-names entity))))

(defn- strip-crud
  "Removes unneeded fields that can either be reconstructed from context or are meaningless
   (eg. :created_at)."
  [entity]
  (cond-> (dissoc entity :id :creator_id :created_at :updated_at :db_id :location :last_used_at
                  :dashboard_id :fields_hash :personal_owner_id :made_public_by_id :collection_id
                  :pulse_id :result_metadata :action_id)
    (not *include-entity-id*)   (dissoc :entity_id)
    (some #(instance? % entity) (map type [LegacyMetric Field Segment])) (dissoc :table_id)))

(defmulti ^:private serialize-one
  {:arglists '([instance])}
  mi/model)

(def ^{:arglists '([entity])} serialize
  "Serialize entity `entity`."
  (comp ids->fully-qualified-names strip-crud serialize-one))

(defmethod serialize-one :default
  [instance]
  instance)

(defmethod serialize-one Database
  [db]
  (dissoc db :features))

(defmethod serialize-one Field
  [field]
  (let [field (-> field
                  (update :parent_id (partial fully-qualified-name Field))
                  (update :fk_target_field_id (partial fully-qualified-name Field)))]
    (if (contains? field :values)
      (update field :values u/select-non-nil-keys [:values :human_readable_values])
      (assoc field :values (-> field
                               field/values
                               (u/select-non-nil-keys [:values :human_readable_values]))))))

(defn- convert-column-settings-key [k]
  (if-let [field-id (::mb.viz/field-id k)]
    (-> (t2/select-one Field :id field-id)
        fully-qualified-name
        mb.viz/field-str->column-ref)
    k))

(defn- convert-param-mapping-key
  "The `k` is something like [:dimension [:fk-> [:field-id <id1>] [:field-id <id2]]]"
  [k]
  (mbql-id->fully-qualified-name k))

(defn- convert-param-ref [new-id param-ref]
  (cond-> param-ref
    (= "dimension" (::mb.viz/param-ref-type param-ref)) ids->fully-qualified-names
    (some? new-id) (update ::mb.viz/param-ref-id new-id)))

(defn- convert-param-mapping-val [new-id v]
  (-> v
      (m/update-existing ::mb.viz/param-mapping-source (partial convert-param-ref new-id))
      (m/update-existing ::mb.viz/param-mapping-target (partial convert-param-ref new-id))
      (m/assoc-some ::mb.viz/param-mapping-id (or new-id (::mb.viz/param-mapping-id v)))))

(defn- convert-parameter-mapping [param-mapping]
  (if (nil? param-mapping)
    nil
    (reduce-kv (fn [acc k v]
                 (assoc acc (convert-param-mapping-key k)
                            (convert-param-mapping-val nil v))) {} param-mapping)))

(defn- convert-click-behavior [{:keys [::mb.viz/link-type ::mb.viz/link-target-id] :as click}]
  (-> (if-let [new-target-id (case link-type
                               ::mb.viz/card      (-> (t2/select-one Card :id link-target-id)
                                                      fully-qualified-name)
                               ::mb.viz/dashboard (-> (t2/select-one Dashboard :id link-target-id)
                                                      fully-qualified-name)
                               nil)]
        (assoc click ::mb.viz/link-target-id new-target-id)
        click)
      (m/update-existing ::mb.viz/parameter-mapping convert-parameter-mapping)))

(defn- convert-column-settings-value [{:keys [::mb.viz/click-behavior] :as v}]
  (cond (not-empty click-behavior) (assoc v ::mb.viz/click-behavior (convert-click-behavior click-behavior))
        :else v))

(defn- convert-column-settings [acc k v]
  (assoc acc (convert-column-settings-key k) (convert-column-settings-value v)))

(defn- convert-viz-settings [viz-settings]
  (-> (mb.viz/db->norm viz-settings)
      (m/update-existing ::mb.viz/column-settings (fn [col-settings]
                                                    (reduce-kv convert-column-settings {} col-settings)))
      (m/update-existing ::mb.viz/click-behavior convert-click-behavior)
      mb.viz/norm->db))

(defn- dashboard-cards-for-dashboard
  [dashboard]
  (let [dashboard-cards   (t2/select DashboardCard :dashboard_id (u/the-id dashboard))
        series            (when (not-empty dashboard-cards)
                            (t2/select DashboardCardSeries
                              :dashboardcard_id [:in (map u/the-id dashboard-cards)]))]
    (for [dashboard-card dashboard-cards]
      (-> dashboard-card
          (assoc :series (for [series series
                               :when (= (:dashboardcard_id series) (u/the-id dashboard-card))]
                           (-> series
                               (update :card_id (partial fully-qualified-name Card))
                               (dissoc :id :dashboardcard_id))))
          (assoc :visualization_settings (convert-viz-settings (:visualization_settings dashboard-card)))
          strip-crud))))

(defmethod serialize-one Dashboard
  [dashboard]
  (assoc dashboard :dashboard_cards (dashboard-cards-for-dashboard dashboard)))

(defmethod serialize-one Card
  [card]
  (-> card
      (m/update-existing :table_id (partial fully-qualified-name Table))
      (update :database_id (partial fully-qualified-name Database))
      (m/update-existing :visualization_settings convert-viz-settings)))

(defmethod serialize-one Pulse
  [pulse]
  (assoc pulse
    :cards    (for [card (t2/select PulseCard :pulse_id (u/the-id pulse))]
                (-> card
                    (dissoc :id :pulse_id)
                    (update :card_id (partial fully-qualified-name Card))))
    :channels (for [channel (t2/select PulseChannel :pulse_id (u/the-id pulse))]
                (strip-crud channel))))

(defmethod serialize-one User
  [user]
  (select-keys user [:first_name :last_name :email :is_superuser]))

(defmethod serialize-one Dimension
  [dimension]
  (-> dimension
      (update :field_id (partial fully-qualified-name Field))
      (update :human_readable_field_id (partial fully-qualified-name Field))))

(defmethod serialize-one NativeQuerySnippet
  [snippet]
  (select-keys snippet [:name :description :content]))

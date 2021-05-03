(ns metabase-enterprise.serialization.serialize
  "Transform entity into a form suitable for serialization."
  (:require [clojure.string :as str]
            [medley.core :as m]
            [metabase-enterprise.serialization.names :refer [fully-qualified-name]]
            [metabase.mbql.normalize :as mbql.normalize]
            [metabase.mbql.schema :as mbql.s]
            [metabase.mbql.util :as mbql.util]
            [metabase.models.card :refer [Card]]
            [metabase.models.dashboard :refer [Dashboard]]
            [metabase.models.dashboard-card :refer [DashboardCard]]
            [metabase.models.dashboard-card-series :refer [DashboardCardSeries]]
            [metabase.models.database :as database :refer [Database]]
            [metabase.models.dependency :refer [Dependency]]
            [metabase.models.dimension :refer [Dimension]]
            [metabase.models.field :as field :refer [Field]]
            [metabase.models.metric :refer [Metric]]
            [metabase.models.pulse :refer [Pulse]]
            [metabase.models.pulse-card :refer [PulseCard]]
            [metabase.models.pulse-channel :refer [PulseChannel]]
            [metabase.models.segment :refer [Segment]]
            [metabase.models.table :refer [Table]]
            [metabase.models.user :refer [User]]
            [metabase.util :as u]
            [toucan.db :as db]))

(def ^:const ^Long serialization-protocol-version
  "Current serialization protocol version.

  This gets stored with each dump, so we can correctly recover old dumps."
  1)

(def ^:private ^{:arglists '([form])} mbql-entity-reference?
  "Is given form an MBQL entity reference?"
  (partial mbql.normalize/is-clause? #{:field-id :fk-> :metric :segment}))

(defn- mbql-id->fully-qualified-name
  [mbql]
  (-> mbql
      mbql.normalize/normalize-tokens
      (mbql.util/replace
        ;; `integer?` guard is here to make the operation idempotent
        [:field (id :guard integer?) opts]
        [:field (fully-qualified-name Field id) opts]

        [:metric (id :guard integer?)]
        [:metric (fully-qualified-name Metric id)]

        [:segment (id :guard integer?)]
        [:segment (fully-qualified-name Segment id)])))

(defn- ids->fully-qualified-names
  [entity]
  (mbql.util/replace entity
    mbql-entity-reference?
    (mbql-id->fully-qualified-name &match)

    map?
    (as-> &match entity
      (m/update-existing entity :database (fn [db-id]
                                            (if (= db-id mbql.s/saved-questions-virtual-database-id)
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
      (m/map-vals ids->fully-qualified-names entity))))

(defn- strip-crud
  "Removes unneeded fields that can either be reconstructed from context or are meaningless
   (eg. :created_at)."
  [entity]
  (cond-> (dissoc entity :id :creator_id :created_at :updated_at :db_id :location
                  :dashboard_id :fields_hash :personal_owner_id :made_public_by_id :collection_id
                  :pulse_id :result_metadata)
    (some #(instance? % entity) (map type [Metric Field Segment])) (dissoc :table_id)))

(defmulti ^:private serialize-one
  type)

(def ^{:arglists '([entity])} serialize
  "Serialize entity `entity`."
  (comp ids->fully-qualified-names strip-crud serialize-one))

(defmethod serialize-one :default
  [entity]
  entity)

(defmethod serialize-one (type Database)
  [db]
  (dissoc db :features))

(defmethod serialize-one (type Field)
  [field]
  (let [field (-> field
                  (update :parent_id (partial fully-qualified-name Field))
                  (update :fk_target_field_id (partial fully-qualified-name Field)))]
    (if (contains? field :values)
      (update field :values u/select-non-nil-keys [:values :human_readable_values])
      (assoc field :values (-> field
                               field/values
                               (u/select-non-nil-keys [:values :human_readable_values]))))))

(defn- dashboard-cards-for-dashboard
  [dashboard]
  (let [dashboard-cards (db/select DashboardCard :dashboard_id (u/the-id dashboard))
        series          (when (not-empty dashboard-cards)
                          (db/select DashboardCardSeries
                            :dashboardcard_id [:in (map u/the-id dashboard-cards)]))]
    (for [dashboard-card dashboard-cards]
      (-> dashboard-card
          (assoc :series (for [series series
                               :when (= (:dashboardcard_id series) (u/the-id dashboard-card))]
                           (-> series
                               (update :card_id (partial fully-qualified-name Card))
                               (dissoc :id :dashboardcard_id))))
          strip-crud))))

(defmethod serialize-one (type Dashboard)
  [dashboard]
  (assoc dashboard :dashboard_cards (dashboard-cards-for-dashboard dashboard)))

(defmethod serialize-one (type Card)
  [card]
  (-> card
      (m/update-existing :table_id (partial fully-qualified-name Table))
      (update :database_id (partial fully-qualified-name Database))))

(defmethod serialize-one (type Pulse)
  [pulse]
  (assoc pulse
    :cards    (for [card (db/select PulseCard :pulse_id (u/the-id pulse))]
                (-> card
                    (dissoc :id :pulse_id)
                    (update :card_id (partial fully-qualified-name Card))))
    :channels (for [channel (db/select PulseChannel :pulse_id (u/the-id pulse))]
                (strip-crud channel))))

(defmethod serialize-one (type User)
  [user]
  (select-keys user [:first_name :last_name :email :is_superuser]))

(defmethod serialize-one (type Dimension)
  [dimension]
  (-> dimension
      (update :field_id (partial fully-qualified-name Field))
      (update :human_readable_field_id (partial fully-qualified-name Field))))

(defmethod serialize-one (type Dependency)
  [dependency]
  (-> dependency
      (select-keys [:dependent_on_id :model_id])
      (update :dependent_on_id (partial fully-qualified-name (-> dependency :dependent_on_model symbol)))
      (update :model_id (partial fully-qualified-name (-> dependency :model symbol)))))

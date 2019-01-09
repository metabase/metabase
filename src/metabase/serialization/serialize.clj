(ns metabase.serialization.serialize
  "Transform entity into a form suitable for serialization."
  (:require [clojure.string :as str]
            [medley.core :as m]
            [metabase.mbql
             [normalize :as mbql.normalize]
             [util :as mbql.util]]
            [metabase.models
             [card :refer [Card]]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [dashboard-card-series :refer [DashboardCardSeries]]
             [database :refer [Database] :as database]
             [dependency :refer [Dependency]]
             [dimension :refer [Dimension]]
             [field :refer [Field] :as field]
             [metric :refer [Metric]]
             [pulse :refer [Pulse]]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :refer [PulseChannel]]
             [segment :refer [Segment]]
             [table :refer [Table]]
             [user :refer [User]]]
            [metabase.serialization.names :refer [fully-qualified-name]]
            [metabase.util :as u]
            [toucan.db :as db]))

(def ^:const ^Long serialization-protocol-version
  "Current serialization protocol version.

  This gets stored with each dump, so we can correctly recover old dumps."
  1)

(def ^:private ^{:arglists '([form])} mbql-entity-reference?
  "Is given form an MBQL entity reference?"
  (partial mbql.normalize/is-clause? #{:field-id :fk-> :metric :segment}))

(defn- mbql-entity-id->fully-qualified-name
  [mbql]
  (-> mbql
      mbql.normalize/normalize
      (mbql.util/replace
        ;; `integer?` guard is here to make the operation idempotent
        [:field-id (id :guard integer?)]
        [:field-id (fully-qualified-name Field id)]

        [:metric (id :guard integer?)]
        [:metric (fully-qualified-name Metric id)]

        [:segment (id :guard integer?)]
        [:segment (fully-qualified-name Segment id)]

        ;; Legacy form with raw IDs
        [:fk-> (from :guard integer?) (to :guard integer?)]
        [:fk-> [:field-id (fully-qualified-name Field from)]
         [:field-id (fully-qualified-name Field to)]])))

(defn- ids->fully-qualified-names
  [entity]
  (mbql.util/replace entity
    mbql-entity-reference?
    (mbql-entity-id->fully-qualified-name &match)

    map?
    (as-> &match entity
      (u/update-when entity :database (fn [db-id]
                                        (if (= db-id database/virtual-id)
                                          "database/__virtual"
                                          (fully-qualified-name Database db-id))))
      (u/update-when entity :card_id (partial fully-qualified-name Card))
      (u/update-when entity :source-table (fn [source-table]
                                            (if (and (string? source-table)
                                                     (str/starts-with? source-table "card__"))
                                              (fully-qualified-name Card (-> source-table
                                                                             (str/split #"__")
                                                                             second
                                                                             Integer/parseInt))
                                              (fully-qualified-name Table source-table))))
      (m/map-vals ids->fully-qualified-names entity))))

(defn- strip-crud
  "Removes unneeded fields that can either be reconstructed from context or are meaningless
   (eg. :created_at)."
  [entity]
  (cond-> (dissoc entity :id :creator_id :created_at :updated_at :db_id :database_id :location
                  :dashboard_id :fields_hash :personal_owner_id :made_public_by_id :collection_id
                  :pulse_id)
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
  (if (contains? field :values)
    (update field :values u/select-non-nil-keys [:values :human_readable_values])
    (assoc field :values (-> field
                             field/values
                             (u/select-non-nil-keys [:values :human_readable_values])))))

(defn- dashboard-cards-for-dashboard
  [dashboard]
  (let [dashboard-cards (db/select DashboardCard :dashboard_id (u/get-id dashboard))
        series          (db/select DashboardCardSeries
                          :dashboardcard_id [:in (map u/get-id dashboard-cards)])]
    (for [dashboard-card dashboard-cards]
      (-> dashboard-card
          (assoc :series (for [series series
                               :when (= (:dashboardcard_id series) (u/get-id dashboard-card))]
                           (-> series
                               (update :card_id (partial fully-qualified-name Card))
                               (dissoc :id :dashboardcard_id))))
           strip-crud))))

(defmethod serialize-one (type Dashboard)
  [dashboard]
  (assoc dashboard :dashboard_cards (dashboard-cards-for-dashboard dashboard)))

(defmethod serialize-one (type Card)
  [card]
  (u/update-when card :table_id (partial fully-qualified-name Table)))

(defmethod serialize-one (type Pulse)
  [pulse]
  (assoc pulse
    :cards    (for [card (db/select PulseCard :pulse_id (u/get-id pulse))]
                (-> card
                    (dissoc :id :pulse_id)
                    (update :card_id (partial fully-qualified-name Card))))
    :channels (for [channel (db/select PulseChannel :pulse_id (u/get-id pulse))]
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

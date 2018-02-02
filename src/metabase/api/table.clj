(ns metabase.api.table
  "/api/table endpoints."
  (:require [clojure.tools.logging :as log]
            [compojure.core :refer [GET PUT POST]]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [sync :as sync]
             [util :as u]]
            [metabase.api.common :as api]
            [metabase.models
             [card :refer [Card]]
             [database :as database :refer [Database]]
             [field :refer [Field with-normal-values]]
             [field-values :refer [FieldValues] :as fv]
             [interface :as mi]
             [table :as table :refer [Table]]]
            [metabase.sync.field-values :as sync-field-values]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

;; TODO - I don't think this is used for anything any more
(def ^:private ^:deprecated TableEntityType
  "Schema for a valid table entity type."
  (apply s/enum (map name table/entity-types)))

(def ^:private TableVisibilityType
  "Schema for a valid table visibility type."
  (apply s/enum (map name table/visibility-types)))

(api/defendpoint GET "/"
  "Get all `Tables`."
  []
  (for [table (-> (db/select Table, :active true, {:order-by [[:name :asc]]})
                  (hydrate :db))
        :when (mi/can-read? table)]
    ;; if for some reason a Table doesn't have rows set then set it to 0 so UI doesn't barf.
    ;; TODO - should that be part of `post-select` instead?
    (update table :rows (fn [n]
                          (or n 0)))))

(api/defendpoint GET "/:id"
  "Get `Table` with ID."
  [id]
  (-> (api/read-check Table id)
      (hydrate :db :pk_field)))


(api/defendpoint PUT "/:id"
  "Update `Table` with ID."
  [id :as {{:keys [display_name entity_type visibility_type description caveats points_of_interest
                   show_in_getting_started], :as body} :body}]
  {display_name            (s/maybe su/NonBlankString)
   entity_type             (s/maybe TableEntityType)
   visibility_type         (s/maybe TableVisibilityType)
   description             (s/maybe su/NonBlankString)
   caveats                 (s/maybe su/NonBlankString)
   points_of_interest      (s/maybe su/NonBlankString)
   show_in_getting_started (s/maybe s/Bool)}
  (api/write-check Table id)
  (let [original-visibility-type (db/select-one-field :visibility_type Table :id id)]
    ;; always update visibility type; update display_name, show_in_getting_started, entity_type if non-nil; update
    ;; description and related fields if passed in
    (api/check-500
     (db/update! Table id
       (assoc (u/select-keys-when body
                :non-nil [:display_name :show_in_getting_started :entity_type]
                :present [:description :caveats :points_of_interest])
         :visibility_type visibility_type)))
    (let [updated-table   (Table id)
          now-visible?    (nil? (:visibility_type updated-table)) ; only Tables with `nil` visibility type are visible
          was-visible?    (nil? original-visibility-type)
          became-visible? (and now-visible? (not was-visible?))]
      (when became-visible?
        (log/info (u/format-color 'green "Table '%s' is now visible. Resyncing." (:name updated-table)))
        (sync/sync-table! updated-table))
      updated-table)))

(def ^:private dimension-options
  (let [default-entry ["Auto bin" ["default"]]]
    (zipmap (range)
            (concat
             (map (fn [[name param]]
                    {:name name
                     :mbql ["datetime-field" nil param]
                     :type "type/DateTime"})
                  ;; note the order of these options corresponds to the order they will be shown to the user in the UI
                  [["Minute" "minute"]
                   ["Hour" "hour"]
                   ["Day" "day"]
                   ["Week" "week"]
                   ["Month" "month"]
                   ["Quarter" "quarter"]
                   ["Year" "year"]
                   ["Minute of Hour" "minute-of-hour"]
                   ["Hour of Day" "hour-of-day"]
                   ["Day of Week" "day-of-week"]
                   ["Day of Month" "day-of-month"]
                   ["Day of Year" "day-of-year"]
                   ["Week of Year" "week-of-year"]
                   ["Month of Year" "month-of-year"]
                   ["Quarter of Year" "quarter-of-year"]])
             (conj
              (mapv (fn [[name params]]
                      {:name name
                       :mbql (apply vector "binning-strategy" nil params)
                       :type "type/Number"})
                    [default-entry
                     ["10 bins" ["num-bins" 10]]
                     ["50 bins" ["num-bins" 50]]
                     ["100 bins" ["num-bins" 100]]])
              {:name "Don't bin"
               :mbql nil
               :type "type/Number"})
             (conj
              (mapv (fn [[name params]]
                      {:name name
                       :mbql (apply vector "binning-strategy" nil params)
                       :type "type/Coordinate"})
                    [default-entry
                     ["Bin every 1 degree" ["bin-width" 1.0]]
                     ["Bin every 10 degrees" ["bin-width" 10.0]]
                     ["Bin every 20 degrees" ["bin-width" 20.0]]
                     ["Bin every 50 degrees" ["bin-width" 50.0]]])
              {:name "Don't bin"
               :mbql nil
               :type "type/Coordinate"})))))

(def ^:private dimension-options-for-response
  (m/map-kv (fn [k v]
              [(str k) v]) dimension-options))

(defn- create-dim-index-seq [dim-type]
  (->> dimension-options
       (m/filter-kv (fn [k v] (= (:type v) dim-type)))
       keys
       sort
       (map str)))

(def ^:private datetime-dimension-indexes
  (create-dim-index-seq "type/DateTime"))

(def ^:private numeric-dimension-indexes
  (create-dim-index-seq "type/Number"))

(def ^:private coordinate-dimension-indexes
  (create-dim-index-seq "type/Coordinate"))

(defn- dimension-index-for-type [dim-type pred]
  (first (m/find-first (fn [[k v]]
                         (and (= dim-type (:type v))
                              (pred v))) dimension-options-for-response)))

(def ^:private date-default-index
  (dimension-index-for-type "type/DateTime" #(= "Day" (:name %))))

(def ^:private numeric-default-index
  (dimension-index-for-type "type/Number" #(.contains ^String (:name %) "Auto bin")))

(def ^:private coordinate-default-index
  (dimension-index-for-type "type/Coordinate" #(.contains ^String (:name %) "Auto bin")))

(defn- supports-numeric-binning? [driver]
  (and driver (contains? (driver/features driver) :binning)))

(defn- supports-date-binning?
  "Time fields don't support binning, returns true if it's a DateTime field and not a time field"
  [{:keys [base_type special_type]}]
  (and (or (isa? base_type :type/DateTime)
           (isa? special_type :type/DateTime))
       (not (isa? base_type :type/Time))))

(defn- assoc-field-dimension-options [driver {:keys [base_type special_type fingerprint] :as field}]
  (let [{min_value :min, max_value :max} (get-in fingerprint [:type :type/Number])
        [default-option all-options] (cond

                                       (supports-date-binning? field)
                                       [date-default-index datetime-dimension-indexes]

                                       (and min_value max_value
                                            (isa? special_type :type/Coordinate)
                                            (supports-numeric-binning? driver))
                                       [coordinate-default-index coordinate-dimension-indexes]

                                       (and min_value max_value
                                            (isa? base_type :type/Number)
                                            (or (nil? special_type) (isa? special_type :type/Number))
                                            (supports-numeric-binning? driver))
                                       [numeric-default-index numeric-dimension-indexes]

                                       :else
                                       [nil []])]
    (assoc field
      :default_dimension_option default-option
      :dimension_options all-options)))

(defn- assoc-dimension-options [resp driver]
  (-> resp
      (assoc :dimension_options dimension-options-for-response)
      (update :fields (fn [fields]
                        (mapv #(assoc-field-dimension-options driver %) fields)))))

(defn- format-fields-for-response [resp]
  (update resp :fields
          (fn [fields]
            (for [{:keys [values] :as field} fields]
              (if (seq values)
                (update field :values fv/field-values->pairs)
                field)))))

(api/defendpoint GET "/:id/query_metadata"
  "Get metadata about a `Table` useful for running queries.
   Returns DB, fields, field FKs, and field values.

  By passing `include_sensitive_fields=true`, information *about* sensitive `Fields` will be returned; in no case will
  any of its corresponding values be returned. (This option is provided for use in the Admin Edit Metadata page)."
  [id include_sensitive_fields]
  {include_sensitive_fields (s/maybe su/BooleanString)}
  (let [table (api/read-check Table id)
        driver (driver/database-id->driver (:db_id table))]
    (-> table
        (hydrate :db [:fields :target :dimensions] :segments :metrics)
        (update :fields with-normal-values)
        (m/dissoc-in [:db :details])
        (assoc-dimension-options driver)
        format-fields-for-response
        (update-in [:fields] (if (Boolean/parseBoolean include_sensitive_fields)
                               ;; If someone passes include_sensitive_fields return hydrated :fields as-is
                               identity
                               ;; Otherwise filter out all :sensitive fields
                               (partial filter (fn [{:keys [visibility_type]}]
                                                 (not= (keyword visibility_type) :sensitive))))))))

(defn- card-result-metadata->virtual-fields
  "Return a sequence of 'virtual' fields metadata for the 'virtual' table for a Card in the Saved Questions 'virtual'
   database."
  [card-id database-id metadata]
  (let [add-field-dimension-options #(assoc-field-dimension-options (driver/database-id->driver database-id) %)]
    (for [col metadata]
      (-> col
          (update :base_type keyword)
          (assoc
              :table_id     (str "card__" card-id)
              :id           [:field-literal (:name col) (or (:base_type col) :type/*)]
              ;; don't return :special_type if it's a PK or FK because it confuses the frontend since it can't actually be
              ;; used that way IRL
              :special_type (when-let [special-type (keyword (:special_type col))]
                              (when-not (or (isa? special-type :type/PK)
                                            (isa? special-type :type/FK))
                                special-type)))
          add-field-dimension-options))))

(defn card->virtual-table
  "Return metadata for a 'virtual' table for a CARD in the Saved Questions 'virtual' database. Optionally include
   'virtual' fields as well."
  [{:keys [database_id] :as card} & {:keys [include-fields?]}]
  ;; if collection isn't already hydrated then do so
  (let [card (hydrate card :colllection)]
    (cond-> {:id           (str "card__" (u/get-id card))
             :db_id        database/virtual-id
             :display_name (:name card)
             :schema       (get-in card [:collection :name] "Everything else")
             :description  (:description card)}
      include-fields? (assoc :fields (card-result-metadata->virtual-fields (u/get-id card) database_id (:result_metadata card))))))

(api/defendpoint GET "/card__:id/query_metadata"
  "Return metadata for the 'virtual' table for a Card."
  [id]
  (let [{:keys [database_id] :as card } (db/select-one [Card :id :dataset_query :result_metadata :name :description :collection_id :database_id]
                                          :id id)]
    (-> card
        api/read-check
        (card->virtual-table :include-fields? true)
        (assoc-dimension-options (driver/database-id->driver database_id)))))

(api/defendpoint GET "/card__:id/fks"
  "Return FK info for the 'virtual' table for a Card. This is always empty, so this endpoint
   serves mainly as a placeholder to avoid having to change anything on the frontend."
  []
  []) ; return empty array


(api/defendpoint GET "/:id/fks"
  "Get all foreign keys whose destination is a `Field` that belongs to this `Table`."
  [id]
  (api/read-check Table id)
  (when-let [field-ids (seq (db/select-ids Field, :table_id id, :visibility_type [:not= "retired"], :active true))]
    (for [origin-field (db/select Field, :fk_target_field_id [:in field-ids], :active true)]
      ;; it's silly to be hydrating some of these tables/dbs
      {:relationship   :Mt1
       :origin_id      (:id origin-field)
       :origin         (hydrate origin-field [:table :db])
       :destination_id (:fk_target_field_id origin-field)
       :destination    (hydrate (Field (:fk_target_field_id origin-field)) :table)})))


(api/defendpoint POST "/:id/rescan_values"
  "Manually trigger an update for the FieldValues for the Fields belonging to this Table. Only applies to Fields that
   are eligible for FieldValues."
  [id]
  (api/check-superuser)
  ;; async so as not to block the UI
  (future
    (sync-field-values/update-field-values-for-table! (api/check-404 (Table id))))
  {:status :success})

(api/defendpoint POST "/:id/discard_values"
  "Discard the FieldValues belonging to the Fields in this Table. Only applies to fields that have FieldValues. If
   this Table's Database is set up to automatically sync FieldValues, they will be recreated during the next cycle."
  [id]
  (api/check-superuser)
  (when-let [field-ids (db/select-ids Field :table_id 212)]
    (db/simple-delete! FieldValues :id [:in field-ids]))
  {:status :success})


(api/define-routes)

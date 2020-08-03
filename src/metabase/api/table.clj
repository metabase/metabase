(ns metabase.api.table
  "/api/table endpoints."
  (:require [clojure.tools.logging :as log]
            [compojure.core :refer [GET POST PUT]]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [related :as related]
             [sync :as sync]
             [types :as types]
             [util :as u]]
            [metabase.api.common :as api]
            [metabase.driver.util :as driver.u]
            [metabase.models
             [card :refer [Card]]
             [field :refer [Field]]
             [field-values :as fv :refer [FieldValues]]
             [interface :as mi]
             [table :as table :refer [Table]]]
            [metabase.sync.field-values :as sync-field-values]
            [metabase.util
             [i18n :refer [deferred-tru trs tru]]
             [schema :as su]]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(def ^:private TableVisibilityType
  "Schema for a valid table visibility type."
  (apply s/enum (map name table/visibility-types)))

(def ^:private FieldOrder
  "Schema for a valid table field ordering."
  (apply s/enum (map name table/field-orderings)))

(api/defendpoint GET "/"
  "Get all `Tables`."
  []
  (as-> (db/select Table, :active true, {:order-by [[:name :asc]]}) tables
    (hydrate tables :db)
    (filterv mi/can-read? tables)))

(api/defendpoint GET "/:id"
  "Get `Table` with ID."
  [id]
  (-> (api/read-check Table id)
      (hydrate :db :pk_field)))

;; TODO: this should changed to `update-tables!` and update multiple tables in one db request
(defn- update-table!
  [id {:keys [visibility_type] :as body}]
  (let [table (Table id)]
    (api/write-check table)
    ;; always update visibility type; update display_name, show_in_getting_started, entity_type if non-nil; update
    ;; description and related fields if passed in
    (api/check-500
     (db/update! Table id
       (assoc (u/select-keys-when body
                :non-nil [:display_name :show_in_getting_started :entity_type :field_order]
                :present [:description :caveats :points_of_interest])
              :visibility_type visibility_type)))
    (let [updated-table        (Table id)
          changed-field-order? (not= (:field_order updated-table) (:field_order table))
          now-visible?         (nil? (:visibility_type updated-table)) ; only Tables with `nil` visibility type are visible
          was-visible?         (nil? (:visibility_type table))
          became-visible?      (and now-visible? (not was-visible?))]
      (when became-visible?
        (log/info (u/format-color 'green (trs "Table ''{0}'' is now visible. Resyncing." (:name updated-table))))
        (sync/sync-table! updated-table))
      (if changed-field-order?
        (do
          (table/update-field-positions! updated-table)
          (hydrate updated-table [:fields [:target :has_field_values] :dimensions :has_field_values]))
         updated-table))))

(api/defendpoint PUT "/:id"
  "Update `Table` with ID."
  [id :as {{:keys [display_name entity_type visibility_type description caveats points_of_interest
                   show_in_getting_started field_order], :as body} :body}]
  {display_name            (s/maybe su/NonBlankString)
   entity_type             (s/maybe su/EntityTypeKeywordOrString)
   visibility_type         (s/maybe TableVisibilityType)
   description             (s/maybe su/NonBlankString)
   caveats                 (s/maybe su/NonBlankString)
   points_of_interest      (s/maybe su/NonBlankString)
   show_in_getting_started (s/maybe s/Bool)
   field_order             (s/maybe FieldOrder)}
  (update-table! id body))

(api/defendpoint PUT "/"
  "Update all `Table` in `ids`."
  [:as {{:keys [ids display_name entity_type visibility_type description caveats points_of_interest
                show_in_getting_started], :as body} :body}]
  {ids                     (su/non-empty [su/IntGreaterThanZero])
   display_name            (s/maybe su/NonBlankString)
   entity_type             (s/maybe su/EntityTypeKeywordOrString)
   visibility_type         (s/maybe TableVisibilityType)
   description             (s/maybe su/NonBlankString)
   caveats                 (s/maybe su/NonBlankString)
   points_of_interest      (s/maybe su/NonBlankString)
   show_in_getting_started (s/maybe s/Bool)}
  (db/transaction
    (mapv #(update-table! % body) ids)))


(def ^:private auto-bin-str (deferred-tru "Auto bin"))
(def ^:private dont-bin-str (deferred-tru "Don''t bin"))
(def ^:private day-str (deferred-tru "Day"))

(def ^:private dimension-options
  (let [default-entry [auto-bin-str ["default"]]]
    (zipmap (range)
            (concat
             (map (fn [[name param]]
                    {:name name
                     :mbql ["datetime-field" nil param]
                     :type "type/DateTime"})
                  ;; note the order of these options corresponds to the order they will be shown to the user in the UI
                  [[(deferred-tru "Minute") "minute"]
                   [(deferred-tru "Hour") "hour"]
                   [day-str "day"]
                   [(deferred-tru "Week") "week"]
                   [(deferred-tru "Month") "month"]
                   [(deferred-tru "Quarter") "quarter"]
                   [(deferred-tru "Year") "year"]
                   [(deferred-tru "Minute of Hour") "minute-of-hour"]
                   [(deferred-tru "Hour of Day") "hour-of-day"]
                   [(deferred-tru "Day of Week") "day-of-week"]
                   [(deferred-tru "Day of Month") "day-of-month"]
                   [(deferred-tru "Day of Year") "day-of-year"]
                   [(deferred-tru "Week of Year") "week-of-year"]
                   [(deferred-tru "Month of Year") "month-of-year"]
                   [(deferred-tru "Quarter of Year") "quarter-of-year"]])
             (conj
              (mapv (fn [[name params]]
                      {:name name
                       :mbql (apply vector "binning-strategy" nil params)
                       :type "type/Number"})
                    [default-entry
                     [(deferred-tru "10 bins") ["num-bins" 10]]
                     [(deferred-tru "50 bins") ["num-bins" 50]]
                     [(deferred-tru "100 bins") ["num-bins" 100]]])
              {:name dont-bin-str
               :mbql nil
               :type "type/Number"})
             (conj
              (mapv (fn [[name params]]
                      {:name name
                       :mbql (apply vector "binning-strategy" nil params)
                       :type "type/Coordinate"})
                    [default-entry
                     [(deferred-tru "Bin every 0.1 degrees") ["bin-width" 0.1]]
                     [(deferred-tru "Bin every 1 degree") ["bin-width" 1.0]]
                     [(deferred-tru "Bin every 10 degrees") ["bin-width" 10.0]]
                     [(deferred-tru "Bin every 20 degrees") ["bin-width" 20.0]]])
              {:name dont-bin-str
               :mbql nil
               :type "type/Coordinate"})))))

(def ^:private dimension-options-for-response
  (m/map-keys str dimension-options))

(defn- create-dim-index-seq [dim-type]
  (->> dimension-options
       (m/filter-vals (fn [v] (= (:type v) dim-type)))
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
  (dimension-index-for-type "type/DateTime" #(= (str day-str) (str (:name %)))))

(def ^:private numeric-default-index
  (dimension-index-for-type "type/Number" #(.contains ^String (str (:name %)) (str auto-bin-str))))

(def ^:private coordinate-default-index
  (dimension-index-for-type "type/Coordinate" #(.contains ^String (str (:name %)) (str auto-bin-str))))

(defn- supports-numeric-binning? [driver]
  (and driver (driver/supports? driver :binning)))

(defn- supports-date-binning?
  "Time fields don't support binning, returns true if it's a DateTime field and not a time field"
  [{:keys [base_type], :as field}]
  (and (types/temporal-field? field)
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

(defn fetch-query-metadata
  "Returns the query metadata used to power the query builder for the given table `table-or-table-id`"
  [table include_sensitive_fields include_hidden_fields]
  (api/read-check table)
  (let [driver (driver.u/database->driver (:db_id table))]
    (-> table
        (hydrate :db [:fields [:target :has_field_values] :dimensions :has_field_values] :segments :metrics)
        (m/dissoc-in [:db :details])
        (assoc-dimension-options driver)
        format-fields-for-response
        (update :fields
                (let [hidden    (Boolean/parseBoolean include_hidden_fields)
                      sensitive (Boolean/parseBoolean include_sensitive_fields)]
                  (partial filter (fn [{:keys [visibility_type]}]
                                    (case (keyword visibility_type)
                                      :hidden    hidden
                                      :sensitive sensitive
                                      true))))))))

(api/defendpoint GET "/:id/query_metadata"
  "Get metadata about a `Table` useful for running queries.
   Returns DB, fields, field FKs, and field values.

  Passing `include_hidden_fields=true` will include any hidden `Fields` in the response. Defaults to `false`
  Passing `include_sensitive_fields=true` will include any sensitive `Fields` in the response. Defaults to `false`.

  These options are provided for use in the Admin Edit Metadata page."
  [id include_sensitive_fields include_hidden_fields]
  {include_sensitive_fields (s/maybe su/BooleanString)
   include_hidden_fields (s/maybe su/BooleanString)}
  (fetch-query-metadata (Table id) include_sensitive_fields include_hidden_fields))

(defn- card-result-metadata->virtual-fields
  "Return a sequence of 'virtual' fields metadata for the 'virtual' table for a Card in the Saved Questions 'virtual'
   database."
  [card-id database-id metadata]
  (let [add-field-dimension-options #(assoc-field-dimension-options (driver.u/database->driver database-id) %)]
    (for [col metadata]
      (-> col
          (update :base_type keyword)
          (assoc
           :table_id     (str "card__" card-id)
           :id           [:field-literal (:name col) (or (:base_type col) :type/*)]
           ;; Assoc special_type at least temprorarily. We need the correct special type in place to make decisions
           ;; about what kind of dimension options should be added. PK/FK values will be removed after we've added
           ;; the dimension options
           :special_type (keyword (:special_type col)))
          add-field-dimension-options))))

(defn root-collection-schema-name
  "Schema name to use for the saved questions virtual database for Cards that are in the root collection (i.e., not in
  any collection)."
  []
  (tru "Everything else"))

(defn card->virtual-table
  "Return metadata for a 'virtual' table for a `card` in the Saved Questions 'virtual' database. Optionally include
  'virtual' fields as well."
  [{:keys [database_id] :as card} & {:keys [include-fields?]}]
  ;; if collection isn't already hydrated then do so
  (let [card (hydrate card :collection)]
    (cond-> {:id           (str "card__" (u/get-id card))
             :db_id        (:database_id card)
             :display_name (:name card)
             :schema       (get-in card [:collection :name] (root-collection-schema-name))
             :description  (:description card)}
      include-fields? (assoc :fields (card-result-metadata->virtual-fields (u/get-id card)
                                                                           database_id
                                                                           (:result_metadata card))))))

(defn- remove-nested-pk-fk-special-types
  "This method clears the special_type attribute for PK/FK fields of nested queries. Those fields having a special
  type confuses the frontend and it can really used in the same way"
  [{:keys [fields] :as metadata-response}]
  (assoc metadata-response :fields (for [{:keys [special_type] :as field} fields]
                                     (if (or (isa? special_type :type/PK)
                                             (isa? special_type :type/FK))
                                       (assoc field :special_type nil)
                                       field))))

(api/defendpoint GET "/card__:id/query_metadata"
  "Return metadata for the 'virtual' table for a Card."
  [id]
  (let [{:keys [database_id] :as card } (db/select-one [Card :id :dataset_query :result_metadata :name :description
                                                        :collection_id :database_id]
                                          :id id)]
    (-> card
        api/read-check
        (card->virtual-table :include-fields? true)
        (assoc-dimension-options (driver.u/database->driver database_id))
        remove-nested-pk-fk-special-types)))

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
  (api/check-404 (Table id))
  (when-let [field-ids (db/select-ids Field :table_id id)]
    (db/simple-delete! FieldValues :field_id [:in field-ids]))
  {:status :success})

(api/defendpoint GET "/:id/related"
  "Return related entities."
  [id]
  (-> id Table api/read-check related/related))

(api/defendpoint PUT "/:id/fields/order"
  "Reorder fields"
  [id :as {field_order :body}]
  {field_order [su/IntGreaterThanZero]}
  (api/check-superuser)
  (-> id Table api/check-404 (table/custom-order-fields! field_order)))

(api/define-routes)

(ns metabase.api.table
  "/api/table endpoints."
  (:require
   [compojure.core :refer [GET POST PUT]]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.db.query :as mdb.query]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.models.card :refer [Card]]
   [metabase.models.database :refer [Database]]
   [metabase.models.field :refer [Field]]
   [metabase.models.field-values :as field-values :refer [FieldValues]]
   [metabase.models.interface :as mi]
   [metabase.models.table :as table :refer [Table]]
   [metabase.related :as related]
   [metabase.sync :as sync]
   [metabase.sync.concurrent :as sync.concurrent]
   #_:clj-kondo/ignore
   [metabase.sync.field-values :as sync.field-values]
   [metabase.types :as types]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru trs]]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan.hydrate :refer [hydrate]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private TableVisibilityType
  "Schema for a valid table visibility type."
  (apply s/enum (map name table/visibility-types)))

(def ^:private FieldOrder
  "Schema for a valid table field ordering."
  (apply s/enum (map name table/field-orderings)))

(api/defendpoint GET "/"
  "Get all `Tables`."
  []
  (as-> (t2/select Table, :active true, {:order-by [[:name :asc]]}) tables
    (hydrate tables :db)
    (filterv mi/can-read? tables)))

(api/defendpoint GET "/:id"
  "Get `Table` with ID."
  [id include_editable_data_model]
  {id ms/PositiveInt
   include_editable_data_model [:maybe :boolean]}
  (let [api-perm-check-fn (if include_editable_data_model
                            api/write-check
                            api/read-check)]
    (-> (api-perm-check-fn Table id)
        (hydrate :db :pk_field))))

(defn- update-table!*
  "Takes an existing table and the changes, updates in the database and optionally calls `table/update-field-positions!`
  if field positions have changed."
  [{:keys [id] :as existing-table} body]
  {id ms/PositiveInt}
  (when-let [changes (not-empty (u/select-keys-when body
                                  :non-nil [:display_name :show_in_getting_started :entity_type :field_order]
                                  :present [:description :caveats :points_of_interest :visibility_type]))]
    (api/check-500 (pos? (t2/update! Table id changes))))
  (let [updated-table        (t2/select-one Table :id id)
        changed-field-order? (not= (:field_order updated-table) (:field_order existing-table))]
    (if changed-field-order?
      (do
        (table/update-field-positions! updated-table)
        (hydrate updated-table [:fields [:target :has_field_values] :dimensions :has_field_values]))
      updated-table)))

(defn- sync-unhidden-tables
  "Function to call on newly unhidden tables. Starts a thread to sync all tables."
  [newly-unhidden]
  (when (seq newly-unhidden)
    (sync.concurrent/submit-task
     (fn []
       (let [database (table/database (first newly-unhidden))]
         (if (driver.u/can-connect-with-details? (:engine database) (:details database))
           (doseq [table newly-unhidden]
             (log/info (u/format-color 'green (trs "Table ''{0}'' is now visible. Resyncing." (:name table))))
             (sync/sync-table! table))
           (log/warn (u/format-color 'red (trs "Cannot connect to database ''{0}'' in order to sync unhidden tables"
                                               (:name database))))))))))

(defn- update-tables!
  [ids {:keys [visibility_type] :as body}]
  (let [existing-tables (t2/select Table :id [:in ids])]
    (api/check-404 (= (count existing-tables) (count ids)))
    (run! api/write-check existing-tables)
    (let [updated-tables (t2/with-transaction [_conn] (mapv #(update-table!* % body) existing-tables))
          newly-unhidden (when (and (contains? body :visibility_type) (nil? visibility_type))
                           (into [] (filter (comp some? :visibility_type)) existing-tables))]
      (sync-unhidden-tables newly-unhidden)
      updated-tables)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema PUT "/:id"
  "Update `Table` with ID."
  [id :as {{:keys [display_name entity_type visibility_type description caveats points_of_interest
                   show_in_getting_started field_order], :as body} :body}]
  {display_name            (s/maybe su/NonBlankString)
   entity_type             (s/maybe su/EntityTypeKeywordOrString)
   visibility_type         (s/maybe TableVisibilityType)
   description             (s/maybe s/Str)
   caveats                 (s/maybe s/Str)
   points_of_interest      (s/maybe s/Str)
   show_in_getting_started (s/maybe s/Bool)
   field_order             (s/maybe FieldOrder)}
  (first (update-tables! [id] body)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema PUT "/"
  "Update all `Table` in `ids`."
  [:as {{:keys [ids display_name entity_type visibility_type description caveats points_of_interest
                show_in_getting_started], :as body} :body}]
  {ids                     (su/non-empty [su/IntGreaterThanZero])
   display_name            (s/maybe su/NonBlankString)
   entity_type             (s/maybe su/EntityTypeKeywordOrString)
   visibility_type         (s/maybe TableVisibilityType)
   description             (s/maybe s/Str)
   caveats                 (s/maybe s/Str)
   points_of_interest      (s/maybe s/Str)
   show_in_getting_started (s/maybe s/Bool)}
  (update-tables! ids body))


(def ^:private auto-bin-str (deferred-tru "Auto bin"))
(def ^:private dont-bin-str (deferred-tru "Don''t bin"))
(def ^:private minute-str (deferred-tru "Minute"))
(def ^:private hour-str (deferred-tru "Hour"))
(def ^:private day-str (deferred-tru "Day"))


;; note the order of these options corresponds to the order they will be shown to the user in the UI
(def ^:private time-options
  [[minute-str "minute"]
   [hour-str "hour"]
   [(deferred-tru "Minute of Hour") "minute-of-hour"]])

(def ^:private datetime-options
  [[minute-str "minute"]
   [hour-str "hour"]
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

(def ^:private date-options
  [[day-str "day"]
   [(deferred-tru "Week") "week"]
   [(deferred-tru "Month") "month"]
   [(deferred-tru "Quarter") "quarter"]
   [(deferred-tru "Year") "year"]
   [(deferred-tru "Day of Week") "day-of-week"]
   [(deferred-tru "Day of Month") "day-of-month"]
   [(deferred-tru "Day of Year") "day-of-year"]
   [(deferred-tru "Week of Year") "week-of-year"]
   [(deferred-tru "Month of Year") "month-of-year"]
   [(deferred-tru "Quarter of Year") "quarter-of-year"]])

(def ^:private dimension-options
  (let [default-entry [auto-bin-str ["default"]]]
    (zipmap (range)
            (concat
             (map (fn [[name param]]
                    {:name name
                     :mbql [:field nil {:temporal-unit param}]
                     :type :type/Date})
                  date-options)
             (map (fn [[name param]]
                    {:name name
                     :mbql [:field nil {:temporal-unit param}]
                     :type :type/DateTime})
                  datetime-options)
             (map (fn [[name param]]
                    {:name name
                     :mbql [:field nil {:temporal-unit param}]
                     :type :type/Time})
                  time-options)
             (conj
              (mapv (fn [[name [strategy param]]]
                      {:name name
                       :mbql [:field nil {:binning (merge {:strategy strategy}
                                                          (when param
                                                            {strategy param}))}]
                       :type :type/Number})
                    [default-entry
                     [(deferred-tru "10 bins") ["num-bins" 10]]
                     [(deferred-tru "50 bins") ["num-bins" 50]]
                     [(deferred-tru "100 bins") ["num-bins" 100]]])
              {:name dont-bin-str
               :mbql nil
               :type :type/Number})
             (conj
              (mapv (fn [[name [strategy param]]]
                      {:name name
                       :mbql [:field nil {:binning (merge {:strategy strategy}
                                                          (when param
                                                            {strategy param}))}]
                       :type :type/Coordinate})
                    [default-entry
                     [(deferred-tru "Bin every 0.1 degrees") ["bin-width" 0.1]]
                     [(deferred-tru "Bin every 1 degree") ["bin-width" 1.0]]
                     [(deferred-tru "Bin every 10 degrees") ["bin-width" 10.0]]
                     [(deferred-tru "Bin every 20 degrees") ["bin-width" 20.0]]])
              {:name dont-bin-str
               :mbql nil
               :type :type/Coordinate})))))

(def ^:private dimension-options-for-response
  (m/map-keys str dimension-options))

(defn- create-dim-index-seq [dim-type]
  (->> dimension-options
       (m/filter-vals (fn [v] (= (:type v) dim-type)))
       keys
       sort
       (map str)))

(def ^:private datetime-dimension-indexes
  (create-dim-index-seq :type/DateTime))

(def ^:private time-dimension-indexes
  (create-dim-index-seq :type/Time))

(def ^:private date-dimension-indexes
  (create-dim-index-seq :type/Date))

(def ^:private numeric-dimension-indexes
  (create-dim-index-seq :type/Number))

(def ^:private coordinate-dimension-indexes
  (create-dim-index-seq :type/Coordinate))

(defn- dimension-index-for-type [dim-type pred]
  (let [dim' (keyword dim-type)]
    (first (m/find-first (fn [[_k v]]
                           (and (= dim' (:type v))
                                (pred v))) dimension-options-for-response))))

(def ^:private datetime-default-index
  (dimension-index-for-type :type/DateTime #(= (str day-str) (str (:name %)))))

(def ^:private date-default-index
  (dimension-index-for-type :type/Date #(= (str day-str) (str (:name %)))))

(def ^:private time-default-index
  (dimension-index-for-type :type/Time #(= (str hour-str) (str (:name %)))))

(def ^:private numeric-default-index
  (dimension-index-for-type :type/Number #(.contains ^String (str (:name %)) (str auto-bin-str))))

(def ^:private coordinate-default-index
  (dimension-index-for-type :type/Coordinate #(.contains ^String (str (:name %)) (str auto-bin-str))))

(defn- supports-numeric-binning? [db]
  (and db (driver/database-supports? (:engine db) :binning db)))

;; TODO: Remove all this when the FE is fully ported to [[metabase.lib.binning/available-binning-strategies]].
(defn- assoc-field-dimension-options [{:keys [base_type semantic_type fingerprint] :as field} db]
  (let [{min_value :min, max_value :max} (get-in fingerprint [:type :type/Number])
        [default-option all-options] (cond
                                       (types/field-is-type? :type/Time field)
                                       [time-default-index time-dimension-indexes]

                                       (types/field-is-type? :type/Date field)
                                       [date-default-index date-dimension-indexes]

                                       (types/temporal-field? field)
                                       [datetime-default-index datetime-dimension-indexes]

                                       (and min_value max_value
                                            (isa? semantic_type :type/Coordinate)
                                            (supports-numeric-binning? db))
                                       [coordinate-default-index coordinate-dimension-indexes]

                                       (and min_value max_value
                                            (isa? base_type :type/Number)
                                            (not (isa? semantic_type :Relation/*))
                                            (supports-numeric-binning? db))
                                       [numeric-default-index numeric-dimension-indexes]

                                       :else
                                       [nil []])]
    (assoc field
           :default_dimension_option default-option
           :dimension_options        all-options)))

(defn- assoc-dimension-options [resp db]
  (-> resp
      (assoc :dimension_options dimension-options-for-response)
      (update :fields (fn [fields]
                        (mapv #(assoc-field-dimension-options % db) fields)))))

(defn- format-fields-for-response [resp]
  (update resp :fields
          (fn [fields]
            (for [{:keys [values] :as field} fields]
              (if (seq values)
                (update field :values field-values/field-values->pairs)
                field)))))

(defn fetch-query-metadata
  "Returns the query metadata used to power the Query Builder for the given `table`. `include-sensitive-fields?`,
  `include-hidden-fields?` and `include-editable-data-model?` can be either booleans or boolean strings."
  [table {:keys [include-sensitive-fields? include-hidden-fields? include-editable-data-model?]}]
  (if (Boolean/parseBoolean include-editable-data-model?)
    (api/write-check table)
    (api/read-check table))
  (let [db                        (t2/select-one Database :id (:db_id table))
        include-sensitive-fields? (cond-> include-sensitive-fields? (string? include-sensitive-fields?) Boolean/parseBoolean)
        include-hidden-fields?    (cond-> include-hidden-fields? (string? include-hidden-fields?) Boolean/parseBoolean)]
    (-> table
        (hydrate :db [:fields [:target :has_field_values] :dimensions :has_field_values] :segments :metrics)
        (m/dissoc-in [:db :details])
        (assoc-dimension-options db)
        format-fields-for-response
        (update :fields (partial filter (fn [{visibility-type :visibility_type}]
                                          (case (keyword visibility-type)
                                            :hidden    include-hidden-fields?
                                            :sensitive include-sensitive-fields?
                                            true)))))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/:id/query_metadata"
  "Get metadata about a `Table` useful for running queries.
   Returns DB, fields, field FKs, and field values.

  Passing `include_hidden_fields=true` will include any hidden `Fields` in the response. Defaults to `false`
  Passing `include_sensitive_fields=true` will include any sensitive `Fields` in the response. Defaults to `false`.

  Passing `include_editable_data_model=true` will check that the current user has write permissions for the table's
  data model, while `false` checks that they have data access perms for the table. Defaults to `false`.

  These options are provided for use in the Admin Edit Metadata page."
  [id include_sensitive_fields include_hidden_fields include_editable_data_model]
  {include_sensitive_fields (s/maybe su/BooleanString)
   include_hidden_fields (s/maybe su/BooleanString)
   include_editable_data_model (s/maybe su/BooleanString)}
  (fetch-query-metadata (t2/select-one Table :id id) {:include-sensitive-fields?    include_sensitive_fields
                                                      :include-hidden-fields?       include_hidden_fields
                                                      :include-editable-data-model? include_editable_data_model}))

(defn- card-result-metadata->virtual-fields
  "Return a sequence of 'virtual' fields metadata for the 'virtual' table for a Card in the Saved Questions 'virtual'
   database."
  [card-id database-id metadata]
  (let [db (t2/select-one Database :id database-id)
        underlying (m/index-by :id (when-let [ids (seq (keep :id metadata))]
                                     (t2/select Field :id [:in ids])))
        fields (for [{col-id :id :as col} metadata]
                 (-> col
                     (update :base_type keyword)
                     (merge (select-keys (underlying col-id)
                                         [:semantic_type :fk_target_field_id :has_field_values]))
                     (assoc
                      :table_id     (str "card__" card-id)
                      :id           (or col-id
                                        ;; TODO -- what????
                                        [:field (:name col) {:base-type (or (:base_type col) :type/*)}])
                      ;; Assoc semantic_type at least temprorarily. We need the correct semantic type in place to make decisions
                      ;; about what kind of dimension options should be added. PK/FK values will be removed after we've added
                      ;; the dimension options
                      :semantic_type (keyword (:semantic_type col)))
                     (assoc-field-dimension-options db)))
        field->annotated (let [with-ids (filter (comp number? :id) fields)]
                           (zipmap with-ids (hydrate with-ids [:target :has_field_values] :has_field_values)))]
    (map #(field->annotated % %) fields)))

(defn root-collection-schema-name
  "Schema name to use for the saved questions virtual database for Cards that are in the root collection (i.e., not in
  any collection)."
  []
  "Everything else")

(defn card->virtual-table
  "Return metadata for a 'virtual' table for a `card` in the Saved Questions 'virtual' database. Optionally include
  'virtual' fields as well."
  [{:keys [database_id] :as card} & {:keys [include-fields?]}]
  ;; if collection isn't already hydrated then do so
  (let [card (hydrate card :collection)]
    (cond-> {:id               (str "card__" (u/the-id card))
             :db_id            (:database_id card)
             :display_name     (:name card)
             :schema           (get-in card [:collection :name] (root-collection-schema-name))
             :moderated_status (:moderated_status card)
             :description      (:description card)}
      include-fields? (assoc :fields (card-result-metadata->virtual-fields (u/the-id card)
                                                                           database_id
                                                                           (:result_metadata card))))))

(defn- remove-nested-pk-fk-semantic-types
  "This method clears the semantic_type attribute for PK/FK fields of nested queries. Those fields having a semantic
  type confuses the frontend and it can really used in the same way"
  [{:keys [fields] :as metadata-response}]
  (assoc metadata-response :fields (for [{:keys [semantic_type id] :as field} fields]
                                     (if (and (or (isa? semantic_type :type/PK)
                                                  (isa? semantic_type :type/FK))
                                              ;; if they have a user entered id let it stay
                                              (or (nil? id)
                                                  (not (number? id))))
                                       (assoc field :semantic_type nil)
                                       field))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/card__:id/query_metadata"
  "Return metadata for the 'virtual' table for a Card."
  [id]
  (let [{:keys [database_id] :as card} (t2/select-one [Card :id :dataset_query :result_metadata :name :description
                                                       :collection_id :database_id]
                                         :id id)
        moderated-status              (->> (mdb.query/query {:select   [:status]
                                                             :from     [:moderation_review]
                                                             :where    [:and
                                                                        [:= :moderated_item_type "card"]
                                                                        [:= :moderated_item_id id]
                                                                        [:= :most_recent true]]
                                                             :order-by [[:id :desc]]
                                                             :limit    1}
                                                            :id id)
                                           first :status)
        db (t2/select-one Database :id database_id)]
    (-> (assoc card :moderated_status moderated-status)
        api/read-check
        (card->virtual-table :include-fields? true)
        (assoc-dimension-options db)
        remove-nested-pk-fk-semantic-types)))

(api/defendpoint GET "/card__:id/fks"
  "Return FK info for the 'virtual' table for a Card. This is always empty, so this endpoint
   serves mainly as a placeholder to avoid having to change anything on the frontend."
  []
  []) ; return empty array

(api/defendpoint GET "/:id/fks"
  "Get all foreign keys whose destination is a `Field` that belongs to this `Table`."
  [id]
  {id ms/PositiveInt}
  (api/read-check Table id)
  (when-let [field-ids (seq (t2/select-pks-set Field, :table_id id, :visibility_type [:not= "retired"], :active true))]
    (for [origin-field (t2/select Field, :fk_target_field_id [:in field-ids], :active true)]
      ;; it's silly to be hydrating some of these tables/dbs
      {:relationship   :Mt1
       :origin_id      (:id origin-field)
       :origin         (hydrate origin-field [:table :db])
       :destination_id (:fk_target_field_id origin-field)
       :destination    (hydrate (t2/select-one Field :id (:fk_target_field_id origin-field)) :table)})))

(api/defendpoint POST "/:id/rescan_values"
  "Manually trigger an update for the FieldValues for the Fields belonging to this Table. Only applies to Fields that
   are eligible for FieldValues."
  [id]
  {id ms/PositiveInt}
  (let [table (api/write-check (t2/select-one Table :id id))]
    ;; Override *current-user-permissions-set* so that permission checks pass during sync. If a user has DB detail perms
    ;; but no data perms, they should stll be able to trigger a sync of field values. This is fine because we don't
    ;; return any actual field values from this API. (#21764)
    (binding [api/*current-user-permissions-set* (atom #{"/"})]
      ;; async so as not to block the UI
      (sync.concurrent/submit-task
       (fn []
         (sync.field-values/update-field-values-for-table! table))))
    {:status :success}))

(api/defendpoint POST "/:id/discard_values"
  "Discard the FieldValues belonging to the Fields in this Table. Only applies to fields that have FieldValues. If
   this Table's Database is set up to automatically sync FieldValues, they will be recreated during the next cycle."
  [id]
  {id ms/PositiveInt}
  (api/write-check (t2/select-one Table :id id))
  (when-let [field-ids (t2/select-pks-set Field :table_id id)]
    (t2/delete! (t2/table-name FieldValues) :field_id [:in field-ids]))
  {:status :success})

(api/defendpoint GET "/:id/related"
  "Return related entities."
  [id]
  {id ms/PositiveInt}
  (-> (t2/select-one Table :id id) api/read-check related/related))

(api/defendpoint PUT "/:id/fields/order"
  "Reorder fields"
  [id :as {field_order :body}]
  {id ms/PositiveInt
   field_order [:sequential ms/PositiveInt]}
  (-> (t2/select-one Table :id id) api/write-check (table/custom-order-fields! field_order)))

(api/define-routes)

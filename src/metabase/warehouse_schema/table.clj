(ns metabase.warehouse-schema.table
  (:require
   [flatland.ordered.map :as ordered-map]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.driver.util :as driver.u]
   [metabase.models.field-values :as field-values]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.types :as types]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru deferred-trun]]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn present-table
  "Given a table, shape it for the API."
  [table]
  (-> table
      (update :db dissoc :router_database_id)
      (update :schema str)))

(def ^:private auto-bin-str (deferred-tru "Auto bin"))
(def ^:private dont-bin-str (deferred-tru "Don''t bin"))

;;; Apparently `msgcat` is not cool with us using a string as both a singular message ID and a plural message ID, and
;;; since we're using stuff like `Minute` as a plural string elsewhere (see [[metabase.lib.temporal-bucket]]) we're
;;; forced to use `*-trun` here as well
(def ^:private unit->deferred-i18n-description
  {:minute          (deferred-trun "Minute" "Minutes" 1)
   :hour            (deferred-trun "Hour" "Hours" 1)
   :day             (deferred-trun "Day" "Days" 1)
   :week            (deferred-trun "Week" "Weeks" 1)
   :month           (deferred-trun "Month" "Months" 1)
   :quarter         (deferred-trun "Quarter" "Quarters" 1)
   :year            (deferred-trun "Year" "Years" 1)
   :minute-of-hour  (deferred-trun "Minute of hour" "Minutes of hour" 1)
   :hour-of-day     (deferred-trun "Hour of day" "Hours of day" 1)
   :day-of-week     (deferred-trun "Day of week" "Days of week" 1)
   :day-of-month    (deferred-trun "Day of month" "Days of month" 1)
   :day-of-year     (deferred-trun "Day of year" "Days of year" 1)
   :week-of-year    (deferred-trun "Week of year" "Weeks of year" 1)
   :month-of-year   (deferred-trun "Month of year" "Months of year" 1)
   :quarter-of-year (deferred-trun "Quarter of year" "Quarters of year" 1)})

;; note the order of these options corresponds to the order they will be shown to the user in the UI
(def ^:private time-options
  (mapv (fn [unit]
          [(unit->deferred-i18n-description unit) (name unit)])
        [:minute :hour :minute-of-hour]))

(def ^:private datetime-options
  (mapv (fn [unit]
          [(unit->deferred-i18n-description unit) (name unit)])
        [:minute
         :hour
         :day
         :week
         :month
         :quarter
         :year
         :minute-of-hour
         :hour-of-day
         :day-of-week
         :day-of-month
         :day-of-year
         :week-of-year
         :month-of-year
         :quarter-of-year]))

(def ^:private date-options
  (mapv (fn [unit]
          [(unit->deferred-i18n-description unit) (name unit)])
        [:day
         :week
         :month
         :quarter
         :year
         :day-of-week
         :day-of-month
         :day-of-year
         :week-of-year
         :month-of-year
         :quarter-of-year]))

(def ^:private dimension-options
  (let [default-entry [auto-bin-str ["default"]]]
    (into (ordered-map/ordered-map)
          (comp cat
                (map-indexed vector))
          [(map (fn [[name param]]
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
           (map (fn [[name [strategy param]]]
                  {:name name
                   :mbql [:field nil {:binning (merge {:strategy strategy}
                                                      (when param
                                                        {strategy param}))}]
                   :type :type/Number})
                [default-entry
                 [(deferred-tru "10 bins") ["num-bins" 10]]
                 [(deferred-tru "50 bins") ["num-bins" 50]]
                 [(deferred-tru "100 bins") ["num-bins" 100]]])
           [{:name dont-bin-str
             :mbql nil
             :type :type/Number}]
           (map (fn [[name [strategy param]]]
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
           [{:name dont-bin-str
             :mbql nil
             :type :type/Coordinate}]])))

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
  (dimension-index-for-type :type/DateTime #(= (str (unit->deferred-i18n-description :day)) (str (:name %)))))

(def ^:private date-default-index
  (dimension-index-for-type :type/Date #(= (str (unit->deferred-i18n-description :day)) (str (:name %)))))

(def ^:private time-default-index
  (dimension-index-for-type :type/Time #(= (str (unit->deferred-i18n-description :hour)) (str (:name %)))))

(def ^:private numeric-default-index
  (dimension-index-for-type :type/Number #(.contains ^String (str (:name %)) (str auto-bin-str))))

(def ^:private coordinate-default-index
  (dimension-index-for-type :type/Coordinate #(.contains ^String (str (:name %)) (str auto-bin-str))))

(defn- supports-numeric-binning? [db]
  (and db (driver.u/supports? (:engine db) :binning db)))

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

(defn fetch-query-metadata*
  "Returns the query metadata used to power the Query Builder for the given `table`. `include-sensitive-fields?`,
  `include-hidden-fields?` and `include-editable-data-model?` can be either booleans or boolean strings."
  [table {:keys [include-sensitive-fields? include-hidden-fields? include-editable-data-model?]}]
  (if include-editable-data-model?
    (api/write-check table)
    (api/read-check table))
  (let [db (t2/select-one :model/Database :id (:db_id table))]
    (-> table
        (t2/hydrate :db [:fields [:target :has_field_values] :has_field_values :dimensions :name_field] :segments :metrics)
        (m/dissoc-in [:db :details])
        (assoc-dimension-options db)
        format-fields-for-response
        present-table
        (update :fields (partial filter (fn [{visibility-type :visibility_type}]
                                          (case (keyword visibility-type)
                                            :hidden    include-hidden-fields?
                                            :sensitive include-sensitive-fields?
                                            true)))))))

(defn batch-fetch-query-metadatas*
  "Returns the query metadata used to power the Query Builder for the `table`s specified by `ids`."
  [ids]
  (when (seq ids)
    (let [tables (->> (t2/select :model/Table :id [:in ids])
                      (filter mi/can-read?))
          tables (t2/hydrate tables
                             [:fields [:target :has_field_values] :has_field_values :dimensions :name_field]
                             :segments
                             :metrics)]
      (for [table tables]
        (-> table
            (m/dissoc-in [:db :details])
            format-fields-for-response
            present-table
            (update :fields #(remove (comp #{:hidden :sensitive} :visibility_type) %)))))))

(defenterprise fetch-table-query-metadata
  "Returns the query metadata used to power the Query Builder for the given table `id`. `include-sensitive-fields?`,
  `include-hidden-fields?` and `include-editable-data-model?` can be either booleans or boolean strings."
  metabase-enterprise.sandbox.api.table
  [id opts]
  (fetch-query-metadata* (t2/select-one :model/Table :id id) opts))

(defenterprise batch-fetch-table-query-metadatas
  "Returns the query metadatas used to power the Query Builder for the tables specified by `ids`."
  metabase-enterprise.sandbox.api.table
  [ids]
  (batch-fetch-query-metadatas* ids))

(defn- card-result-metadata->virtual-fields
  "Return a sequence of 'virtual' fields metadata for the 'virtual' table for a Card in the Saved Questions 'virtual'
   database.
  `metadata-fields` can be nil."
  [card-id database-or-id metadata metadata-fields]
  (let [db (cond->> database-or-id
             (int? database-or-id) (t2/select-one :model/Database :id))
        underlying (m/index-by :id (or metadata-fields
                                       (when-let [ids (seq (keep :id metadata))]
                                         (-> (t2/select :model/Field :id [:in ids])
                                             (t2/hydrate [:target :has_field_values] :has_field_values :dimensions :name_field)))))
        fields (for [{col-id :id :as col} metadata]
                 (-> col
                     (update :base_type keyword)
                     (merge (select-keys (underlying col-id)
                                         [:semantic_type :fk_target_field_id :has_field_values :target :dimensions :name_field]))
                     (assoc
                      :table_id     (str "card__" card-id)
                      :id           (or col-id
                                        ;; TODO -- what????
                                        [:field (:name col) {:base-type (or (:base_type col) :type/*)}])
                      ;; Assoc semantic_type at least temprorarily. We need the correct semantic type in place to make
                      ;; decisions about what kind of dimension options should be added. PK/FK values will be removed
                      ;; after we've added the dimension options
                      :semantic_type (keyword (:semantic_type col)))
                     (assoc-field-dimension-options db)))]
    fields))

(defn root-collection-schema-name
  "Schema name to use for the saved questions virtual database for Cards that are in the root collection (i.e., not in
  any collection)."
  []
  "Everything else")

(defn card->virtual-table
  "Return metadata for a 'virtual' table for a `card` in the Saved Questions 'virtual' database. Optionally include
  'virtual' fields as well."
  [{:keys [database_id] :as card} & {:keys [include-fields? databases card-id->metadata-fields]}]
  ;; if collection isn't already hydrated then do so
  (let [card-type (:type card)
        dataset-query (:dataset_query card)]
    (cond-> {:id               (str "card__" (u/the-id card))
             :db_id            (:database_id card)
             :display_name     (:name card)
             :schema           (get-in card [:collection :name] (root-collection-schema-name))
             :moderated_status (:moderated_status card)
             :description      (:description card)
             :entity_id        (:entity_id card)
             :metrics          (:metrics card)
             :type             card-type}
      (and (= card-type :metric)
           dataset-query)
      (assoc :dataset_query dataset-query)

      include-fields?
      (assoc :fields (card-result-metadata->virtual-fields (u/the-id card)
                                                           (cond-> database_id
                                                             databases databases)
                                                           (:result_metadata card)
                                                           (when card-id->metadata-fields
                                                             (card-id->metadata-fields (u/the-id card))))))))

(defn- remove-nested-pk-fk-semantic-types
  "This method clears the semantic_type attribute for PK/FK fields of nested queries. Those fields having a semantic
  type confuses the frontend and it can really used in the same way"
  [{:keys [fields] :as metadata-response} {:keys [trust-semantic-keys?]}]
  (assoc metadata-response :fields (for [{:keys [semantic_type id] :as field} fields]
                                     (if (and (not trust-semantic-keys?)
                                              (or (isa? semantic_type :type/PK)
                                                  (isa? semantic_type :type/FK))
                                              ;; if they have a user entered id let it stay
                                              (or (nil? id)
                                                  (not (number? id))))
                                       (assoc field :semantic_type nil)
                                       field))))

(defn batch-fetch-card-query-metadatas
  "Return metadata for the 'virtual' tables for a Cards. Unreadable cards are silently skipped."
  [ids]
  (when (seq ids)
    (let [cards (t2/select :model/Card
                           {:select    [:c.id :c.dataset_query :c.result_metadata :c.name
                                        :c.description :c.collection_id :c.database_id :c.type
                                        :c.source_card_id :c.created_at :c.entity_id :c.card_schema
                                        [:r.status :moderated_status]]
                            :from      [[:report_card :c]]
                            :left-join [[{:select   [:moderated_item_id :status]
                                          :from     [:moderation_review]
                                          :where    [:and
                                                     [:= :moderated_item_type "card"]
                                                     [:= :most_recent true]]
                                          :order-by [[:id :desc]]
                                          :limit    1} :r]
                                        [:= :r.moderated_item_id :c.id]]
                            :where      [:in :c.id ids]})
          dbs (if (seq cards)
                (t2/select-pk->fn identity :model/Database :id [:in (into #{} (map :database_id) cards)])
                {})
          metadata-field-ids (into #{}
                                   (comp (mapcat :result_metadata)
                                         (keep :id))
                                   cards)
          metadata-fields (if (seq metadata-field-ids)
                            (-> (t2/select :model/Field :id [:in metadata-field-ids])
                                (t2/hydrate [:target :has_field_values] :has_field_values :dimensions :name_field)
                                (->> (m/index-by :id)))
                            {})
          card-id->metadata-fields (into {}
                                         (map (fn [card]
                                                [(:id card) (into []
                                                                  (keep (comp metadata-fields :id))
                                                                  (:result_metadata card))]))
                                         cards)
          readable-cards (t2/hydrate (filter mi/can-read? cards) :metrics)]
      (for [card readable-cards]
        ;; a native model can have columns with keys as semantic types only if a user configured them
        (let [trust-semantic-keys? (and (= (:type card) :model)
                                        (= (-> card :dataset_query :type) :native))]
          (-> card
              (card->virtual-table :include-fields? true
                                   :databases dbs
                                   :card-id->metadata-fields card-id->metadata-fields)
              (assoc-dimension-options (-> card :database_id dbs))
              (remove-nested-pk-fk-semantic-types {:trust-semantic-keys? trust-semantic-keys?})))))))

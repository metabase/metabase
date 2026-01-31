(ns metabase.warehouse-schema.table
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.models.field-values :as field-values]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- nil-if-unreadable
  [instance]
  (when (and instance (mi/can-read? instance))
    instance))

(defn present-table
  "Given a table, shape it for the API."
  [table]
  (-> table
      (update :db dissoc :router_database_id)
      (m/update-existing :collection nil-if-unreadable)
      (update :schema str)))

(defn- format-fields-for-response [resp]
  (update resp :fields
          (fn [fields]
            (for [{:keys [values] :as field} fields]
              (if (seq values)
                (update field :values field-values/field-values->pairs)
                field)))))

(defn- can-access-table-for-query-metadata?
  "Returns true if the current user can access this table for query metadata.
  Uses can-read? which checks data permissions, metadata management permissions,
  and collection permissions for published tables."
  [table]
  (mi/can-read? table))

(defn fetch-query-metadata*
  "Returns the query metadata used to power the Query Builder for the given `table`. `include-sensitive-fields?`,
  `include-hidden-fields?` and `include-editable-data-model?` can be either booleans or boolean strings."
  [table {:keys [include-sensitive-fields? include-hidden-fields? include-editable-data-model?]}]
  (api/check-404 table)
  (if include-editable-data-model?
    (api/write-check table)
    (api/check-403 (can-access-table-for-query-metadata? table)))
  (let [hydration-keys (cond-> [:db [:fields [:target :has_field_values] :has_field_values :dimensions :name_field]
                                [:segments :definition_description] [:measures :definition_description] :metrics :collection]
                         (premium-features/has-feature? :transforms) (conj :transform))]
    (-> table
        (update :collection nil-if-unreadable)
        (#(apply t2/hydrate % hydration-keys))
        (m/dissoc-in [:db :details])
        format-fields-for-response
        present-table
        (update :fields (partial filter (fn [{visibility-type :visibility_type}]
                                          (case (keyword visibility-type)
                                            :hidden    include-hidden-fields?
                                            :sensitive include-sensitive-fields?
                                            true)))))))

(defn batch-fetch-query-metadatas*
  "Returns the query metadata used to power the Query Builder for the `table`s specified by `ids`.
  Options:
    - `include-sensitive-fields?` - if true, includes fields with visibility_type :sensitive (default false)"
  ([ids]
   (batch-fetch-query-metadatas* ids nil))
  ([ids {:keys [include-sensitive-fields?]}]
   (when (seq ids)
     (let [tables (->> (t2/select :model/Table :id [:in ids])
                       (filter can-access-table-for-query-metadata?))
           tables (t2/hydrate tables
                              [:fields [:target :has_field_values] :has_field_values :dimensions :name_field]
                              :segments
                              :measures
                              :metrics)
           excluded-visibility-types (cond-> #{:hidden}
                                       (not include-sensitive-fields?) (conj :sensitive))]
       (for [table tables]
         (-> table
             (m/dissoc-in [:db :details])
             format-fields-for-response
             present-table
             (update :fields #(remove (comp excluded-visibility-types :visibility_type) %))))))))

(defenterprise fetch-table-query-metadata
  "Returns the query metadata used to power the Query Builder for the given table `id`. `include-sensitive-fields?`,
  `include-hidden-fields?` and `include-editable-data-model?` can be either booleans or boolean strings."
  metabase-enterprise.sandbox.api.table
  [id opts]
  (fetch-query-metadata* (t2/select-one :model/Table :id id) opts))

(defenterprise batch-fetch-table-query-metadatas
  "Returns the query metadatas used to power the Query Builder for the tables specified by `ids`.
  Options:
    - `include-sensitive-fields?` - if true, includes fields with visibility_type :sensitive (default false)"
  metabase-enterprise.sandbox.api.table
  [ids opts]
  (batch-fetch-query-metadatas* ids opts))

(defn root-collection-schema-name
  "Schema name to use for the saved questions virtual database for Cards that are in the root collection (i.e., not in
  any collection)."
  []
  "Everything else")

(defn card->virtual-table
  "Return metadata for a 'virtual' table for a `card` in the Saved Questions 'virtual' database. Optionally include
  'virtual' fields as well."
  {:deprecated "0.59.0"}
  [{:keys [database_id] :as card} & {:keys [include-database? databases]}]
  ;; if collection isn't already hydrated then do so
  (let [card-type     (:type card)
        dataset-query (:dataset_query card)
        database      (when (int? database_id)
                        (or (get databases database_id)
                            (t2/select-one :model/Database :id database_id)))]
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

      include-database?
      (assoc :db (when (and database (mi/can-read? database)) database)))))

(defn- remove-nested-pk-fk-semantic-types
  "This method clears the semantic_type attribute for PK/FK fields of nested queries. Those fields having a semantic
  type confuses the frontend and it can really used in the same way"
  [result-metadata {:keys [trust-semantic-keys?]}]
  (m/update-existing
   result-metadata
   :result_metadata
   (fn [fields]
     (for [{:keys [semantic_type id] :as field} fields]
       (if (and (not trust-semantic-keys?)
                (or (isa? semantic_type :type/PK)
                    (isa? semantic_type :type/FK))
                ;; if they have a user entered id let it stay
                (or (nil? id)
                    (not (number? id))))
         (assoc field :semantic_type nil)
         field)))))

(defn- remove-untrusted-semantic-keys
  "Models can have user configured FK columns which, for MBQL models, we cannot distinguish from stale data that
  remained there from a time when the given column was still FK. We assume treating a not-FK-anymore column as FK is
  not that bad as not supporting user defined FK settings, so we trust the model's information."
  [card]
  (let [trust-semantic-keys? (= (:type card) :model)]
    (-> card
        (remove-nested-pk-fk-semantic-types {:trust-semantic-keys? trust-semantic-keys?}))))

(mu/defn batch-fetch-card-query-metadatas :- [:maybe [:sequential [:ref :metabase.queries.schema/card]]]
  "Return metadata for the 'virtual' tables for a Cards. Unreadable cards are silently skipped."
  [ids :- [:maybe [:or
                   [:sequential ::lib.schema.id/card]
                   [:set ::lib.schema.id/card]]]]
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
                            :where      [:in :c.id ids]})]
      (-> cards
          (->> (filter mi/can-read?))
          (->> (map remove-untrusted-semantic-keys))
          (t2/hydrate :metrics)))))

(ns metabase-enterprise.replacement.source
  (:require
   [metabase-enterprise.replacement.schema :as replacement.schema]
   [metabase-enterprise.replacement.usages :as usages]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-be.schema.source-swap :as lib-be.schema.source-swap]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn- has-incoming-fks? :- :boolean
  "Returns true if any active field has a FK pointing to a field in `table-id`."
  [table-id :- ::lib.schema.id/table]
  (if-let [field-ids (not-empty (t2/select-pks-set :model/Field :table_id table-id :active true))]
    (t2/exists? :model/Field :fk_target_field_id [:in field-ids] :active true)
    false))

(mu/defn- format-column :- ::replacement.schema/column
  [col :- ::lib.schema.metadata/column]
  {:id             (:id col)
   :name           ((some-fn :lib/desired-column-alias :name) col)
   :display_name   (or (:display-name col) "")
   :base_type      (some-> (:base-type col) u/qualified-name)
   :effective_type (some-> (:effective-type col) u/qualified-name)
   :semantic_type  (some-> (:semantic-type col) u/qualified-name)})

(mu/defn- fetch-source :- [:map
                           [:query       ::lib.schema/query]
                           [:database-id ::lib.schema.id/database]]
  "Fetch source metadata, its database ID, and a query for the source."
  [entity-type :- ::replacement.schema/source-entity-type
   entity-id   :- ::replacement.schema/source-entity-id]
  (case entity-type
    :card  (let [mp   (lib-be/application-database-metadata-provider
                       (t2/select-one-fn :database_id :model/Card :id entity-id))
                 card (lib.metadata/card mp entity-id)]
             {:query (lib/query mp card) :database-id (:database-id card)})
    :table (let [db-id (t2/select-one-fn :db_id :model/Table :id entity-id)
                 mp    (lib-be/application-database-metadata-provider db-id)
                 table (lib.metadata/table mp entity-id)]
             {:query (lib/query mp table) :database-id (:db-id table)})))

(mu/defn- format-column-mappings :- [:sequential ::replacement.schema/column-mapping]
  "Format column mappings by applying format-column to source and target columns."
  [mappings :- [:sequential ::lib-be.schema.source-swap/column-mapping]]
  (mapv #(-> %
             (u/update-some :source format-column)
             (u/update-some :target format-column))
        mappings))

(mu/defn check-replace-source :- ::replacement.schema/check-replace-source-response
  "Check whether `old-source` can be replaced by `new-source`. Returns a map with
  `:success`, `:errors` (unique top-level error types), and `:column_mappings`.
  Arguments match `swap-source`: each is a `[entity-type entity-id]` pair."
  [[old-type old-id :as old-ref]
   [new-type new-id :as new-ref]]
  (if (= old-ref new-ref)
    {:success false}
    (let [{source-db :database-id, source-query :query} (fetch-source old-type old-id)
          {target-db :database-id, target-query :query} (fetch-source new-type new-id)
          db-mismatch?   (not= source-db target-db)
          cycle?         (some #(= new-ref %) (usages/transitive-usages old-ref))
          mappings       (format-column-mappings (lib-be/check-column-mappings source-query target-query))
          has-missing?   (some (fn [m] (and (:source m) (nil? (:target m)))) mappings)
          has-col-errors? (seq (mapcat :errors mappings))
          implicit-joins? (and (= old-type :table) (has-incoming-fks? old-id))
          success?       (not (or db-mismatch? cycle? has-missing? has-col-errors? implicit-joins?))
          reported-errors (cond-> []
                            db-mismatch?    (conj :database-mismatch)
                            cycle?          (conj :cycle-detected)
                            implicit-joins? (conj :incompatible-implicit-joins))]
      (cond-> {:success success?}
        (seq reported-errors) (assoc :errors reported-errors)
        (seq mappings)        (assoc :column_mappings mappings)))))

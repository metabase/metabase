(ns metabase-enterprise.replacement.source-check
  (:require
   [metabase-enterprise.replacement.schema :as replacement.schema]
   [metabase-enterprise.replacement.usages :as replacement.usages]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.source-swap.core :as source-swap]
   [metabase.source-swap.schema :as source-swap.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn- has-gtap-policies? :- :boolean
  "Returns true if any sandbox (GTAP) policy references `table-id`, either directly
  via `sandbox.table_id` or indirectly via a scoping card whose `table_id` matches."
  [table-id :- ::lib.schema.id/table]
  (or (t2/exists? :model/Sandbox :table_id table-id)
      (let [sandbox-card-ids (t2/select-fn-set :card_id :model/Sandbox :card_id [:not= nil])]
        (boolean
         (when (seq sandbox-card-ids)
           (t2/exists? :model/Card :id [:in sandbox-card-ids] :table_id table-id))))))

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

(mu/defn- fetch-source-database-id :- ::lib.schema.id/database
  "Fetch a database ID for a source."
  [entity-type :- ::replacement.schema/source-entity-type
   entity-id   :- ::replacement.schema/source-entity-id]
  (case entity-type
    :card  (t2/select-one-fn :database_id :model/Card :id entity-id)
    :table (t2/select-one-fn :db_id :model/Table :id entity-id)))

(mu/defn- format-column-mappings :- [:sequential ::replacement.schema/column-mapping]
  "Format column mappings by applying format-column to source and target columns."
  [mappings :- [:sequential ::source-swap.schema/column-mapping]]
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
    (let [source-db-id    (fetch-source-database-id old-type old-id)
          target-db-id    (fetch-source-database-id new-type new-id)
          db-mismatch?    (not= source-db-id target-db-id)
          cycle?          (some #(= new-ref %) (replacement.usages/transitive-usages old-ref))
          mappings        (when-not db-mismatch?
                            (-> (lib-be/application-database-metadata-provider source-db-id)
                                (source-swap/check-column-mappings old-ref new-ref)
                                format-column-mappings))
          has-missing?    (some (fn [m] (and (:source m) (nil? (:target m)))) mappings)
          has-col-errors? (seq (mapcat :errors mappings))
          implicit-joins? (and (= old-type :table) (has-incoming-fks? old-id))
          gtap?           (and (= old-type :table) (has-gtap-policies? old-id))
          success?        (not (or db-mismatch? cycle? has-missing? has-col-errors? implicit-joins? gtap?))
          reported-errors (cond-> []
                            db-mismatch?    (conj :database-mismatch)
                            cycle?          (conj :cycle-detected)
                            implicit-joins? (conj :incompatible-implicit-joins)
                            gtap?           (conj :affects-gtap-policies))]
      (cond-> {:success success?}
        (seq reported-errors) (assoc :errors reported-errors)
        (seq mappings)        (assoc :column_mappings mappings)))))

(ns metabase.warehouse-schema.db
  "Application database queries for the warehouse-schema module. Every function here is a direct Toucan 2 call with
  no additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration
  methods, and transactions."
  (:require
   [malli.util :as mut]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
   [metabase.collections.listing :as collections.listing]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :as premium-features]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.remote-sync.schema :as remote-sync.schema]
   [metabase.types.core :as types]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouse-schema.user-settings :as user-settings]
   [toucan2.core :as t2]))

;;; ------------------------------------------------- Field types -------------------------------------------------

(defn- type-term
  "What `changes` write for the type column `k`: its value as a string, or nil, when they write it, else `k`, the
  column, whose stored value the statement reads."
  [changes k]
  (if (contains? changes k)
    (some-> (get changes k) keyword u/qualified-name)
    k))

(defn- type-valid
  "Whether the type `term`, a string, nil or a column, is a descendant of `:type/*`: a boolean, or an expression."
  [term]
  (cond
    (nil? term)    false
    (string? term) (isa? (keyword term) :type/*)
    :else          (app-db/isa term :type/*)))

(defn- all-of
  "The conjunction of `conditions`, each a boolean or an expression: false, true or an expression."
  [conditions]
  (cond
    (some false? conditions) false
    :else (let [exprs (remove true? conditions)]
            (case (count exprs)
              0 true
              1 (first exprs)
              (into [:and] exprs)))))

(defn- types-repairable
  "The condition for the GHY-3388 repair of a Field with no coercion strategy whose effective type `e` and base type
  `b`, terms, are both types and differ."
  [e b]
  (all-of [(type-valid e) (type-valid b) (if (and (string? e) (string? b)) (not= e b) [:<> e b])]))

(defn- as-value
  "`term` as the value a column takes: a column read becomes an expression, which the column's transform leaves as it is."
  [term]
  (if (keyword? term) [:coalesce term term] term))

(defn- case-or-nothing
  "The value for the effective type that is `then` when `condition`, else `else-term`, or nil when that is no change:
  `condition` false with `else-term` the column itself."
  [condition then else-term]
  (cond
    (false? condition) (when-not (keyword? else-term) else-term)
    (true? condition)  (as-value then)
    :else              [:case condition then :else else-term]))

(defn- uncoercible-strategies
  "The names of the coercion strategies the column takes that cannot coerce a Field of `base-type`."
  [base-type]
  (into [] (comp (remove #(types/is-coercible-from? % base-type)) (map u/qualified-name))
        (cons :Coercion/* (descendants :Coercion/*))))

(defn derived-types-clause
  "The `:coercion_strategy` and `:effective_type` values, expressions the database evaluates against the stored row, that
  an update of `changes`, a map of Field columns, derives: a map from column to value, which may be empty."
  [changes]
  (let [strategy? (contains? changes :coercion_strategy)
        base?     (contains? changes :base_type)
        strategy  (some-> (:coercion_strategy changes) keyword)
        e         (type-term changes :effective_type)
        b         (type-term changes :base_type)]
    (cond
      strategy?
      (cond
        (some? strategy)
        (when (and (isa? strategy :Coercion/*) (not (contains? changes :effective_type)))
          {:effective_type (u/qualified-name (types/effective-type-for-coercion strategy))})

        :else
        (when-some [expr (case-or-nothing (types-repairable e b) b e)]
          {:effective_type expr}))

      base?
      (let [uncoercible (uncoercible-strategies (keyword (:base_type changes)))
            cleared     (when (seq uncoercible) [:in :coercion_strategy uncoercible])
            repair      (all-of [[:= :coercion_strategy nil] (types-repairable e b)])
            branches    (cond-> []
                          cleared               (conj [cleared b])
                          (not (false? repair)) (conj [repair b]))]
        (cond-> {}
          cleared        (assoc :coercion_strategy [:case cleared nil :else :coercion_strategy])
          (seq branches) (assoc :effective_type (into [:case] (concat (mapcat identity branches) [:else e])))))

      :else
      (let [repair (all-of [[:= :coercion_strategy nil] (types-repairable e b)])]
        (when-some [expr (case-or-nothing repair b e)]
          {:effective_type expr})))))

(def field-order-rule
  "How should we order fields."
  [[:position :asc] [:%lower.name :asc]])

(defn copy-fields-select
  "The HoneySQL fragment by which copying the application database reads all fields in id order."
  []
  {:order-by [[:id :asc]]})

(mu/defn synced-table-user-settings-clause :- [:fn vector?]
  "The clause over the TableUserSettings table aliased `alias` selecting the published tables remote sync syncs."
  [alias :- :keyword
   opts  :- ::remote-sync.schema/synced-filter-opts]
  [:and
   [:= (u/qualified-key alias :is_published) true]
   (remote-sync/synced-fk-clause alias :collection_id :model/Collection opts)])

(mu/defn synced-field-clause :- [:fn vector?]
  "The clause over the table aliased `alias`, with a `field_id` column, selecting the rows of synced tables' fields."
  [alias :- :keyword
   opts  :- ::remote-sync.schema/synced-filter-opts]
  [:in (u/qualified-key alias :field_id) ^:allow-subquery {:select [:f.id]
                                                           :from   [[(t2/table-name :model/Field) :f]]
                                                           :where  [:in :f.table_id
                                                                    ^:allow-subquery {:select [:settings.table_id]
                                                                                      :from   [[(t2/table-name :model/TableUserSettings) :settings]]
                                                                                      :where  (synced-table-user-settings-clause :settings opts)}]}])

(mu/defn field
  "The ::warehouse-schema.schema/field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :model/Field :id field-id))

(mu/defn fields
  "The Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (app-db/select-batched #(t2/select :model/Field :id [:in %]) field-ids))

(mu/defn fields-by-ids :- [:map-of ::lib.schema.id/field :map]
  "The Fields with `field-ids`, by id."
  [field-ids :- [:sequential [:maybe ::lib.schema.id/field]]]
  (u/index-by :id (app-db/select-batched #(t2/select :model/Field :id [:in %]) field-ids)))

(mu/defn field-table-id-rows
  "The ID and ::warehouse-schema.schema/table ID of the Fields with `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (app-db/select-batched #(t2/select [:model/Field :id :table_id] :id [:in %]) field-ids))

(mu/defn field-id-by-name
  "The ID of the ::warehouse-schema.schema/field named `field-name` under `parent-id` in the ::warehouse-schema.schema/table with `table-id`, or nil."
  [table-id   :- ::lib.schema.id/table
   parent-id  :- [:maybe ms/PositiveInt]
   field-name :- :string]
  (t2/select-one-pk :model/Field :name field-name :parent_id parent-id :table_id table-id))

(mu/defn field-values-eligibility
  "The columns deciding whether the ::warehouse-schema.schema/field with `field-id` should have FieldValues, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one [:model/Field :base_type :visibility_type :has_field_values :preview_display] :id field-id))

(mu/defn field-ids-for-table
  "The IDs of the Fields of the ::warehouse-schema.schema/table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-pks-set :model/Field {:where [:= :table_id table-id]}))

(mu/defn active-field-ids-for-table
  "The IDs of the active Fields of the ::warehouse-schema.schema/table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-pks-set :model/Field :table_id table-id :active true))

(defn- field-order-order-by
  [field-order]
  (case field-order
    :custom       [[:custom_position :asc]]
    :smart        [[[:case
                     (app-db/isa :semantic_type :type/PK)       0
                     (app-db/isa :semantic_type :type/Name)     1
                     (app-db/isa :semantic_type :type/Temporal) 2
                     :else                                     3]
                    :asc]
                   [:%lower.name :asc]]
    :database     [[:database_position :asc]]
    :alphabetical [[:%lower.name :asc]]))

(mu/defn field-ids-for-tables-ordered
  "The id and Table id of the Fields of the Tables with `table-ids`, by Table and then per `field-order` (`:custom`,
  `:smart`, `:database`, or `:alphabetical`)."
  [table-ids   :- [:set ::lib.schema.id/table]
   field-order :- [:enum :custom :smart :database :alphabetical]]
  (app-db/select-batched #(t2/select [:model/Field :id :table_id] :table_id [:in %]
                                     {:order-by (into [[:table_id :asc]] (field-order-order-by field-order))})
                         (sort table-ids)))

(mu/defn active-fields-for-tables
  "The active, unretired Fields of the Tables with `table-ids`, in field order within each Table."
  [table-ids :- [:set ::lib.schema.id/table]]
  (app-db/select-batched #(t2/select :model/Field
                                     :active true
                                     :table_id [:in %]
                                     :visibility_type [:not= "retired"]
                                     {:order-by field-order-rule})
                         table-ids))

(mu/defn pk-field-ids-by-table
  "A map of ::warehouse-schema.schema/table ID to the ID of its visible primary key ::warehouse-schema.schema/field for `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (app-db/select-batched-map #(t2/select-fn->fn :table_id :id :model/Field
                                                :table_id [:in %]
                                                :semantic_type (app-db/isa :type/PK)
                                                :visibility_type [:not-in ["sensitive" "retired"]]
                                                {:from [[(t2/table-name :model/Field) :f]]})
                             table-ids))

(mu/defn fields-targeting
  "The Fields whose foreign key targets one of the Fields with `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (app-db/select-batched #(t2/select :model/Field :fk_target_field_id [:in %]) field-ids))

(mu/defn nested-fields-matching
  "The Fields whose Table and `nfc_path` match one of `table-id+patterns`, each a Table id and a SQL LIKE pattern."
  [table-id+patterns :- [:sequential [:tuple ::lib.schema.id/table :string]]]
  (into []
        (m/distinct-by :id)
        (app-db/select-batched #(t2/select :model/Field {:where (into [:or]
                                                                      (map (fn [[table-id pattern]]
                                                                             [:and [:= :table_id [:auto/param table-id]] [:like :nfc_path [:auto/param pattern]]]))
                                                                      %)})
                               table-id+patterns)))

(mu/defn field-ids-of-database :- [:set ::lib.schema.id/field]
  "The ids of the Fields of the Tables of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (set (t2/select-pks-set :model/Field :table_id [:in ^:allow-subquery {:select [:id]
                                                                        :from   [(t2/table-name :model/Table)]
                                                                        :where  [:= :db_id [:auto/param database-id]]}])))

(mu/defn change-fields-case!
  "Set each of `columns` of the Fields with `field-ids` to its value in `kase`, `:lower` or `:upper` case, returning the
  number updated."
  [field-ids :- [:sequential ::lib.schema.id/field]
   kase      :- [:enum :lower :upper]
   columns   :- [:sequential :keyword]]
  (let [changes (into {} (map (fn [column] [column [kase column]])) columns)]
    (app-db/sum-batched app-db/update-partition-size #(t2/update! :model/Field :id [:in %] changes) field-ids)))

(mu/defn update-fields!
  "Apply `rows`, each the id of a Field and the columns to change, one update per distinct change."
  [rows :- [:sequential :map]]
  (app-db/update-grouped! :model/Field rows))

(mu/defn delete-fields!
  "Delete the Fields with `field-ids`, returning the number deleted."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (app-db/sum-batched app-db/delete-partition-size #(t2/delete! :model/Field :id [:in %]) field-ids))

(mu/defn child-field-ids :- [:set ::lib.schema.id/field]
  "The ids of the Fields nested directly under the Fields with `parent-ids`."
  [parent-ids :- [:set ::lib.schema.id/field]]
  (set (app-db/select-batched #(t2/select-pks-set :model/Field :parent_id [:in %]) parent-ids)))

(mu/defn field-ids-for-tables :- [:set ::lib.schema.id/field]
  "The ids of the Fields of the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (set (app-db/select-batched #(t2/select-pks-set :model/Field :table_id [:in %]) table-ids)))

(mu/defn table-database-ids :- [:map-of ::lib.schema.id/table ::lib.schema.id/database]
  "The Database id of each of the Tables with `table-ids`, by Table id."
  [table-ids :- [:set ::lib.schema.id/table]]
  (app-db/select-batched-map #(t2/select-pk->fn :db_id :model/Table :id [:in %]) table-ids))

(defn- update-by-cases!
  "Set `column` of the rows of `model` whose `key-column` is a key of `key->value` to its value there, one statement
  per partition, returning the number updated."
  [model key-column column key->value]
  (app-db/sum-batched app-db/update-partition-size (fn [part]
                                                     (t2/update! model key-column [:in (mapv key part)]
                                                                 {column (into [:case] (mapcat (fn [[k v]] [[:= key-column k] v])) part)})) key->value))

(mu/defn update-field-custom-positions!
  "Set the `custom_position` of each ::warehouse-schema.schema/field in `field-id->position`, returning the number
  updated."
  [field-id->position :- [:map-of ::lib.schema.id/field :int]]
  (update-by-cases! :model/Field :id :custom_position field-id->position))

(mu/defn update-field-positions!
  "Set the `position` of each ::warehouse-schema.schema/field in `field-id->position`, returning the number updated."
  [field-id->position :- [:map-of ::lib.schema.id/field :int]]
  (update-by-cases! :model/Field :id :position field-id->position))

(mu/defn clear-fk-targets-to-fields!
  "Clear the target, and an FK semantic type, of every ::warehouse-schema.schema/field targeting one of the Fields
  with `field-ids`, returning the number updated."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (let [parts (mapv vec (partition-all app-db/update-partition-size field-ids))]
    (run! #(t2/update! :model/Field {:fk_target_field_id [:in %] :semantic_type :type/FK} {:semantic_type nil}) parts)
    (transduce (map #(t2/update! :model/Field {:fk_target_field_id [:in %]} {:fk_target_field_id nil})) + 0 parts)))

(mu/defn field-database-ids :- [:map-of ::lib.schema.id/field ::lib.schema.id/database]
  "The ::warehouses.schema/database ID of each ::warehouse-schema.schema/field in `field-ids`, by Field id."
  [field-ids :- [:set ::lib.schema.id/field]]
  (into {}
        (map (juxt :id :db_id))
        (app-db/select-batched #(t2/query {:select [:f.id :t.db_id]
                                           :from   [[(t2/table-name :model/Field) :f]]
                                           :join   [[(t2/table-name :model/Table) :t] [:= :t.id :f.table_id]]
                                           :where  [:in :f.id %]})
                               field-ids)))

(mu/defn set-fields-active!
  "Set the active flag of the Fields with `field-ids`, returning the number updated."
  [field-ids :- [:sequential ::lib.schema.id/field]
   active?   :- :boolean]
  (app-db/sum-batched app-db/update-partition-size #(t2/update! :model/Field :id [:in %] {:active active?}) field-ids))

(mu/defn user-renamed-field-names :- [:set :string]
  "The lower-cased names, among `names`, of the Fields of the Table with `table-id` whose display name a user set.
  Uploads use it to leave those Fields alone when appending re-derives display names from the CSV header."
  [table-id :- ::lib.schema.id/table
   names    :- [:set :string]]
  (set
   (app-db/select-batched
    #(t2/select-fn-set (comp u/lower-case-en :name)
                       :model/Field
                       {:select    [:f.name]
                        :from      [[(t2/table-name :model/Field) :f]]
                        :left-join [[(t2/table-name :model/FieldUserSettings) :u] [:= :u.field_id :f.id]]
                        :where     [:and
                                    [:= :f.table_id table-id]
                                    [:in [:lower :f.name] %]
                                    [:not= :u.display_name nil]]})
    names)))

(mu/defn field-names-reducible
  "A reducible of the id, name, and display name of every ::warehouse-schema.schema/field, plus its user-set display
  name from FieldUserSettings (if any) as `:user_display_name`."
  []
  (t2/reducible-query
   {:select    [:f.id :f.name :f.display_name [:u.display_name :user_display_name]]
    :from      [[(t2/table-name :model/Field) :f]]
    :left-join [[(t2/table-name :model/FieldUserSettings) :u] [:= :u.field_id :f.id]]}))

;;; -------------------------------------------- FieldUserSettings --------------------------------------------

(mu/defn field-user-settings
  "The FieldUserSettings of the ::warehouse-schema.schema/field with `field-id`, or nil (also for a nil `field-id`, e.g. a ::warehouse-schema.schema/field not yet
  inserted)."
  [field-id :- [:maybe ::lib.schema.id/field]]
  (t2/select-one :model/FieldUserSettings :field_id field-id))

(def ^:private field-user-settings-update-keys
  "The columns an insert or update of a FieldUserSettings accepts."
  [:field_id :created_at :updated_at :semantic_type :description :display_name :visibility_type :fk_target_field_id :has_field_values :effective_type :coercion_strategy :caveats :points_of_interest :json_unfolding :settings :data_sensitivity :custom_position :description_set :semantic_type_set :fk_target_field_id_set])

(mu/defn field-ids-with-user-settings-for-tables :- [:set ::lib.schema.id/field]
  "The ids of the Fields of the Tables with `table-ids` that have a FieldUserSettings row."
  [table-ids :- [:set ::lib.schema.id/table]]
  (set (app-db/select-batched #(t2/select-fn-set :field_id :model/FieldUserSettings
                                                 {:from  [[(t2/table-name :model/FieldUserSettings) :u]]
                                                  :join  [[(t2/table-name :model/Field) :f] [:= :f.id :u.field_id]]
                                                  :where [:in :f.table_id %]})
                              table-ids)))

(mu/defn update-field-user-settings!
  "Apply `changes` to the FieldUserSettings of the ::warehouse-schema.schema/field with `field-id`, returning the number updated."
  [field-id :- ::lib.schema.id/field
   changes  :- (mut/select-keys ::warehouse-schema.schema/field-user-settings.update field-user-settings-update-keys)]
  (t2/update! :model/FieldUserSettings :field_id field-id changes))

(mu/defn insert-field-user-settings-row! :- ::warehouse-schema.schema/field-user-settings
  "Insert the FieldUserSettings `row` in a savepoint, so that a duplicate key leaves the enclosing transaction usable, returning the inserted instance."
  [row :- ::warehouse-schema.schema/field-user-settings.create]
  (t2/with-transaction [_conn]
    (t2/insert-returning-instance! :model/FieldUserSettings row)))

(mu/defn update-field-user-settings-custom-positions!
  "Set the `custom_position` of the FieldUserSettings of each Field in `field-id->position`, returning the number
  updated."
  [field-id->position :- [:map-of ::lib.schema.id/field :int]]
  (update-by-cases! :model/FieldUserSettings :field_id :custom_position field-id->position))

(mu/defn unset-user-settings-fk-target!
  "Unset the user-set FK target of the ::warehouse-schema.schema/field with `field-id` in its settings, returning the
  number updated."
  [field-id :- ::lib.schema.id/field]
  (t2/update! :model/FieldUserSettings {:field_id field-id, :fk_target_field_id [:not= nil]}
              {:fk_target_field_id nil, :fk_target_field_id_set false}))

(defn- targeting-fields-clause
  "The clause over FieldUserSettings selecting those of the Fields targeting one of the Fields with `field-ids`."
  [field-ids]
  [:in :field_id ^:allow-subquery {:select [:id]
                                   :from   [(t2/table-name :model/Field)]
                                   :where  [:in :fk_target_field_id field-ids]}])

(mu/defn field-user-settings-targeting
  "The FieldUserSettings that name one of the Fields with `field-ids` as their FK target, or whose Field targets one
  of them with a user-set FK semantic type."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (into []
        (m/distinct-by :id)
        (app-db/select-batched #(t2/select :model/FieldUserSettings
                                           {:where [:or
                                                    [:in :fk_target_field_id %]
                                                    [:and [:= :semantic_type "type/FK"] (targeting-fields-clause %)]]})
                               field-ids)))

(mu/defn clear-user-settings-fk-targets-to-fields!
  "Unset the user-set FK semantic type and target of every ::warehouse-schema.schema/field targeting one of the Fields
  with `field-ids`, by its settings or by its own row, returning the number updated."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (let [changes {:semantic_type nil, :semantic_type_set false, :fk_target_field_id nil, :fk_target_field_id_set false}
        parts   (mapv vec (partition-all app-db/update-partition-size field-ids))]
    (+ (transduce (map #(t2/update! :model/FieldUserSettings {:fk_target_field_id [:in %]} changes)) + 0 parts)
       (transduce (map #(t2/update! :model/FieldUserSettings
                                    :semantic_type :type/FK
                                    :field_id [:in ^:allow-subquery {:select [:id]
                                                                     :from   [(t2/table-name :model/Field)]
                                                                     :where  [:in :fk_target_field_id %]}]
                                    changes))
                  + 0 parts))))

(defn- empty-field-user-settings-clause
  "The clause over FieldUserSettings selecting those, among those of the Fields with `field-ids`, that hold no user
  value and no true flag."
  [field-ids]
  (into [:and [:in :field_id field-ids]]
        (concat (for [column user-settings/user-settable-field-columns]
                  [:= column nil])
                (for [flag (vals user-settings/field-set-flags)]
                  [:or [:= flag nil] [:= flag false]]))))

(mu/defn empty-field-user-settings
  "The FieldUserSettings, among those of the Fields with `field-ids`, that hold no user value and no true flag."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (app-db/select-batched #(t2/select :model/FieldUserSettings {:where (empty-field-user-settings-clause %)}) field-ids))

(mu/defn delete-empty-field-user-settings!
  "Delete the FieldUserSettings, among those of the Fields with `field-ids`, that hold no user value and no true flag,
  returning the number deleted."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (app-db/sum-batched app-db/delete-partition-size #(t2/delete! :model/FieldUserSettings {:where (empty-field-user-settings-clause %)}) field-ids))

(mu/defn field-user-settings-for-fields
  "The FieldUserSettings of the Fields with `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (app-db/select-batched #(t2/select :model/FieldUserSettings :field_id [:in %]) field-ids))

(mu/defn field-user-settings-by-ids
  "The FieldUserSettings with `ids`."
  [ids :- [:sequential pos-int?]]
  (app-db/select-batched #(t2/select :model/FieldUserSettings :id [:in %]) ids))

(mu/defn insert-field-user-settings-returning-instances!
  "Insert the FieldUserSettings `rows`, one statement per distinct set of columns so that a column a row leaves out keeps
  its default, and return the inserted instances in the order of `rows`."
  [rows :- [:sequential ::warehouse-schema.schema/field-user-settings.create]]
  (app-db/insert-returning-instances! :model/FieldUserSettings rows))

(mu/defn update-field-user-settings-by-ids!
  "Apply `changes` to the FieldUserSettings with `ids`, returning the number updated."
  [ids     :- [:sequential pos-int?]
   changes :- (mut/dissoc ::warehouse-schema.schema/field-user-settings.update :id)]
  (app-db/sum-batched app-db/update-partition-size #(t2/update! :model/FieldUserSettings :id [:in %] changes) ids))

(mu/defn update-field-user-settings-rows!
  "Apply `rows`, each the id of a FieldUserSettings and the columns to change, one update per distinct change."
  [rows :- [:sequential :map]]
  (app-db/update-grouped! :model/FieldUserSettings rows))

;;; -------------------------------------------- TableUserSettings --------------------------------------------

(def ^:private table-user-settings-update-keys
  "The columns an insert or update of a TableUserSettings accepts."
  [:table_id :created_at :updated_at :display_name :description :entity_type :visibility_type :caveats
   :points_of_interest :data_layer :data_source :owner_email :owner_user_id :field_order :show_in_getting_started
   :data_authority :is_published :collection_id :description_set
   :visibility_type_set :data_layer_set :data_source_set])

(mu/defn table-user-settings
  "The TableUserSettings of the ::warehouse-schema.schema/table with `table-id`, or nil (also for a nil `table-id`,
  e.g. a ::warehouse-schema.schema/table not yet inserted)."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/TableUserSettings :table_id table-id))

(mu/defn table-ids-with-user-settings :- [:set ::lib.schema.id/table]
  "The ids, among `table-ids`, of the Tables that already have a TableUserSettings row."
  [table-ids :- [:set ::lib.schema.id/table]]
  (set (app-db/select-batched #(t2/select-fn-set :table_id :model/TableUserSettings :table_id [:in %]) table-ids)))

(mu/defn table-user-settings-for-tables
  "The TableUserSettings of the Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (app-db/select-batched #(t2/select :model/TableUserSettings :table_id [:in %]) table-ids))

(mu/defn table-user-settings-by-ids
  "The TableUserSettings with `ids`."
  [ids :- [:sequential pos-int?]]
  (app-db/select-batched #(t2/select :model/TableUserSettings :id [:in %]) ids))

(mu/defn insert-table-user-settings-returning-instances!
  "Insert the TableUserSettings `rows`, one statement per distinct set of columns so that a column a row leaves out keeps
  its default, and return the inserted instances in the order of `rows`."
  [rows :- [:sequential ::warehouse-schema.schema/table-user-settings.create]]
  (app-db/insert-returning-instances! :model/TableUserSettings rows))

(mu/defn update-table-user-settings-rows!
  "Apply `rows`, each the id of a TableUserSettings and the columns to change, one update per distinct change."
  [rows :- [:sequential :map]]
  (app-db/update-grouped! :model/TableUserSettings rows))

(defn- empty-table-user-settings-clause
  "The clause over TableUserSettings selecting those, among those of the Tables with `table-ids`, that hold no user
  value and no true flag."
  [table-ids]
  (into [:and [:in :table_id table-ids]]
        (concat (for [column user-settings/user-settable-table-columns]
                  [:= column nil])
                (for [flag (vals user-settings/table-set-flags)]
                  [:or [:= flag nil] [:= flag false]]))))

(mu/defn empty-table-user-settings
  "The TableUserSettings, among those of the Tables with `table-ids`, that hold no user value and no true flag."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (app-db/select-batched #(t2/select :model/TableUserSettings {:where (empty-table-user-settings-clause %)}) table-ids))

(mu/defn delete-empty-table-user-settings!
  "Delete the TableUserSettings, among those of the Tables with `table-ids`, that hold no user value and no true flag,
  returning the number deleted."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (app-db/sum-batched app-db/delete-partition-size #(t2/delete! :model/TableUserSettings {:where (empty-table-user-settings-clause %)}) table-ids))

(mu/defn insert-table-user-settings-row! :- ::warehouse-schema.schema/table-user-settings
  "Insert the TableUserSettings `row` in a savepoint, so that a duplicate key leaves the enclosing transaction usable, returning the inserted instance."
  [row :- ::warehouse-schema.schema/table-user-settings.create]
  (t2/with-transaction [_conn]
    (t2/insert-returning-instance! :model/TableUserSettings row)))

(mu/defn update-table-user-settings!
  "Apply `changes` to the TableUserSettings of the ::warehouse-schema.schema/table with `table-id`, returning the
  number updated."
  [table-id :- ::lib.schema.id/table
   changes  :- (mut/select-keys ::warehouse-schema.schema/table-user-settings.update table-user-settings-update-keys)]
  (t2/update! :model/TableUserSettings :table_id table-id changes))

;;; ---------------------------------------------- FieldValues ----------------------------------------------

(mu/defn field-values-of-type
  "The FieldValues of `type` with `hash-key` for the ::warehouse-schema.schema/field with `field-id`."
  [field-id :- ::lib.schema.id/field
   type     :- [:enum :full :sandbox :impersonation :linked-filter :advanced]
   hash-key :- [:maybe :string]]
  (t2/select :model/FieldValues :field_id field-id :type type :hash_key hash-key))

(mu/defn full-field-values-for-fields
  "The full FieldValues of the Fields with `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (app-db/select-batched #(t2/select :model/FieldValues :field_id [:in %] :type :full :hash_key nil) field-ids))

(mu/defn full-field-values-rows
  "The ::warehouse-schema.schema/field ID and values of the full FieldValues of the ::warehouse-schema.schema/field with `field-id`."
  [field-id :- ::lib.schema.id/field]
  (t2/select [:model/FieldValues :field_id :values] :field_id field-id :type :full))

(mu/defn full-field-values-for-tables
  "The ::warehouse-schema.schema/field ID, values, and ::warehouse-schema.schema/table ID of the full FieldValues of the normal Fields of the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (app-db/select-batched #(t2/select [:model/FieldValues :field_id :values :field.table_id]
                                     {:join  [[(t2/table-name :model/Field) :field]
                                              [:= :metabase_fieldvalues.field_id :field.id]]
                                      :where [:and
                                              [:in :field.table_id %]
                                              [:= :field.visibility_type "normal"]
                                              [:= :metabase_fieldvalues.type "full"]]})
                         table-ids))

(mu/defn full-field-values-with-human-readable-values
  "The values and human-readable values of the full FieldValues of the ::warehouse-schema.schema/field with `field-id` if it has
  human-readable values, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one [:model/FieldValues :values :human_readable_values]
                 {:where [:and
                          [:= :type "full"]
                          [:= :field_id field-id]
                          [:not= :human_readable_values nil]
                          [:not= :human_readable_values "{}"]]}))

(mu/defn field-values-last-used-at
  "The latest `last_used_at` of any FieldValues of the ::warehouse-schema.schema/field with `field-id`."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :max-last-used-at [:model/FieldValues [[:max :last_used_at] :max-last-used-at]]
                    {:where [:= :field_id field-id]}))

(mu/defn field-values-last-used-at-by-field :- [:map-of ::lib.schema.id/field :any]
  "The latest `last_used_at` of any FieldValues of each of the Fields with `field-ids` that has any, by Field id."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (app-db/select-batched-map
   #(t2/select-fn->fn :field_id :max-last-used-at [:model/FieldValues :field_id [[:max :last_used_at] :max-last-used-at]]
                      {:where    [:in :field_id [:auto/param %]]
                       :group-by [:field_id]})
   field-ids))

(mu/defn full-field-values-by-field
  "The `columns` of the full FieldValues of the Fields with `field-ids`."
  [columns   :- [:or :keyword [:sequential :keyword]]
   field-ids :- [:set ::lib.schema.id/field]]
  (app-db/select-batched #(t2/select columns :field_id [:in %] :type :full) field-ids))

(mu/defn dimension-for-field
  "The Dimension of the ::warehouse-schema.schema/field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :model/Dimension :field_id field-id))

(mu/defn dimensions-of-field
  "The `dimension-type` Dimensions of the Field with `field-id`."
  [field-id       :- ::lib.schema.id/field
   dimension-type :- ::warehouse-schema.schema/dimension.type]
  (t2/select :model/Dimension :field_id [:auto/param field-id] :type dimension-type))

(mu/defn dimensions-reading-fields
  "The Dimensions whose human-readable values come from the Fields with `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (app-db/select-batched #(t2/select :model/Dimension :human_readable_field_id [:in %]) field-ids))

(mu/defn rename-dimensions-for-fields!
  "Set the name of the Dimension of each ::warehouse-schema.schema/field in `field-id->name` to its name there,
  returning the number updated."
  [field-id->name :- [:map-of ::lib.schema.id/field :string]]
  (update-by-cases! :model/Dimension :field_id :name field-id->name))

(mu/defn dimensions-for-fields
  "The Dimensions of the Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (app-db/select-batched #(t2/select :model/Dimension :field_id [:in %]) field-ids))

(mu/defn external-remap-target-table-ids :- [:map-of ::lib.schema.id/table [:set ::lib.schema.id/table]]
  "The ids of the other Tables that a query of each of the Tables with `table-ids` joins to show the values of an
  externally remapped active Field through its foreign key, by Table id, leaving out Tables without any."
  [table-ids :- [:set ::lib.schema.id/table]]
  (reduce (fn [m {:keys [table_id target_table_id]}]
            (update m table_id (fnil conj #{}) target_table_id))
          {}
          (app-db/select-batched
           #(t2/query {:select [[:f.table_id :table_id] [:target.table_id :target_table_id]]
                       :from   [[(t2/table-name :model/Field) :f]]
                       :join   [[(t2/table-name :model/Dimension) :d] [:and
                                                                       [:= :d.field_id :f.id]
                                                                       [:= :d.type "external"]]
                                [(t2/table-name :model/Field) :target] [:= :target.id :f.fk_target_field_id]
                                [(t2/table-name :model/Field) :readable] [:= :readable.id :d.human_readable_field_id]]
                       :where  [:and
                                [:in :f.table_id %]
                                [:= :f.active true]
                                [:not-in :f.visibility_type ["retired" "sensitive"]]
                                [:not-in :target.visibility_type ["retired" "sensitive"]]
                                [:not-in :readable.visibility_type ["retired" "sensitive"]]
                                [:not= :target.table_id :f.table_id]]})
           table-ids)))

(mu/defn update-field-values!
  "Apply `rows`, each the id of a FieldValues and the columns to change, one update per distinct change."
  [rows :- [:sequential :map]]
  (app-db/update-grouped! :model/FieldValues rows))

(mu/defn full-field-values
  "The full FieldValues of the ::warehouse-schema.schema/field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :model/FieldValues :field_id [:auto/param field-id] :type :full))

(mu/defn advanced-field-values
  "The advanced FieldValues of the ::warehouse-schema.schema/field with `field-id` and `hash-key`, or nil."
  [field-id :- ::lib.schema.id/field
   hash-key :- :string]
  (t2/select-one :model/FieldValues :field_id [:auto/param field-id] :type :advanced :hash_key [:auto/param hash-key]))

(mu/defn insert-field-values-row! :- ::warehouse-schema.schema/field-values
  "Insert the FieldValues `row` in a savepoint, so that a duplicate key leaves the enclosing transaction usable, returning the inserted instance."
  [row :- ::warehouse-schema.schema/field-values.create]
  (t2/with-transaction [_conn]
    (t2/insert-returning-instance! :model/FieldValues row)))

(mu/defn touch-field-values!
  "Stamp `last_used_at` on the FieldValues with `field-values-id`, returning the number updated."
  [field-values-id :- ms/PositiveInt]
  (t2/update! :model/FieldValues :id field-values-id {:last_used_at :%now}))

(defn- field-values-of-fields-kvs
  "The conditions on FieldValues of the Fields with `field-ids`."
  [field-ids]
  [:field_id [:in field-ids]])

(defn- field-values-of-types-kvs
  "The conditions on FieldValues of `types` of the Fields with `field-ids`."
  [field-ids types]
  [:field_id [:in field-ids] :type [:in types]])

(defn- field-values-of-tables-kvs
  "The conditions on FieldValues of the Fields of the Tables with `table-ids`."
  [table-ids]
  [:field_id [:in ^:allow-subquery {:select [:id]
                                    :from   [(t2/table-name :model/Field)]
                                    :where  [:in :table_id table-ids]}]])

(defn- field-values-of-database-kvs
  "The conditions on FieldValues of every Field of the Database with `database-id`."
  [database-id]
  [:field_id [:in ^:allow-subquery {:select     [:f.id]
                                    :from       [[:metabase_field :f]]
                                    :right-join [[:metabase_table :t] [:= :f.table_id :t.id]]
                                    :where      [:= :t.db_id [:auto/param database-id]]}]])

(mu/defn field-values-ids-of-fields :- [:sequential ms/PositiveInt]
  "The ids of every FieldValues of the Fields with `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (app-db/select-batched #(apply t2/select-pks-vec :model/FieldValues (field-values-of-fields-kvs %)) field-ids))

(mu/defn field-values-ids-of-types :- [:sequential ms/PositiveInt]
  "The ids of the FieldValues of `types` of the Fields with `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]
   types     :- [:set :keyword]]
  (app-db/select-batched #(apply t2/select-pks-vec :model/FieldValues (field-values-of-types-kvs % types)) field-ids))

(mu/defn field-values-ids-of-tables :- [:sequential ms/PositiveInt]
  "The ids of the FieldValues of the Fields of the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (app-db/select-batched #(apply t2/select-pks-vec :model/FieldValues (field-values-of-tables-kvs %)) table-ids))

(mu/defn field-values-ids-of-database :- [:sequential ms/PositiveInt]
  "The ids of the FieldValues of every Field of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (vec (apply t2/select-pks-vec :model/FieldValues (field-values-of-database-kvs database-id))))

(mu/defn field-values-ids-and-field-ids :- [:sequential [:map [:id ms/PositiveInt] [:field_id ::lib.schema.id/field]]]
  "The id and Field id of every FieldValues of the Fields with `field-ids`."
  [field-ids :- [:sequential {:min 1} ::lib.schema.id/field]]
  (app-db/select-batched #(t2/select [:model/FieldValues :id :field_id] :field_id [:in [:auto/param %]]) field-ids))

(mu/defn expired-field-values-ids-of-database :- [:sequential ms/PositiveInt]
  "The ids of the FieldValues of `types` of the active, normal-visibility Fields of the synced Tables of the Database
  with `database-id` created more than `max-age-days` days ago."
  [database-id  :- ::lib.schema.id/database
   types        :- [:set :keyword]
   max-age-days :- :int]
  (vec (t2/select-pks-vec :model/FieldValues
                          :type [:in types]
                          {:where [:and
                                   [:< :metabase_fieldvalues.created_at
                                    (h2x/add-interval-honeysql-form (app-db/db-type) :%now (- max-age-days) :day)]
                                   [:exists ^:allow-subquery
                                    {:select [[[:inline 1] :one]]
                                     :from   [[(t2/table-name :model/Field) :f]]
                                     :join   [[(t2/table-name :model/Table) :t] [:= :t.id :f.table_id]]
                                     :where  [:and
                                              [:= :f.id :metabase_fieldvalues.field_id]
                                              [:= :f.active true]
                                              [:= :f.visibility_type "normal"]
                                              [:= :t.db_id [:auto/param database-id]]
                                              [:= :t.active true]
                                              [:= :t.visibility_type nil]]}]]})))

;;; ------------------------------------------------- ::warehouse-schema.schema/table -------------------------------------------------

(mu/defn collections-by-published-table-id
  "A map of Table ID to the Collection it is published into, the root Collection for one published into none, for
  the published Tables among `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (let [published (app-db/select-batched-map #(t2/select-fn->fn :table_id :collection_id
                                                                [:model/TableUserSettings :table_id :collection_id]
                                                                :table_id [:in %]
                                                                :is_published true)
                                             table-ids)
        by-id     (when-let [collection-ids (not-empty (into #{} (keep val) published))]
                    (app-db/select-batched-map #(t2/select-pk->fn identity :model/Collection :id [:in %])
                                               collection-ids))
        root      (delay (collection.root/hydrated-root-collection))]
    (update-vals published #(if % (get by-id %) @root))))

(mu/defn tables-by-ids :- [:map-of ::lib.schema.id/table :map]
  "The Tables with `table-ids`, by id."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (u/index-by :id (app-db/select-batched #(t2/select :model/Table :id [:in %]) table-ids)))

(mu/defn table
  "The ::warehouse-schema.schema/table with `table-id`, or nil."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/Table :id table-id))

(mu/defn table-ids-of-database :- [:set ::lib.schema.id/table]
  "The ids of the Tables of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (set (t2/select-pks-set :model/Table :db_id [:auto/param database-id])))

(mu/defn change-tables-case!
  "Set each of `columns` of the Tables with `table-ids` to its value in `kase`, `:lower` or `:upper` case, returning the
  number updated."
  [table-ids :- [:sequential ::lib.schema.id/table]
   kase      :- [:enum :lower :upper]
   columns   :- [:sequential :keyword]]
  (let [changes (into {} (map (fn [column] [column [kase column]])) columns)]
    (app-db/sum-batched app-db/update-partition-size #(t2/update! :model/Table :id [:in %] changes) table-ids)))

(mu/defn tables
  "The Tables with `table-ids`."
  [table-ids :- [:or [:set ::lib.schema.id/table] [:sequential ::lib.schema.id/table]]]
  (app-db/select-batched #(t2/select :model/Table :id [:in %]) table-ids))

(mu/defn table-by-name
  "The ::warehouse-schema.schema/table named `table-name` in `schema` of the ::warehouses.schema/database with `database-id`, or nil."
  [database-id :- ::lib.schema.id/database
   schema      :- [:maybe :string]
   table-name  :- :string]
  (t2/select-one :model/Table :name table-name :db_id database-id :schema schema))

(mu/defn table-name-and-schema
  "The name and schema of the ::warehouse-schema.schema/table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one [:model/Table :name :schema] :id table-id))

(mu/defn table-database-id
  "The ::warehouses.schema/database ID of the ::warehouse-schema.schema/table with `table-id`."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one-fn :db_id :model/Table :id table-id))

(defn active-tables-for-database
  "The active Tables of the Database with `database-id`."
  [database-id]
  (t2/select :model/Table :db_id database-id :active true))

(defn active-table-schemas
  "The distinct schemas of the active Tables of the Database with `database-id`, in schema order. When
  `include-hidden?` is false, restricted to Tables with no `visibility_type` (a non-nil value means the Table is
  hidden -- see `metabase.warehouse-schema.models.table/visibility-types`)."
  [database-id include-hidden?]
  (let [clauses (cond-> []
                  (not include-hidden?) (conj [:= :visibility_type nil]))]
    (t2/select-fn-set :schema :model/Table :db_id database-id :active true
                      (merge {:order-by [[:%lower.schema :asc]]}
                             (when clauses
                               {:where (into [:and] clauses)})))))

(defn active-tables-in-schema
  "The active Tables in `schema` of the Database with `database-id`, in display name order."
  [database-id schema]
  (t2/select :model/Table
             :db_id database-id
             :schema schema
             :active true
             {:order-by [[:display_name :asc]]}))

(defn active-visible-tables-in-schema
  "The active, visible Tables in `schema` of the Database with `database-id`, in display name order."
  [database-id schema]
  (t2/select :model/Table
             :db_id database-id
             :schema schema
             :active true
             :visibility_type nil
             {:order-by [[:display_name :asc]]}))

(mu/defn unarchived-segments-for-tables
  "The unarchived Segments of the Tables with `table-ids`, ordered by name within each Table."
  [table-ids :- [:set ::lib.schema.id/table]]
  (app-db/select-batched #(t2/select :model/Segment :table_id [:in %] :archived false {:order-by [[:name :asc]]})
                         table-ids))

(mu/defn unarchived-measures-for-tables
  "The unarchived Measures of the Tables with `table-ids`, ordered by name within each Table."
  [table-ids :- [:set ::lib.schema.id/table]]
  (app-db/select-batched #(t2/select :model/Measure :table_id [:in %] :archived false {:order-by [[:name :asc]]})
                         table-ids))

(mu/defn unarchived-metric-cards-for-tables
  "The unarchived metric Cards of the Tables with `table-ids`, ordered by name within each Table, with their stored
  columns only: no `:query_description`, which the Card computes per row from the metric's query."
  [table-ids :- [:set ::lib.schema.id/table]]
  (app-db/select-batched #(t2/select [:model/Card :*] :table_id [:in %] :archived false :type :metric
                                     {:order-by [[:name :asc]]})
                         table-ids))

(mu/defn transforms-by-target-table-id
  "A map of Table ID to the Transform whose target is that Table, for `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (app-db/select-batched-map #(t2/select-fn->fn :target_table_id identity :model/Transform
                                                :target_table_id [:in %]
                                                {:order-by [[:id :asc]]})
                             table-ids))

(mu/defn table-names-reducible
  "A reducible of the id, name, and display name of every ::warehouse-schema.schema/table, plus the user's own
  display name (`:user_display_name`), if any."
  []
  (t2/reducible-query
   {:select    [:t.id :t.name :t.display_name
                [:u.display_name :user_display_name]]
    :from      [[(t2/table-name :model/Table) :t]]
    :left-join [[(t2/table-name :model/TableUserSettings) :u] [:= :u.table_id :t.id]]}))

(mu/defn database
  "The ::warehouses.schema/database with `database-id`, or nil."
  [database-id :- [:maybe ::lib.schema.id/database]]
  (t2/select-one :model/Database :id database-id))

(mu/defn database-engine
  "The engine of the ::warehouses.schema/database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one-fn :engine :model/Database :id database-id))

(mu/defn collections-for-content-checks
  "The ID, namespace, type and `archived` flag of each of the Collections with `collection-ids`, by id."
  [collection-ids :- [:set ::lib.schema.id/collection]]
  (u/index-by :id (app-db/select-batched #(t2/select [:model/Collection :id :namespace :type :archived] :id [:in %])
                                         collection-ids)))

(mu/defn database-engines :- [:map-of ::lib.schema.id/database :keyword]
  "The engine of each of the Databases with `database-ids`, by id."
  [database-ids :- [:set ::lib.schema.id/database]]
  (app-db/select-batched-map #(t2/select-pk->fn :engine :model/Database :id [:in %]) database-ids))

(mu/defn database-name
  "The name of the ::warehouses.schema/database with `database-id`."
  [database-id :- [:maybe ::lib.schema.id/database]]
  (t2/select-one-fn :name :model/Database :id database-id))

;;; ---------------------------------------------- Other models ----------------------------------------------

(mu/defn user-summaries-by-id
  "A map of ID to the ID, email, and names of the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (app-db/select-batched-map #(t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in %])
                             user-ids))

(mu/defn synced-table-user-settings-items :- [:sequential ::warehouse-schema.schema/table-user-settings]
  "The TableUserSettings with `ids`, with their Table, and their Collection and its ancestors, as remote sync
  lists them."
  [ids :- [:sequential pos-int?]]
  (let [root (collection.root/hydrated-root-collection)]
    (-> (app-db/select-batched #(t2/select [:model/TableUserSettings :id :table_id :display_name :collection_id] :id [:in %])
                               ids)
        (t2/hydrate :table [:collection :effective_ancestors])
        (->> (mapv #(collection.root/hydrate-root-collection % root))))))

(mu/defn synced-field-user-settings-items :- [:sequential ::warehouse-schema.schema/field-user-settings]
  "The FieldUserSettings with `ids`, with their Field, its Table, and that Table's Collection and ancestors, as remote
  sync lists them."
  [ids :- [:sequential pos-int?]]
  (let [root (collection.root/hydrated-root-collection)]
    (-> (app-db/select-batched #(t2/select [:model/FieldUserSettings :id :field_id :display_name] :id [:in %]) ids)
        (t2/hydrate [:field [:table [:collection :effective_ancestors]]])
        (->> (mapv (fn [settings]
                     (update-in settings [:field :table] #(some-> % (update :collection (fn [collection] (or collection root)))))))))))

(mu/defn synced-dimension-items :- [:sequential ::warehouse-schema.schema/dimension]
  "The Dimensions with `ids`, with their Field, its Table, and that Table's Collection and ancestors, as remote sync
  lists them."
  [ids :- [:sequential pos-int?]]
  (let [root (collection.root/hydrated-root-collection)]
    (-> (app-db/select-batched #(t2/select [:model/Dimension :id :field_id :name] :id [:in %]) ids)
        (t2/hydrate [:field [:table [:collection :effective_ancestors]]])
        (->> (mapv (fn [dimension]
                     (update-in dimension [:field :table] #(some-> % (update :collection (fn [collection] (or collection root)))))))))))

(mu/defn dependency-table-items :- :map
  "The query of the Tables the dependencies lists hold for `opts`, as `entity_id`, `name` and `location`: those the
  user queries, active or not, so that dependencies broken by a dropped or hidden table stay visible, without those of
  the sample and audit databases unless `:include-sample-databases?`, located by their database."
  [{:keys [include-sample-databases?] :as opts} :- :metabase.dependencies.items/items-opts]
  {:select    [[:metabase_table.id :entity_id] [:metabase_table.display_name :name] [:database.name :location]]
   :from      [:metabase_table]
   :left-join [[:metabase_database :database] [:= :metabase_table.db_id :database.id]]
   :where     (into [:and]
                    (remove nil?)
                    [(collections.listing/visible-tables-clause :metabase_table.id opts)
                     (when-not include-sample-databases?
                       [:and [:not :database.is_sample] [:not :database.is_audit]])])})

(mu/defn collection-table-items :- [:maybe :map]
  "The query of the published tables in `collection` that the user queries and that the collection items listing of
  `opts` holds, nil when the library is not a feature of the instance or
  `opts` restrict the items to those created by a user, which tables do not record, and none of them when `opts` restrict
  the items to the pinned ones, which no table is."
  [collection                                       :- :map
   {:keys [archived? pinned-state created-by-id]} :- :map]
  (when (and (premium-features/has-feature? :library)
             (nil? created-by-id))
    {:select [:t.id
              [:t.id :table_id]
              [:t.display_name :name]
              :t.description
              :s.collection_id
              [:t.db_id :database_id]
              [[:!= :t.archived_at nil] :archived]
              [(h2x/literal "table") :model]]
     :from   [[(t2/table-name :model/Table) :t]]
     :join   [[(t2/table-name :model/TableUserSettings) :s] [:= :s.table_id :t.id]]
     :where  [:and
              [:= :s.is_published true]
              (collections.listing/poison-when-pinned-clause pinned-state)
              (collections.listing/visible-items-clause :s.collection_id archived? {:root-namespace nil})
              (perms/visible-tables-filter-clause
               :t.id
               (api/current-user-info)
               {:perms/view-data      :unrestricted
                :perms/create-queries :query-builder}
               {:active-only? false, :include-published-via-collection? true})
              [:= :s.collection_id (:id collection)]
              (if archived?
                [:!= :t.archived_at nil]
                [:= :t.archived_at nil])]}))

(mu/defn recent-view-tables
  "The non-hidden Tables with `table-ids` with their Database name and sync status."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/hydrate
   (app-db/select-batched
    #(t2/select :model/Table
                {:select [:t.id :t.name :t.description
                          :t.display_name :t.active :t.visibility_type :t.schema
                          [:db.name :database-name]
                          [:db.id :db_id]
                          [:db.initial_sync_status :initial-sync-status]]
                 :from [[(t2/table-name :model/Table) :t]]
                 :where [:and
                         [:or
                          [:= :visibility_type nil]
                          [:!= :visibility_type "hidden"]]
                         [:in :t.id %]]
                 :left-join [[:metabase_database :db]
                             [:= :db.id :t.db_id]]})
    table-ids)
   :can_read :can_write))

(mu/defn table-user-settings-ids-of-published-tables-in-collections
  "The ids of the TableUserSettings of the published Tables in the Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (not-empty (app-db/select-batched #(t2/select-pks-vec :model/TableUserSettings :collection_id [:in %] :is_published true)
                                    collection-ids)))

(defn- table-ids-of-databases-query
  [database-ids]
  ^:allow-subquery {:from [(t2/table-name :model/Table)], :select [:id], :where [:in :db_id database-ids]})

(mu/defn fields-exist-for-databases?
  "Whether any Field belongs to a Table of the Databases with `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/exists? :model/Field :table_id [:in (table-ids-of-databases-query database-ids)]))

(mu/defn delete-childless-fields-for-databases!
  "Delete the childless Fields of the Tables of the Databases with `database-ids`, returning the number deleted."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (let [table-ids-query (table-ids-of-databases-query database-ids)
        extra-clause    (if (= (app-db/db-type) :mysql)
                          ;; double-wrapped subquery to work around the MySQL restriction on selecting from the
                          ;; DELETE target
                          [:not-in :id ^:allow-subquery {:select [:parent_id]
                                                         :from   [[^:allow-subquery {:select [:parent_id]
                                                                                     :from   [(t2/table-name :model/Field)]
                                                                                     :where  [:and
                                                                                              [:not= :parent_id nil]
                                                                                              [:in :table_id table-ids-query]]}
                                                                   :parent_fields]]}]
                          [:not [:exists ^:allow-subquery {:select [1]
                                                           :from   [[(t2/table-name :model/Field) :child_field]]
                                                           :where  [:= :child_field.parent_id :metabase_field.id]}]])]
    ;; Only a Database delete calls this. The change log's delete hook already logs what that delete cascades to.
    #_{:clj-kondo/ignore [:metabase/change-log-raw-write]}
    (t2/query-one {:delete-from (t2/table-name :model/Field)
                   :where       [:and
                                 [:in :table_id table-ids-query]
                                 extra-clause]})))

(mu/defn increment-table-view-counts! :- :int
  "Add, for each `[count ids]` entry of `count->ids`, `count` to the `view_count` of the Tables with `ids`, in one raw
  statement that publishes no event, returning the number updated."
  [count->ids :- [:map-of ms/PositiveInt [:sequential ms/PositiveInt]]]
  (app-db/increment-counts! :model/Table :view_count count->ids))

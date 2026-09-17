(ns metabase.warehouse-schema.db
  "Application database queries for the warehouse-schema module. Every function here is a direct Toucan 2 call with
  no additional logic, so the rest of the module only touches `toucan2.core` for model definitions, hydration
  methods, and transactions."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.db :as models.db]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [toucan2.core :as t2]))

;;; The queries below follow [[::field-opts]]; queries that do not fit it live in the module-only section at the
;;; bottom of this namespace.

(mr/def ::field-filters
  "Which Fields a query applies to. Keys mirror the columns of `metabase_field`: a scalar matches that value and a
  set matches any of its values."
  [:map {:closed true}
   [:id                 {:optional true} [:or ::lib.schema.id/field [:set ::lib.schema.id/field]]]
   [:table_id           {:optional true} [:or ::lib.schema.id/table [:set ::lib.schema.id/table]]]
   [:parent_id          {:optional true} [:maybe ms/PositiveInt]]
   [:name               {:optional true} :string]
   [:fk_target_field_id {:optional true} ::lib.schema.id/field]
   [:active             {:optional true} :boolean]])

(mr/def ::field-opts
  "The filters above plus the columns to select, the order to return them in, and whether to merge the
  FieldUserSettings overlay (`:user-settings?`, default true)."
  [:merge
   ::field-filters
   [:map {:closed true}
    [:user-settings? {:optional true} :boolean]
    [:columns        {:optional true} [:sequential ::warehouse-schema.schema/field.column]]
    [:order-by       {:optional true} [:sequential [:or
                                                    ::warehouse-schema.schema/field.column
                                                    [:tuple ::warehouse-schema.schema/field.column [:enum :asc :desc]]]]]
    [:limit          {:optional true} ms/PositiveInt]
    [:offset         {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- args-with-from
  "`args` (a `u.query/opts->args` result) with `from` merged into the trailing HoneySQL map, appending one when
  `args` has none."
  [args from]
  (let [args (vec args)]
    (if (map? (peek args))
      (update args (dec (count args)) merge from)
      (conj args from))))

(defn- field-model
  [columns]
  (u.query/model-with-columns :model/Field columns))

(defn- field-plain-args
  [opts]
  (u.query/opts->args (dissoc opts :user-settings?)))

(defn- field-args
  [opts]
  (args-with-from (field-plain-args opts)
                  {:from [(warehouse-schema-overlay/field-query {:user-settings? (get opts :user-settings? true)})]}))

(defn- field-kv-args
  [opts]
  (u.query/opts->kv-args (dissoc opts :user-settings?)))

;;; ---- Reads ----

(mu/defn select-fields :- [:sequential ::warehouse-schema.schema/field.partial]
  "The Fields matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::field-opts]]
  (apply t2/select (field-model columns) (field-args opts)))

(mu/defn select-one-field :- [:maybe ::warehouse-schema.schema/field.partial]
  "The first Field matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::field-opts]]
  (apply t2/select-one (field-model columns) (field-args opts)))

(mu/defn select-field-pk->instance :- [:map-of ::lib.schema.id/field ::warehouse-schema.schema/field.partial]
  "A map of id to the Field matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::field-opts]]
  (apply t2/select-pk->fn identity (field-model columns) (field-args opts)))

(mu/defn select-field-pks :- [:set ::lib.schema.id/field]
  "The ids of the Fields matching `opts`."
  [opts :- [:maybe ::field-opts]]
  (or (apply t2/select-pks-set :model/Field (field-args opts)) #{}))

(mu/defn select-one-field-pk :- [:maybe ::lib.schema.id/field]
  "The id of the first Field matching `opts`, or nil."
  [opts :- [:maybe ::field-opts]]
  (apply t2/select-one-pk :model/Field (field-args opts)))

;;; ---- Writes ----

(mu/defn update-fields! :- :int
  "Apply `changes` to every Field matching `opts`, returning the number updated."
  [opts    :- [:maybe ::field-opts]
   changes :- ::warehouse-schema.schema/field.update]
  (apply t2/update! :model/Field (conj (field-kv-args opts) changes)))

(mu/defn delete-fields! :- :int
  "Delete every Field matching `opts`, returning the number deleted."
  [opts :- [:maybe ::field-opts]]
  (apply t2/delete! :model/Field (field-plain-args opts)))

;;; ------------------------- Queries used only by the warehouse-schema module -------------------------

(def field-order-rule
  "How should we order fields."
  [[:position :asc] [:%lower.name :asc]])

(mu/defn field-in-path
  "The ::warehouse-schema.schema/field named by the last of `field-names` (each nested inside the previous, bottom-most first) under
  `table-id`, or nil. See `metabase.models.db/field-in-path`, which owns the shared query."
  [table-id    :- [:maybe ::lib.schema.id/table]
   field-names :- [:sequential :string]]
  (models.db/field-in-path table-id field-names))

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

(mu/defn select-field-ids-for-table-ordered
  "The ids of the Fields of the ::warehouse-schema.schema/table with `table-id`, ordered per `field-order` (`:custom`, `:smart`, `:database`,
  or `:alphabetical`)."
  [table-id    :- ::lib.schema.id/table
   field-order :- [:enum :custom :smart :database :alphabetical]]
  (t2/select [:model/Field :id] :table_id table-id {:from     [(warehouse-schema-overlay/field-query)]
                                                    :order-by (field-order-order-by field-order)}))

(mu/defn select-active-fields-for-tables
  "The active, unretired Fields of the Tables with `table-ids`, in field order."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Field
             :active true
             :table_id [:in table-ids]
             :visibility_type [:not= "retired"]
             {:from [(warehouse-schema-overlay/field-query)]
              :order-by field-order-rule}))

(mu/defn select-pk-field-id-by-table
  "A map of ::warehouse-schema.schema/table ID to the ID of its visible primary key ::warehouse-schema.schema/field for `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select-fn->fn :table_id :id :model/Field
                    :table_id [:in table-ids]
                    :semantic_type (app-db/isa :type/PK)
                    :visibility_type [:not-in ["sensitive" "retired"]]
                    {:from [(warehouse-schema-overlay/field-query {:alias :f})]}))

(mu/defn select-user-renamed-field-names :- [:set :string]
  "The lower-cased names, among `names`, of the Fields of the Table with `table-id` whose display name a user set.
  Uploads use it to leave those Fields alone when appending re-derives display names from the CSV header."
  [table-id :- ::lib.schema.id/table
   names    :- [:set :string]]
  (set
   (t2/select-fn-set (comp u/lower-case-en :name)
                     :model/Field
                     {:select    [:f.name]
                      :from      [(warehouse-schema-overlay/field-query {:alias :f, :user-settings? false})]
                      :left-join [[(t2/table-name :model/FieldUserSettings) :u] [:= :u.field_id :f.id]]
                      :where     [:and
                                  [:= :f.table_id table-id]
                                  [:in [:lower :f.name] names]
                                  [:not= :u.display_name nil]]})))

(mu/defn reducible-select-field-names
  "A reducible of the id, name, and display name of every ::warehouse-schema.schema/field, plus its user-set display
  name from FieldUserSettings (if any) as `:user_display_name`."
  []
  (t2/reducible-query
   {:select    [:f.id :f.name :f.display_name [:u.display_name :user_display_name]]
    :from      [(warehouse-schema-overlay/field-query {:alias :f, :user-settings? false})]
    :left-join [[(t2/table-name :model/FieldUserSettings) :u] [:= :u.field_id :f.id]]}))

(mu/defn set-field-display-name! :- :int
  "Set the display name of the ::warehouse-schema.schema/field with `id`, returning the number updated."
  [id           :- ::lib.schema.id/field
   display-name :- :string]
  (update-fields! {:id id} {:display_name display-name}))

;;; The queries below follow [[::field-user-settings-opts]]; queries that do not fit it live in the module-only
;;; section at the bottom of this namespace.

(mr/def ::field-user-settings-filters
  "Which FieldUserSettings a query applies to. Keys mirror the columns of `metabase_field_user_settings`: a scalar
  matches that value (also nil, e.g. a Field not yet inserted) and a set matches any of its values."
  [:map {:closed true}
   [:field_id           {:optional true} [:or [:maybe ::lib.schema.id/field] [:set ::lib.schema.id/field]]]
   [:fk_target_field_id {:optional true} ::lib.schema.id/field]])

(mr/def ::field-user-settings-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::field-user-settings-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::warehouse-schema.schema/field-user-settings.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::warehouse-schema.schema/field-user-settings.column
                                              [:tuple ::warehouse-schema.schema/field-user-settings.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- field-user-settings-model
  [columns]
  (u.query/model-with-columns :model/FieldUserSettings columns))

(defn- field-user-settings-args
  [opts]
  (u.query/opts->args opts))

(defn- field-user-settings-kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ---- Reads ----

(mu/defn select-one-field-user-settings :- [:maybe ::warehouse-schema.schema/field-user-settings.partial]
  "The first FieldUserSettings matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::field-user-settings-opts]]
  (apply t2/select-one (field-user-settings-model columns) (field-user-settings-args opts)))

(mu/defn select-field-user-settings-pks :- [:set ::lib.schema.id/field]
  "The `field_id`s of the FieldUserSettings matching `opts`."
  [opts :- [:maybe ::field-user-settings-opts]]
  (or (apply t2/select-pks-set :model/FieldUserSettings (field-user-settings-args opts)) #{}))

(mu/defn field-user-settings-exists? :- :boolean
  "Whether a FieldUserSettings matching `opts` exists."
  [opts :- [:maybe ::field-user-settings-opts]]
  (apply t2/exists? :model/FieldUserSettings (field-user-settings-args opts)))

;;; ---- Writes ----

(mu/defn insert-field-user-settings!
  "Insert one FieldUserSettings map or a sequence of them, returning the number inserted."
  [rows :- [:or ::warehouse-schema.schema/field-user-settings.create
            [:sequential ::warehouse-schema.schema/field-user-settings.create]]]
  (t2/insert! :model/FieldUserSettings rows))

(mu/defn update-field-user-settings! :- :int
  "Apply `changes` to every FieldUserSettings matching `opts`, returning the number updated."
  [opts    :- [:maybe ::field-user-settings-opts]
   changes :- ::warehouse-schema.schema/field-user-settings.update]
  (apply t2/update! :model/FieldUserSettings (conj (field-user-settings-kv-args opts) changes)))

(mu/defn delete-field-user-settings! :- :int
  "Delete every FieldUserSettings matching `opts`, returning the number deleted."
  [opts :- [:maybe ::field-user-settings-opts]]
  (apply t2/delete! :model/FieldUserSettings (field-user-settings-args opts)))

;;; ------------------------- Queries used only by the warehouse-schema module -------------------------

(mu/defn field-user-settings-exists-for-table? :- :boolean
  "Whether any Field of the ::warehouse-schema.schema/table with `table-id` has a FieldUserSettings row."
  [table-id :- ::lib.schema.id/table]
  (t2/exists? :model/FieldUserSettings
              {:from  [[(t2/table-name :model/FieldUserSettings) :u]]
               :join  [(warehouse-schema-overlay/field-query {:alias :f, :user-settings? false}) [:= :f.id :u.field_id]]
               :where [:= :f.table_id table-id]}))

(mu/defn select-field-user-settings-for-tables
  "The FieldUserSettings of the Fields of `table-ids`, each with its Field's `:table_id`, in Field name order."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select :model/FieldUserSettings
             {:select   [:u.* [:f.table_id :table_id] [:f.name :field_name]]
              :from     [[(t2/table-name :model/FieldUserSettings) :u]]
              :join     [(warehouse-schema-overlay/field-query {:alias :f, :user-settings? false}) [:= :f.id :u.field_id]]
              :where    [:in :f.table_id table-ids]
              :order-by [[:f.name :asc]]}))

(mu/defn update-field-user-settings-custom-positions! :- :int
  "Set the `custom_position` of the FieldUserSettings of each Field in `field-id->position`, returning the number
  updated."
  [field-id->position :- [:map-of ::lib.schema.id/field :int]]
  (t2/update! :model/FieldUserSettings :field_id [:in (keys field-id->position)]
              {:custom_position (into [:case] (mapcat (fn [[id position]] [[:= :field_id id] position])) field-id->position)}))

;;; -------------------------------------------- TableUserSettings --------------------------------------------

;;; The queries below follow [[::table-user-settings-opts]]; queries that do not fit it live in the module-only
;;; section at the bottom of this namespace.

(mr/def ::table-user-settings-filters
  "Which TableUserSettings a query applies to. Keys mirror the columns of `metabase_table_user_settings`: a scalar
  matches that value (also nil, e.g. a Table not yet inserted) and a set matches any of its values."
  [:map {:closed true}
   [:table_id {:optional true} [:or [:maybe ::lib.schema.id/table] [:set ::lib.schema.id/table]]]])

(mr/def ::table-user-settings-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::table-user-settings-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::warehouse-schema.schema/table-user-settings.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::warehouse-schema.schema/table-user-settings.column
                                              [:tuple ::warehouse-schema.schema/table-user-settings.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- table-user-settings-model
  [columns]
  (u.query/model-with-columns :model/TableUserSettings columns))

(defn- table-user-settings-args
  [opts]
  (u.query/opts->args opts))

(defn- table-user-settings-kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ---- Reads ----

(mu/defn select-one-table-user-settings :- [:maybe ::warehouse-schema.schema/table-user-settings.partial]
  "The first TableUserSettings matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::table-user-settings-opts]]
  (apply t2/select-one (table-user-settings-model columns) (table-user-settings-args opts)))

(mu/defn select-table-user-settings-pks :- [:set ::lib.schema.id/table]
  "The `table_id`s of the TableUserSettings matching `opts`."
  [opts :- [:maybe ::table-user-settings-opts]]
  (or (apply t2/select-pks-set :model/TableUserSettings (table-user-settings-args opts)) #{}))

(mu/defn table-user-settings-exists? :- :boolean
  "Whether a TableUserSettings matching `opts` exists."
  [opts :- [:maybe ::table-user-settings-opts]]
  (apply t2/exists? :model/TableUserSettings (table-user-settings-args opts)))

;;; ---- Writes ----

(mu/defn insert-table-user-settings!
  "Insert one TableUserSettings map or a sequence of them, returning the number inserted."
  [rows :- [:or ::warehouse-schema.schema/table-user-settings.create
            [:sequential ::warehouse-schema.schema/table-user-settings.create]]]
  (t2/insert! :model/TableUserSettings rows))

(mu/defn update-table-user-settings! :- :int
  "Apply `changes` to every TableUserSettings matching `opts`, returning the number updated."
  [opts    :- [:maybe ::table-user-settings-opts]
   changes :- ::warehouse-schema.schema/table-user-settings.update]
  (apply t2/update! :model/TableUserSettings (conj (table-user-settings-kv-args opts) changes)))

(mu/defn delete-table-user-settings! :- :int
  "Delete every TableUserSettings matching `opts`, returning the number deleted."
  [opts :- [:maybe ::table-user-settings-opts]]
  (apply t2/delete! :model/TableUserSettings (table-user-settings-args opts)))

;;; ------------------------- Queries used only by the warehouse-schema module -------------------------

(def ^:private table-user-settings-value-columns
  "The columns of a TableUserSettings that hold a user value rather than a `_set` flag or an identity column."
  (remove (into #{:table_id} (vals warehouse-schema-overlay/table-user-settings-flags))
          (mut/keys (mr/schema ::warehouse-schema.schema/table-user-settings.columns))))

(mu/defn select-table-user-settings-with-field-settings
  "One TableUserSettings per Table among `table-ids` (all when nil) that has a settings row or a Field with one,
  synthesized as `{:table_id id}` when the Table has no row of its own."
  [table-ids :- [:maybe [:sequential ::lib.schema.id/table]]]
  (let [flag-columns (set (vals warehouse-schema-overlay/table-user-settings-flags))]
    (t2/select
     :model/TableUserSettings
     {:select    (into [[:t.id :table_id]]
                       (concat (map #(u/qualified-key :u %) table-user-settings-value-columns)
                               (map (fn [flag] [[:coalesce (u/qualified-key :u flag) false] flag]) flag-columns)))
      :from      [(warehouse-schema-overlay/table-query {:alias :t, :user-settings? false})]
      :left-join [[(t2/table-name :model/TableUserSettings) :u] [:= :u.table_id :t.id]]
      :where     [:and
                  (if table-ids [:in :t.id table-ids] true)
                  [:or
                   [:not= :u.table_id nil]
                   [:exists ^:allow-subquery
                    {:select [1]
                     :from   [[(t2/table-name :model/FieldUserSettings) :fu]]
                     :join   [(warehouse-schema-overlay/field-query {:alias :f, :user-settings? false}) [:= :f.id :fu.field_id]]
                     :where  [:= :f.table_id :t.id]}]]]})))

(mu/defn delete-field-user-settings-for-table! :- :int
  "Delete the FieldUserSettings of the Fields of the ::warehouse-schema.schema/table with `table-id`, returning the
  number deleted."
  [table-id :- ::lib.schema.id/table]
  (t2/delete! :model/FieldUserSettings
              {:where [:exists ^:allow-subquery
                       {:select 1
                        :from   [[(t2/table-name :model/Field) :f]]
                        :where  [:and [:= :f.id :field_id] [:= :f.table_id table-id]]}]}))

;;; ---------------------------------------------- FieldValues ----------------------------------------------

;;; The queries below follow [[::field-values-opts]]; queries that do not fit it live in the module-only section at
;;; the bottom of this namespace.

(mr/def ::field-values-filters
  "Which FieldValues a query applies to. Keys mirror the columns of `metabase_fieldvalues`: a scalar matches that
  value (also nil, for `:hash_key`) and a set matches any of its values."
  [:map {:closed true}
   [:id       {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:field_id {:optional true} [:or ::lib.schema.id/field [:set ::lib.schema.id/field]]]
   [:type     {:optional true} [:or :keyword [:set :keyword]]]
   [:hash_key {:optional true} [:maybe :string]]])

(mr/def ::field-values-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::field-values-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::warehouse-schema.schema/field-values.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::warehouse-schema.schema/field-values.column
                                              [:tuple ::warehouse-schema.schema/field-values.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- field-values-model
  [columns]
  (u.query/model-with-columns :model/FieldValues columns))

(defn- field-values-args
  [opts]
  (u.query/opts->args opts))

(defn- field-values-kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ---- Reads ----

(mu/defn select-field-values :- [:sequential ::warehouse-schema.schema/field-values.partial]
  "The FieldValues matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::field-values-opts]]
  (apply t2/select (field-values-model columns) (field-values-args opts)))

;;; ---- Writes ----

(mu/defn update-field-values! :- :int
  "Apply `changes` to every FieldValues matching `opts`, returning the number updated."
  [opts    :- [:maybe ::field-values-opts]
   changes :- ::warehouse-schema.schema/field-values.update]
  (apply t2/update! :model/FieldValues (conj (field-values-kv-args opts) changes)))

(mu/defn delete-field-values! :- :int
  "Delete every FieldValues matching `opts`, returning the number deleted."
  [opts :- [:maybe ::field-values-opts]]
  (apply t2/delete! :model/FieldValues (field-values-args opts)))

;;; ------------------------- Queries used only by the warehouse-schema module -------------------------

(mu/defn select-full-field-values-for-tables
  "The ::warehouse-schema.schema/field ID, values, and ::warehouse-schema.schema/table ID of the full FieldValues of the normal Fields of the Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/select [:model/FieldValues :field_id :values :field.table_id]
             {:join  [(warehouse-schema-overlay/field-query {:alias :field})
                      [:= :metabase_fieldvalues.field_id :field.id]]
              :where [:and
                      [:in :field.table_id table-ids]
                      [:= :field.visibility_type "normal"]
                      [:= :metabase_fieldvalues.type "full"]]}))

(mu/defn select-one-field-values-with-human-readable-values
  "The values and human-readable values of the full FieldValues of the ::warehouse-schema.schema/field with `field-id` if it has
  human-readable values, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one [:model/FieldValues :values :human_readable_values]
                 {:where [:and
                          [:= :type "full"]
                          [:= :field_id field-id]
                          [:not= :human_readable_values nil]
                          [:not= :human_readable_values "{}"]]}))

(mu/defn select-field-values-last-used-at
  "The latest `last_used_at` of any FieldValues of the ::warehouse-schema.schema/field with `field-id`."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one-fn :max-last-used-at [:model/FieldValues [[:max :last_used_at] :max-last-used-at]]
                    {:where [:= :field_id field-id]}))

(mu/defn find-or-insert-full-field-values!
  "The full FieldValues of the ::warehouse-schema.schema/field with `field-id`, inserting one with `has-more-values`, `values`, and no
  `human_readable_values` if none exists yet."
  [field-id       :- ::lib.schema.id/field
   has-more-values :- :boolean
   values          :- [:maybe ms/FieldValues]]
  (app-db/select-or-insert! :model/FieldValues {:field_id field-id, :type :full}
                            (constantly {:has_more_values       has-more-values
                                         :values                values
                                         :human_readable_values nil})))

;;; ------------------------------------------------- Dimension -------------------------------------------------

(mr/def ::dimension-filters
  "Which Dimensions a query applies to. Keys mirror the columns of `:dimension`: a scalar matches that value and a
  set matches any of its values."
  [:map {:closed true}
   [:field_id {:optional true} [:or ::lib.schema.id/field [:set ::lib.schema.id/field]]]])

(mu/defn select-dimensions :- [:sequential ::warehouse-schema.schema/dimension]
  "The Dimensions matching `filters`."
  [filters :- [:maybe ::dimension-filters]]
  (apply t2/select :model/Dimension (u.query/opts->args filters)))

;;; ------------------------------------------------- ::warehouse-schema.schema/table -------------------------------------------------

;;; The queries below follow [[::table-opts]]; queries that do not fit it live in the module-only section at the
;;; bottom of this namespace.

(mr/def ::table-filters
  "Which Tables a query applies to. Keys mirror the columns of `metabase_table`: a scalar matches that value (also
  nil, for `:schema` and `:visibility_type`) and a set matches any of its values."
  [:map {:closed true}
   [:id              {:optional true} [:or ::lib.schema.id/table [:set ::lib.schema.id/table]]]
   [:db_id           {:optional true} [:or ::lib.schema.id/database [:set ::lib.schema.id/database]]]
   [:schema          {:optional true} [:maybe :string]]
   [:name            {:optional true} :string]
   [:active          {:optional true} :boolean]
   [:visibility_type {:optional true} [:maybe [:or :keyword :string]]]])

(mr/def ::table-opts
  "The filters above plus the columns to select, the order to return them in, and whether to merge the
  TableUserSettings overlay (`:user-settings?`, default true)."
  [:merge
   ::table-filters
   [:map {:closed true}
    [:user-settings? {:optional true} :boolean]
    [:columns        {:optional true} [:sequential ::warehouse-schema.schema/table.column]]
    [:order-by       {:optional true} [:sequential [:or
                                                    ::warehouse-schema.schema/table.column
                                                    [:tuple ::warehouse-schema.schema/table.column [:enum :asc :desc]]]]]
    [:limit          {:optional true} ms/PositiveInt]
    [:offset         {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- table-model
  [columns]
  (u.query/model-with-columns :model/Table columns))

(defn- table-args
  [opts]
  (args-with-from (u.query/opts->args (dissoc opts :user-settings?))
                  {:from [(warehouse-schema-overlay/table-query {:user-settings? (get opts :user-settings? true)})]}))

(defn- table-kv-args
  [opts]
  (u.query/opts->kv-args (dissoc opts :user-settings?)))

;;; ---- Reads ----

(mu/defn select-tables :- [:sequential ::warehouse-schema.schema/table.partial]
  "The Tables matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::table-opts]]
  (apply t2/select (table-model columns) (table-args opts)))

(mu/defn select-one-table :- [:maybe ::warehouse-schema.schema/table.partial]
  "The first Table matching `opts`, or nil."
  [{:keys [columns] :as opts} :- [:maybe ::table-opts]]
  (apply t2/select-one (table-model columns) (table-args opts)))

;;; ---- Writes ----

(mu/defn update-tables! :- :int
  "Apply `changes` to every Table matching `opts`, returning the number updated."
  [opts    :- [:maybe ::table-opts]
   changes :- ::warehouse-schema.schema/table.update]
  (apply t2/update! :model/Table (conj (table-kv-args opts) changes)))

;;; ------------------------- Queries used only by the warehouse-schema module -------------------------

(mu/defn select-schemas-for-database :- [:set [:maybe :string]]
  "The distinct schemas of the active Tables of the Database with `database-id`, in schema order. When
  `include-hidden?` is false, restricted to Tables with no `visibility_type` (a non-nil value means the Table is
  hidden -- see `metabase.warehouse-schema.models.table/visibility-types`)."
  [database-id     :- ::lib.schema.id/database
   include-hidden? :- [:maybe :boolean]]
  (let [clauses (cond-> []
                  (not include-hidden?) (conj [:= :visibility_type nil]))]
    (or (t2/select-fn-set :schema :model/Table :db_id database-id :active true
                          (merge {:from     [(warehouse-schema-overlay/table-query)]
                                  :order-by [[:%lower.schema :asc]]}
                                 (when clauses
                                   {:where (into [:and] clauses)})))
        #{})))

(mu/defn unarchived-segments-for-tables
  "The unarchived Segments of the Tables with `table-ids`, ordered by name."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Segment :table_id [:in table-ids] :archived false {:order-by [[:name :asc]]}))

(mu/defn segment-ids-for-table
  "The IDs of the Segments of the ::warehouse-schema.schema/table with `table-id`, excluding archived ones when `skip-archived?`."
  [table-id       :- ::lib.schema.id/table
   skip-archived? :- [:maybe :boolean]]
  (t2/select-pks-set :model/Segment {:where [:and [:= :table_id table-id] (when skip-archived? [:not :archived])]}))

(mu/defn unarchived-measures-for-tables
  "The unarchived Measures of the Tables with `table-ids`, ordered by name."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Measure :table_id [:in table-ids] :archived false {:order-by [[:name :asc]]}))

(mu/defn measure-ids-for-table
  "The IDs of the Measures of the ::warehouse-schema.schema/table with `table-id`, excluding archived ones when `skip-archived?`."
  [table-id       :- ::lib.schema.id/table
   skip-archived? :- [:maybe :boolean]]
  (t2/select-pks-set :model/Measure {:where [:and [:= :table_id table-id] (when skip-archived? [:not :archived])]}))

(mu/defn unarchived-metric-cards-for-tables
  "The unarchived metric Cards of the Tables with `table-ids`, ordered by name."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Card :table_id [:in table-ids] :archived false :type :metric {:order-by [[:name :asc]]}))

(mu/defn transforms-by-id
  "A map of ID to Transform for `transform-ids`."
  [transform-ids :- [:sequential ::lib.schema.id/transform]]
  (t2/select-fn->fn :id identity :model/Transform :id [:in transform-ids]))

(mu/defn reducible-select-table-names
  "A reducible of the id, name, and display name of every ::warehouse-schema.schema/table, plus the user's own
  display name (`:user_display_name`), if any."
  []
  (t2/reducible-query
   {:select    [:t.id :t.name :t.display_name
                [:u.display_name :user_display_name]]
    :from      [(warehouse-schema-overlay/table-query {:alias :t, :user-settings? false})]
    :left-join [[(t2/table-name :model/TableUserSettings) :u] [:= :u.table_id :t.id]]}))

(mu/defn set-table-display-name! :- :int
  "Set the display name of the ::warehouse-schema.schema/table with `id`, returning the number updated."
  [id           :- ::lib.schema.id/table
   display-name :- :string]
  (update-tables! {:id id} {:display_name display-name}))

;;; ---------------------------------------------- Other models ----------------------------------------------

(mu/defn collections
  "The Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select :model/Collection :id [:in collection-ids]))

(mu/defn user-summaries-by-id
  "A map of ID to the ID, email, and names of the Users with `user-ids`."
  [user-ids :- [:set ::lib.schema.id/user]]
  (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name] :id [:in user-ids]))

(mu/defn cards-with-moderated-status
  "The query-metadata columns of the Cards with `card-ids`, with their latest moderation status."
  [card-ids :- [:or [:set ::lib.schema.id/card] [:sequential ::lib.schema.id/card]]]
  (t2/select :model/Card
             {:select    [:c.id :c.dataset_query :c.result_metadata :c.name
                          :c.description :c.collection_id :c.database_id :c.type
                          :c.source_card_id :c.created_at :c.entity_id :c.card_schema
                          [:r.status :moderated_status]]
              :from      [[:report_card :c]]
              :left-join [[^:allow-subquery {:select   [:moderated_item_id :status]
                                             :from     [:moderation_review]
                                             :where    [:and
                                                        [:= :moderated_item_type "card"]
                                                        [:= :most_recent true]]
                                             :order-by [[:id :desc]]
                                             :limit    1} :r]
                          [:= :r.moderated_item_id :c.id]]
              :where     [:in :c.id card-ids]}))

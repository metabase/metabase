(ns metabase.warehouse-schema-rest.db
  "Application database queries for the warehouse schema REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as app-db]
   [metabase.funnysql.util :as funnysql.util]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(mu/defn field
  "The Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :model/Field :id field-id))

(mu/defn fields-by-ids
  "The Fields with `field-ids`."
  [field-ids :- [:sequential {:min 1} ::lib.schema.id/field]]
  (app-db/select-batched #(t2/select :model/Field :id [:in %]) field-ids))

(mu/defn nested-fields-exist? :- :boolean
  "Whether the Table with `table-id` has Fields whose NFC path matches the SQL LIKE `nfc-path-pattern`."
  [table-id         :- ::lib.schema.id/table
   nfc-path-pattern :- :string]
  (t2/exists? :model/Field :table_id table-id :nfc_path [:like nfc-path-pattern]))

(mu/defn dimension-for-field
  "The Dimension of the Field with `field-id`, or nil."
  [field-id :- ::lib.schema.id/field]
  (t2/select-one :model/Dimension :field_id field-id))

(mu/defn matching-tables
  "The Tables (active, or with `transform_target` when `include-transform-targets?`) matching `term` (a glob pattern
  using `*` as a wildcard, matched against `:name` and `:display_name`), optionally narrowed to
  `data-layer`, `data-source`, `owner-user-id`, and/or `owner-email`; restricted to ownerless Tables when
  `orphan-only?`, published Tables when `published-only?`, and (when `check-unused?`) Tables with no dependents,
  ordered by name."
  [{:keys [term data-layer data-source owner-user-id owner-email orphan-only? published-only?
           check-unused? include-transform-targets?]}
   :- [:map {:closed true}
       [:term                       {:optional true} [:maybe :string]]
       [:data-layer                 {:optional true} [:maybe [:or :keyword :string]]]
       [:data-source                {:optional true} [:maybe [:or :keyword :string]]]
       [:owner-user-id              {:optional true} [:maybe :int]]
       [:owner-email                {:optional true} [:maybe :string]]
       [:orphan-only?               {:optional true} [:maybe :boolean]]
       [:published-only?            {:optional true} [:maybe :boolean]]
       [:check-unused?              {:optional true} [:maybe :boolean]]
       [:include-transform-targets? {:optional true} [:maybe :boolean]]]]
  (let [table-column (partial u/qualified-key (t2/table-name :model/Table))
        db-type      (app-db/db-type)
        glob         (fn [escaped]
                       (-> escaped
                           (str/replace "*" "%")
                           (cond-> (not (str/ends-with? term "*")) (str "%"))))
        ci-pattern   (fn [pattern]
                       (case db-type
                         (:h2 :postgres) pattern
                         [:collate pattern "utf8mb4_unicode_ci"]))
        like         (fn [field wrap]
                       [(case db-type (:h2 :postgres) :ilike :like)
                        field
                        (funnysql.util/like-pattern term (comp ci-pattern wrap glob))])
        where        (cond-> [:and (if include-transform-targets?
                                     [:or [:= (table-column :active) true] [:= (table-column :transform_target) true]]
                                     [:= (table-column :active) true])]
                       (not (str/blank? term)) (conj [:or
                                                      (like (table-column :name) identity)
                                                      (like (table-column :display_name) identity)
                                                      ;; match word starts after spaces e.g. 'ite' would match 'Order Item'
                                                      (like (table-column :display_name) #(str "% " %))])
                       data-layer              (conj [:= (table-column :data_layer)      (name data-layer)])
                       data-source             (conj [:= (table-column :data_source)     (name data-source)])
                       owner-user-id           (conj [:= (table-column :owner_user_id)   owner-user-id])
                       owner-email             (conj [:= (table-column :owner_email)     owner-email])
                       orphan-only?            (conj [:and
                                                      [:= (table-column :owner_email) nil]
                                                      [:= (table-column :owner_user_id) nil]])
                       published-only?         (conj [:= :s.is_published true])
                       check-unused?
                       (conj [:not-exists ^:allow-subquery {:select [:*]
                                                            :from   [[:dependency :d]]
                                                            :where  [:and
                                                                     [:= :d.to_entity_id (table-column :id)]
                                                                     [:= :d.to_entity_type "table"]]}]))]
    (t2/select :model/Table
               (cond-> {:select   [(table-column :*)]
                        :where    where
                        :order-by [[(table-column :name) :asc]]}
                 published-only? (assoc :left-join [[(t2/table-name :model/TableUserSettings) :s]
                                                    [:= :s.table_id (table-column :id)]])))))

(mu/defn tables-by-ids
  "The Tables with `table-ids`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (app-db/select-batched #(t2/select :model/Table :id [:in %]) table-ids))

(mu/defn table
  "The Table with `table-id`, or nil."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/Table :id table-id))

(mu/defn non-destination-database
  "The Database with `database-id` if it is not a routing destination, or nil."
  [database-id :- ::lib.schema.id/database]
  (t2/select-one :model/Database :id database-id :router_database_id nil))

(mu/defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id :- [:maybe ::lib.schema.id/collection]]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn active-unretired-field-ids-for-table
  "The ids of the active, unretired Fields of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-pks-set :model/Field :table_id table-id :visibility_type [:not= "retired"] :active true))

(mu/defn field-ids-for-table
  "The ids of the Fields of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-pks-set :model/Field :table_id table-id))

(mu/defn active-fields-targeting
  "The active Fields whose FK target is one of `field-ids`."
  [field-ids :- [:sequential ::lib.schema.id/field]]
  (app-db/select-batched #(t2/select :model/Field :fk_target_field_id [:in %] :active true) field-ids))

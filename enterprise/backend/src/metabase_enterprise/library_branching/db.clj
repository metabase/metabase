(ns metabase-enterprise.library-branching.db
  "App DB queries of library branching."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mr/def ::query
  [:map {::mr/deliberately-open true, :description "a HoneySQL select query"}])

(mr/def ::row
  [:map {::mr/deliberately-open true, :description "a row of a query, column name to value"}])

(mr/def ::ids
  [:sequential {:max 1000} pos-int?])

(mr/def ::entity-ids
  [:sequential {:max 1000} :string])

(mr/def ::table-key
  [:tuple :string [:maybe :string] :string])

(mu/defn rows :- [:sequential ::row]
  "The rows that HoneySQL `query` selects, in the current transaction."
  [query :- ::query]
  (t2/query query))

(mu/defn row-count :- :int
  "The number of rows that HoneySQL `query` selects, in the current transaction, with one statement. `query` has the
  metadata `:allow-subquery`."
  [query :- ::query]
  (:n (t2/query-one {:select [[:%count.* :n]] :from [[query :q]]})))

;;; --------------------------------------------------- Read point ---------------------------------------------------

(defn do-with-read-point
  "Calls `f` with no arguments."
  [f]
  (f))

;;; ------------------------------------------------ Reference lookups -----------------------------------------------

(mu/defn fields-by-id :- [:sequential ::row]
  "`{:id :table_id :name :parent_id}` of each field of `ids`."
  [ids :- ::ids]
  (t2/query {:select [:id :table_id :name :parent_id]
             :from   [(warehouse-schema-overlay/field-query {:user-settings? false})]
             :where  [:in :id ids]}))

(mu/defn table-keys-by-id :- [:sequential ::row]
  "`{:id :db :schema :table}` of each table of `ids`: its id, and the database name, schema and name of its natural
  key."
  [ids :- ::ids]
  (t2/query {:select [:t.id [:d.name :db] :t.schema [:t.name :table]]
             :from   [(warehouse-schema-overlay/table-query {:alias :t :user-settings? false})]
             :join   [[(t2/table-name :model/Database) :d] [:= :d.id :t.db_id]]
             :where  [:in :t.id ids]}))

(mu/defn entity-ids-by-id :- [:sequential ::row]
  "`{:id :entity_id}` of each row of `ids` of the table of `model`."
  [model :- :keyword
   ids   :- ::ids]
  (t2/query {:select [:id :entity_id]
             :from   [(t2/table-name model)]
             :where  [:in :id ids]}))

(mu/defn column-by-id :- [:sequential ::row]
  "`{:id :v}`: the value of `column` of each row of `ids` of the table of `model`."
  [model  :- :keyword
   column :- :keyword
   ids    :- ::ids]
  (t2/query {:select [:id [column :v]]
             :from   [(t2/table-name model)]
             :where  [:in :id ids]}))

;;; ---------------------------------------------------- Content -----------------------------------------------------

(mu/defn collections-by-entity-id :- [:sequential ::row]
  "The rows of the collections of `entity-ids`."
  [entity-ids :- ::entity-ids]
  (t2/query {:select [:id :entity_id :name :description :type :namespace :authority_level :location]
             :from   [(t2/table-name :model/Collection)]
             :where  [:in :entity_id entity-ids]}))

(mu/defn cards-by-entity-id :- [:sequential ::row]
  "The cards of `entity-ids`, as instances of `:model/Card` with the columns `columns`."
  [columns    :- [:sequential :keyword]
   entity-ids :- ::entity-ids]
  ;; Named columns also keep the Card model from building a Lib query for each metric to describe it.
  (t2/select (into [:model/Card] columns) :entity_id [:in entity-ids]))

(mu/defn snippets-by-entity-id :- [:sequential ::row]
  "The snippets of `entity-ids`, as instances of `:model/NativeQuerySnippet`."
  [entity-ids :- ::entity-ids]
  (t2/select :model/NativeQuerySnippet :entity_id [:in entity-ids]))

(mu/defn tables-by-key :- [:sequential ::row]
  "`{:id :db :schema :table :display_name :collection_id}` of each table of `table-keys`, natural keys `[database
  schema table]`. `:display_name` and `:collection_id` are the values that users see."
  [table-keys :- [:sequential {:max 100} ::table-key]]
  (if (empty? table-keys)
    []
    (t2/query {:select [:t.id [:d.name :db] :t.schema [:t.name :table] :t.display_name :t.collection_id]
               :from   [(warehouse-schema-overlay/table-query {:alias :t})]
               :join   [[(t2/table-name :model/Database) :d] [:= :d.id :t.db_id]]
               :where  (into [:or]
                             (map (fn [[db schema table]]
                                    [:and [:= :d.name db] [:= :t.schema schema] [:= :t.name table]]))
                             table-keys)})))

(mu/defn table-user-settings-by-table-id :- [:sequential ::row]
  "The user settings rows of the tables of `ids`, as instances of `:model/TableUserSettings`."
  [ids :- ::ids]
  (t2/select :model/TableUserSettings :table_id [:in ids]))

(defn- fields-of-tables
  [table-ids]
  (vary-meta {:select [:id]
              :from   [(warehouse-schema-overlay/field-query {:user-settings? false})]
              :where  [:in :table_id table-ids]}
             assoc :allow-subquery true))

(mu/defn field-user-settings-by-table-id :- [:sequential ::row]
  "The user settings rows of the fields of the tables of `ids`, as instances of `:model/FieldUserSettings`."
  [ids :- ::ids]
  (t2/select :model/FieldUserSettings {:where [:in :field_id (fields-of-tables ids)]}))

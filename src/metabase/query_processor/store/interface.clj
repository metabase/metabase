(ns metabase.query-processor.store.interface
  "Protocols and other stuff you need to know to create a new QP Store, but don't really need to be using directly
  anywhere outside of [[metabase.query-processor.store]]."
  (:require
   [metabase.util.malli.schema :as ms]
   [potemkin :as p]))

;;; protocol for something that can provide things to stick in a QP store, such as the App DB
(p/defprotocol+ QPStoreProvider
  (fetch-database [provider database-id]
    "Fetch Database with `database-id`.")
  (fetch-tables [provider database-id table-ids]
    "Fetch Tables with `table-ids`. Only Tables associated with the Database with `database-id` should be fetched.")
  (fetch-fields [provider database-id field-ids]
    "Fetch Fields with `field-ids`. Only Fields associated with the Database with `database-id` should be fetched."))

;;; protocol for something that stores/caches values fetched with a [[QPStoreProvider]], such as an atom
(p/defprotocol+ QPStore
  (database [store]
    "Return the previously fetched Database if present. A QP store can only be associated with a single Database.")
  (store-database! [store database]
    "Store a Database.")
  (tables [store]
    "Return all previously fetched Tables, as a sequence.")
  (table [store table-id]
    "Return a specific Table, if it has already been fetched.")
  (store-table! [store table]
    "Store a Table.")
  (fields [store]
    "Return all previously fetched Fields, as a sequence.")
  (field [store field-id]
    "Return a specific Field, if it has already been fetched.")
  (store-field! [store field]
    "Store a Field.")
  (misc-value [store ks not-found]
    "Return a miscellaneous value with key sequence `ks` if one has been stored, or `not-found` if there is no value
    present.")
  (store-misc-value! [store ks new-value]
    "Store a miscellaneous value using key sequence `ks`."))

(def database-columns-to-fetch
  "Columns you should fetch for the Database referenced by the query before stashing in the store."
  [:id
   :engine
   :name
   :dbms_version
   :details
   :settings])

(def DatabaseInstanceWithRequiredStoreKeys
  "Malli schema for a Database instance that has all of the required keys."
  [:map
   [:id       ms/IntGreaterThanZero]
   [:engine   :keyword]
   [:name     ms/NonBlankString]
   [:details  :map]
   [:settings [:maybe :map]]])

(def table-columns-to-fetch
  "Columns you should fetch for any Table you want to stash in the Store."
  [:id
   :name
   :display_name
   :schema])

(def TableInstanceWithRequiredStoreKeys
  "Malli schema for a Table instance that has all of the required keys."
  [:map
   [:schema [:maybe :string]]
   [:name ms/NonBlankString]])

(def field-columns-to-fetch
  "Columns to fetch for and Field you want to stash in the Store. These get returned as part of the `:cols` metadata in
  query results. Try to keep this set pared down to just what's needed by the QP and frontend, since it has to be done
  for every MBQL query."
  [:base_type
   :coercion_strategy
   :database_type
   :description
   :display_name
   :effective_type
   :fingerprint
   :id
   :name
   :nfc_path
   :parent_id
   :semantic_type
   :settings
   :table_id
   :visibility_type])

(def FieldInstanceWithRequiredStorekeys
  "Malli schema for a Field instance that has all of the required keys."
  [:map
   [:name          ms/NonBlankString]
   [:table_id      ms/IntGreaterThanZero]
   [:display_name  ms/NonBlankString]
   [:description   [:maybe :string]]
   [:database_type ms/NonBlankString]
   [:base_type     ms/FieldType]
   [:semantic_type [:maybe ms/FieldSemanticOrRelationType]]
   [:fingerprint   [:maybe ms/Map]]
   [:parent_id     [:maybe ms/IntGreaterThanZero]]
   [:nfc_path      [:maybe [:sequential ms/NonBlankString]]]
   ;; there's a tension as we sometimes store fields from the db, and sometimes store computed fields. ideally we
   ;; would make everything just use base_type.
   [:effective_type    {:optional true} [:maybe ms/FieldType]]
   [:coercion_strategy {:optional true} [:maybe ms/CoercionStrategy]]])

(ns metabase.prototype.settings
  (:require
   [metabase.prototype.db :as prototype.db]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting prototype-slow-query-delay-ms
  (deferred-tru "How long Metabase waits, in milliseconds, before it runs a query when the browser asks for slow data.")
  :type       :integer
  :default    5000
  :visibility :authenticated
  :encryption :no
  :export?    false
  :doc        false)

(defn- prototype-data-info []
  (when-let [database-id (prototype.db/prototype-database-id)]
    {:database_id database-id}))

(defsetting prototype-data
  "The prototype dataset for the frontend: its Database id."
  :type       :json
  :setter     :none
  :getter     prototype-data-info
  :visibility :authenticated
  :encryption :no
  :export?    false
  :doc        false)

(defsetting prototype-field-categories
  "Prototype: the LLM categories of the Fields of each Table, as a list of `{:table_id :field_ids :categories}`.
  `:field_ids` are the Fields that the categories cover. See [[metabase.prototype.field-categories]]."
  :type       :json
  :default    []
  :visibility :internal
  :encryption :no
  :export?    false
  :doc        false)

(defsetting prototype-semantic-layer-version
  "Prototype: the version of the semantic layer definitions on this instance. See
  [[metabase.prototype.semantic-layer]]."
  :type       :integer
  :visibility :internal
  :encryption :no
  :export?    false
  :doc        false)

(defsetting prototype-filter-usage-seed-version
  "Prototype: the version of the seeded filter usage questions on this instance. See
  [[metabase.prototype.filter-usage-seed]]."
  :type       :integer
  :visibility :internal
  :encryption :no
  :export?    false
  :doc        false)

(defsetting prototype-runtime-seed-version
  "Prototype: the version of the seeded history of query runtimes on this instance. See
  [[metabase.prototype.runtime-estimate]]."
  :type       :integer
  :visibility :internal
  :encryption :no
  :export?    false
  :doc        false)

(ns metabase.starrez.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(set! *warn-on-reflection* true)

(defsetting starrez-api-url
  (deferred-tru "Base URL of the StarRez REST API (e.g. https://example.starrezhousing.com/StarRezRest)")
  :encryption :no
  :visibility :admin
  :type       :string
  :audit      :getter)

(defsetting starrez-api-username
  (deferred-tru "StarRez REST API username")
  :encryption :no
  :visibility :admin
  :type       :string
  :audit      :getter)

(defsetting starrez-api-token
  (deferred-tru "StarRez REST token (used as the password for HTTP Basic Auth)")
  :encryption :when-encryption-key-set
  :visibility :admin
  :type       :string
  :audit      :no-value)

(defsetting starrez-blob-sas-url
  (deferred-tru "Azure Blob Storage container-level SAS URL for StarRez exports")
  :encryption :when-encryption-key-set
  :visibility :admin
  :type       :string
  :audit      :no-value)

(defsetting starrez-export-tables
  (deferred-tru "Comma-separated StarRez table names to export (e.g. RoomBooking,Entry,Person)")
  :encryption :no
  :visibility :admin
  :type       :string
  :default    "RoomBooking,Entry,Person"
  :audit      :getter)

(defsetting starrez-export-reports
  (deferred-tru "Comma-separated StarRez report IDs (or names) to export (e.g. 57161,RoomAvailability)")
  :encryption :no
  :visibility :admin
  :type       :string
  :default    ""
  :audit      :getter)

(defsetting starrez-sort-field
  (deferred-tru "Field name used to sort StarRez export data (client-side after fetch)")
  :encryption :no
  :visibility :admin
  :type       :string
  :default    "DateModified"
  :audit      :getter)

(defsetting starrez-keep-versions
  (deferred-tru "Number of past export files to retain per table in blob storage (0 = keep all)")
  :visibility :admin
  :type       :integer
  :default    5
  :audit      :getter)

(defsetting starrez-pg-host
  (deferred-tru "Hostname of the Postgres server that stores StarRez data (e.g. yourserver.postgres.database.azure.com)")
  :encryption :no
  :visibility :admin
  :type       :string
  :audit      :getter)

(defsetting starrez-pg-database
  (deferred-tru "Name of the Postgres database that stores StarRez data")
  :encryption :no
  :visibility :admin
  :type       :string
  :default    "starrez"
  :audit      :getter)

(defsetting starrez-pg-user
  (deferred-tru "Postgres username with read/write access to the StarRez database")
  :encryption :no
  :visibility :admin
  :type       :string
  :audit      :getter)

(defsetting starrez-pg-password
  (deferred-tru "Password for the StarRez Postgres user (stored encrypted)")
  :encryption :when-encryption-key-set
  :visibility :admin
  :type       :string
  :audit      :no-value)

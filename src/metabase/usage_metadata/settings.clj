(ns metabase.usage-metadata.settings
  (:require
   [metabase.settings.core :refer [defsetting]]))

(defsetting usage-metadata-enabled?
  "Whether usage-driven metadata batch processing is enabled."
  :encryption :no
  :type       :boolean
  :default    false
  :visibility :internal
  :export?    false
  :audit      :never)

(defsetting usage-metadata-retention-days
  "How many days of usage metadata rollups to retain."
  :encryption :no
  :type       :integer
  :default    90
  :visibility :internal
  :export?    false
  :audit      :never)

(defsetting usage-metadata-schedule
  "Cron schedule (in UTC) for usage metadata batch processing."
  :encryption :no
  :type       :string
  :default    "0 0 2 * * ? *"
  :visibility :internal
  :export?    false
  :audit      :never)

(defsetting usage-metadata-last-completed-day
  "Internal watermark for the last completed usage metadata day."
  :encryption :no
  :type       :string
  :visibility :internal
  :export?    false
  :audit      :never)

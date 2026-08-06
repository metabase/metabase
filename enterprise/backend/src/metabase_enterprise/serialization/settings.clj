(ns metabase-enterprise.serialization.settings
  (:require
   [metabase.settings.core :refer [defsetting]]))

(defsetting serialization-skip-schema-validation
  "Whether to import questions whose queries this Metabase's query schema rejects. Defaults to false."
  :type       :boolean
  :default    false
  :visibility :internal
  :setter     :none
  :audit      :never
  :export?    false
  :doc        (str "On import, Metabase validates every question against the query format this version understands, and refuses "
                   "any it cannot read. Set this to true to skip that validation. "
                   "Skipping it will not necessarily make the import succeed. Import may still fail on a later step."))

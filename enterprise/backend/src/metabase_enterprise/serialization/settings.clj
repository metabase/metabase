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
  :doc        (str "On import Metabase validates every question against the query format it understands, and refuses "
                   "one it cannot read to catche content this version cannot understand. "
                   "Set this to true to skip that validation. Doing so will not necessarily make the import succeed: "
                   "import may still fail on a later step."))

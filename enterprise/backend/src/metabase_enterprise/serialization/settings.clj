(ns metabase-enterprise.serialization.settings
  (:require
   [metabase.settings.core :refer [defsetting]]))

(defsetting serialization-allow-version-mismatch
  "Whether to import a serialization export produced by a different major version. Defaults to false."
  :type       :boolean
  :default    false
  :visibility :internal
  :setter     :none
  :audit      :never
  :export?    false
  :doc        (str "Metabase refuses to import an export that records a different major version than the running "
                   "instance, because importing across major versions can silently corrupt existing content. Set "
                   "this to true to import anyway. Test such an import on a non-production instance first — skipping "
                   "this check is what allowed content to be corrupted in the first place."))

(defsetting serialization-skip-schema-validation
  "Whether to import questions whose queries this Metabase's query schema rejects. Defaults to false."
  :type       :boolean
  :default    false
  :visibility :internal
  :setter     :none
  :audit      :never
  :export?    false
  :doc        (str "On import Metabase validates every question against the query format it understands, and refuses "
                   "one it cannot read — this catches content a newer Metabase can express but this version cannot. "
                   "Set this to true to skip that validation. Doing so will not necessarily make the import succeed: "
                   "content Metabase cannot read may still fail later in the import, or import in a broken state."))

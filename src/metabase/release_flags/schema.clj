(ns metabase.release-flags.schema
  "Malli schemas for the release-flags module.")

(def FlagName
  "A release flag name, either a keyword or a string."
  [:or :keyword :string])

(def FlagData
  "The data for a single release flag."
  [:map
   [:description [:maybe :string]]
   [:start_date :any]
   [:is_enabled :boolean]])

(def FlagMap
  "A map of flag name strings to their data."
  [:map-of FlagName FlagData])

(def StatusMap
  "A map of flag names to boolean enabled status, used for updates."
  [:map-of FlagName :boolean])

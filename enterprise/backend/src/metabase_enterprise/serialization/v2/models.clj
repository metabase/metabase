(ns metabase-enterprise.serialization.v2.models)

(def exported-models
  "The list of models which are exported by serialization. Used for production code and by tests."
  ["Card"
   "Collection"
   "Dashboard"
   "Database"
   "Dimension"
   "Field"
   "FieldValues"
   "Metric"
   "NativeQuerySnippet"
   "Pulse"
   "PulseCard"
   "PulseChannel"
   "Segment"
   "Setting"
   "Table"
   "Timeline"])

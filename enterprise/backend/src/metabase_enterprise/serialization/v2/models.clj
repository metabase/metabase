(ns metabase-enterprise.serialization.v2.models)

(def exported-models
  "The list of models which are exported by serialization. Used for production code and by tests."
  ["Card"
   "Collection"
   "Dashboard"
   "DashboardCard"
   "Database"
   "Dimension"
   "Field"
   "Metric"
   "NativeQuerySnippet"
   "Pulse"
   "PulseCard"
   "PulseChannel"
   "Segment"
   "Setting"
   "Table"
   "Timeline"
   "TimelineEvent"])

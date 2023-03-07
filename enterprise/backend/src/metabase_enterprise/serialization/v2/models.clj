(ns metabase-enterprise.serialization.v2.models)

(def exported-models
  "The list of models which are exported by serialization. Used for production code and by tests."
  ["Action"
   "Card"
   "Collection"
   "Dashboard"
   "Database"
   "Field"
   "FieldValues"
   "Metric"
   "NativeQuerySnippet"
   "Segment"
   "Setting"
   "Table"
   "Timeline"])

(def inlined-models
  "An additional list of models which are inlined into parent entities for serialization.
  These are not extracted and serialized separately, but they may need some processing done.
  For example, the models should also have their entity_id fields populated (if they have one)."
  ["DashboardCard"
   "Dimension"
   "ParameterCard"
   "TimelineEvent"])

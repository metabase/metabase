(ns metabase-enterprise.serialization.v2.models)

(def data-model
  "Model types which make up the data model, no user-created content."
  #{"Database"
    "Field"
    "FieldValues"
    "Metric"
    "Segment"
    "Table"})

(def exported-models
  "The list of models which are exported by serialization. Used for production code and by tests."
  (conj
   data-model
   "Action"
   "Card"
   "Collection"
   "Dashboard"
   "NativeQuerySnippet"
   "Setting"
   "Timeline"))

(def inlined-models
  "An additional list of models which are inlined into parent entities for serialization.
  These are not extracted and serialized separately, but they may need some processing done.
  For example, the models should also have their entity_id fields populated (if they have one)."
  ["DashboardCard"
   "Dimension"
   "ParameterCard"
   "TimelineEvent"])

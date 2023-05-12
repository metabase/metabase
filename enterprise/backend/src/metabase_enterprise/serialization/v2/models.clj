(ns metabase-enterprise.serialization.v2.models)

(def data-model
  "Schema model types"
  ["Database"
   "Field"
   "Metric"
   "Segment"
   "Table"])

(def content
  "Content model types"
  ["Action"
   "Card"
   "Collection"
   "Dashboard"
   "NativeQuerySnippet"
   "Timeline"])

(def exported-models
  "The list of all models exported by serialization by default. Used for production code and by tests."
  (concat data-model
          content
          ["FieldValues"
           "Setting"]))

(def inlined-models
  "An additional list of models which are inlined into parent entities for serialization.
  These are not extracted and serialized separately, but they may need some processing done.
  For example, the models should also have their entity_id fields populated (if they have one)."
  ["DashboardCard"
   "Dimension"
   "ParameterCard"
   "TimelineEvent"])

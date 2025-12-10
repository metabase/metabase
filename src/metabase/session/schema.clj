(ns metabase.session.schema)

(def SessionSchema
  "Schema for a Session."
  [:and
   [:map-of :keyword :any]
   [:map
    [:key string?]
    [:type [:enum :normal :full-app-embed]]]])

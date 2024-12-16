(ns metabase.models.view-log-impl)

(def context
  "The context of a view log entry. In other words, what sort of page generated this view?."
  [:enum :dashboard :question :collection])

(ns metabase.view-log.models.view-log-impl)

(def context
  "The context of a view log entry. In other words, what sort of page generated this view?."
  ;; Currently supported contexts. Old `view_log` rows may contain the deleted "collection" context.
  [:enum :dashboard :question])

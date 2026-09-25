(ns metabase-enterprise.data-studio.usage-metadata.task
  "Enterprise implementation of scheduled Library cleanup candidate refreshes."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.usage-metadata.candidate-refresh :as candidate-refresh]))

(set! *warn-on-reflection* true)

(defenterprise run-candidate-refresh!
  "Queue a scheduled candidate refresh when Library is licensed."
  :feature :library
  []
  ;; `queue-refresh!` also recovers runs interrupted by a previous process, so every
  ;; scheduled tick must go through it rather than short-circuiting on `active-run`.
  (candidate-refresh/queue-refresh! :scheduled nil))

(ns metabase-enterprise.content-diagnostics.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting content-diagnostics-stale-threshold-days
  (deferred-tru "Content inactive beyond this many days is flagged stale by Content Diagnostics.")
  :encryption :no
  :visibility :admin
  :default    90
  :type       :positive-integer
  :export?    true
  :doc        false)

(defsetting content-diagnostics-slow-card-threshold-seconds
  (deferred-tru "Cards whose average query time exceeds this are flagged slow by Content Diagnostics.")
  :encryption :no
  :visibility :admin
  :default    15
  :type       :positive-integer
  :export?    true
  :doc        false)

(defsetting content-diagnostics-slow-transform-threshold-seconds
  (deferred-tru "Transforms whose last run took longer than this are flagged slow by Content Diagnostics.")
  :encryption :no
  :visibility :admin
  :default    60
  :type       :positive-integer
  :export?    true
  :doc        false)

;;; imbalanced (empty/sparse/crowded) thresholds. One setting per (finding-type, entity-type, unit) bound;
;;; `empty` deliberately has none (0 is naturally empty). Comparison direction is part of the contract:
;;; crowded is strictly *greater than*, sparse is strictly *fewer than*.

(defsetting content-diagnostics-crowded-collection-threshold-items
  (deferred-tru "Collections holding more direct items than this are flagged crowded by Content Diagnostics.")
  :encryption :no
  :visibility :admin
  :default    100
  :type       :positive-integer
  :export?    true
  :doc        false)

(defsetting content-diagnostics-crowded-dashboard-threshold-dashcards-per-tab
  (deferred-tru "Dashboards with more cards than this on any one tab are flagged crowded by Content Diagnostics.")
  :encryption :no
  :visibility :admin
  :default    20
  :type       :positive-integer
  :export?    true
  :doc        false)

(defsetting content-diagnostics-crowded-dashboard-threshold-tabs
  (deferred-tru "Dashboards with more tabs than this are flagged crowded by Content Diagnostics.")
  :encryption :no
  :visibility :admin
  :default    5
  :type       :positive-integer
  :export?    true
  :doc        false)

(defsetting content-diagnostics-crowded-document-threshold-cards
  (deferred-tru "Documents embedding more cards than this are flagged crowded by Content Diagnostics.")
  :encryption :no
  :visibility :admin
  :default    20
  :type       :positive-integer
  :export?    true
  :doc        false)

(defsetting content-diagnostics-sparse-collection-threshold-items
  (deferred-tru "Non-empty collections holding fewer direct items than this are flagged sparse by Content Diagnostics.")
  :encryption :no
  :visibility :admin
  :default    5
  :type       :positive-integer
  :export?    true
  :doc        false)

(defsetting content-diagnostics-sparse-dashboard-threshold-dashcards
  (deferred-tru "Non-empty dashboards with fewer total cards than this are flagged sparse by Content Diagnostics.")
  :encryption :no
  :visibility :admin
  :default    4
  :type       :positive-integer
  :export?    true
  :doc        false)

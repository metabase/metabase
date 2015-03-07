(ns metabase.models.dashboard-subscription
  (:require [korma.core :refer :all]))

(defentity DashboardSubscription
  (table :report_dashboardsubscription))

(ns metabase.models.dashboard-card-series
  (:require [metabase.db :refer [sel]]
            (metabase.models [card :refer [Card]]
                             [interface :as i])))


(i/defentity DashboardCardSeries :dashboardcard_series)

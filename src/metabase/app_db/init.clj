(ns metabase.app-db.init
  (:require
   [metabase.app-db.pool-metrics :as pool-metrics]
   ;; make sure [[metabase.app-db.setup]] is loaded so the `:metabase.app-db.setup/application-db` Honey SQL dialect gets
   ;; defined and so default Honey SQL options and the like are loaded.
   [metabase.app-db.setup]))

;; Wire Prometheus metrics to connection pool checkout/checkin hooks.
(pool-metrics/install!)

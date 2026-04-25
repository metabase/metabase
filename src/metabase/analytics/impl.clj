(ns metabase.analytics.impl
  "CLJ implementation of [[metabase.analytics-interface.core/Reporter]].
  Delegates to Prometheus."
  (:require
   [metabase.analytics-interface.core :as analytics.interface]
   [metabase.analytics.prometheus :as prometheus]))

(analytics.interface/set-reporter!
 (reify analytics.interface/Reporter
   (-inc! [_ metric labels amount]
     (prometheus/inc! metric labels amount))
   (-dec-gauge! [_ metric labels amount]
     (prometheus/dec! metric labels amount))
   (-set-gauge! [_ metric labels amount]
     (prometheus/set! metric labels amount))
   (-observe! [_ metric labels amount]
     (prometheus/observe! metric labels amount))
   (-clear! [_ metric]
     (prometheus/clear! metric))))

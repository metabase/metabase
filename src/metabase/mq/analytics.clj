(ns metabase.mq.analytics
  "Prometheus analytics helpers for the mq subsystem that avoids circular dependencies.
  Lives in its own namespace to avoid further circular dependencies.")

(set! *warn-on-reflection* true)

(defn inc!
  "Analytics helper that avoids circular dependencies"
  [& args]
  (apply (requiring-resolve 'metabase.analytics.core/inc!) args))

(defn set!
  "Analytics helper that avoids circular dependencies"
  [& args]
  (apply (requiring-resolve 'metabase.analytics.core/set!) args))

(defn observe!
  "Analytics helper that avoids circular dependencies"
  [& args]
  (apply (requiring-resolve 'metabase.analytics.core/observe!) args))

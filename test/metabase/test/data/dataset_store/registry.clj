(ns metabase.test.data.dataset-store.registry
  "Which [[metabase.test.data.dataset-store/DatasetStore]] serves which driver.

  A literal map rather than a dispatch table: what a driver resolves to is readable here in one
  place, and a driver with no entry gets nil rather than silently inheriting someone else's
  implementation. Drivers absent from this map keep using the older load path."
  (:require
   [metabase.test.data.dataset-store :as dataset-store]))

(set! *warn-on-reflection* true)

(def ^:private constructors
  "Driver -> the fully qualified constructor for its store. Symbols rather than functions because a
  driver's test namespaces are only on the classpath when that driver is being tested."
  {:snowflake 'metabase.test.data.dataset-store.snowflake/snowflake-dataset-store
   :redshift  'metabase.test.data.dataset-store.redshift/redshift-dataset-store})

(def ^{:arglists '([driver])} store-for
  "Return the store for `driver`, or nil if it has none.

  Memoized: a store defers its tracking-table DDL until first use, and wraps a cache of the datasets
  this process has already seen, so sharing one instance per driver is what makes both worth having."
  (memoize
   (fn [driver]
     (when-let [ctor (get constructors driver)]
       (dataset-store/caching-dataset-store ((requiring-resolve ctor)))))))

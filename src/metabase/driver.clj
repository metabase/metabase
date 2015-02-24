(ns metabase.driver)

(def available-drivers
  "DB drivers that are available (pairs of `[namespace user-facing-name]`)."
  [["h2" "H2"]                 ; TODO it would be very nice if we could just look for files in this namespace at runtime and load them
   ["postgres" "PostgreSQL"]]) ; then the driver dispatch functions wouldn't have to call `require`

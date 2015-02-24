(ns metabase.driver
  (:require (metabase.driver native
                             postgres)))

(def available-drivers
  [["h2" "H2"]
   ["postgres" "PostgreSQL"]])

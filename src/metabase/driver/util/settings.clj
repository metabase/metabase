(ns metabase.driver.util.settings
  "The `engines` setting: which drivers this instance can use, and the connection form each one needs.

  It lives here rather than alongside the other driver settings because its value comes from
  [[metabase.driver.util/available-drivers-info]], while [[metabase.driver.util]] reads
  [[metabase.driver.settings]] -- defining it there would make those two namespaces require each other.

  Nothing refers to this namespace by name; the setting reaches the settings API only because
  [[metabase.driver.init]] loads it."
  (:require
   [metabase.driver.util :as driver.util]
   [metabase.settings.core :refer [defsetting]]))

(defsetting engines
  "Available database engines"
  :encryption :no
  :visibility :public
  :setter     :none
  :getter     driver.util/available-drivers-info
  :doc        false)

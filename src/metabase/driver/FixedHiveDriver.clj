(ns metabase.driver.FixedHiveDriver
  (:import [org.apache.hive.jdbc HiveDriver]
           java.util.Properties)
  (:gen-class
   :extends org.apache.hive.jdbc.HiveDriver
   :init init
   :prefix "driver-"
   :constructors {[] []}))

(defn driver-init
  "Initializes the Hive driver, fixed to work with Metabase"
  []
  [[] nil])

(defn driver-connect
  "Connects to a Hive compatible database"
  [^org.apache.hive.jdbc.HiveDriver this ^String url ^java.util.Properties info]
  (when (.acceptsURL this url)
    (clojure.lang.Reflector/invokeConstructor (Class/forName "metabase.driver.FixedHiveConnection") (to-array [url info]))))

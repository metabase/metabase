(ns metabase.driver.FixedHiveDriver
  (:import [org.apache.hive.jdbc HiveDriver]
           java.util.Properties)
  (:gen-class
   :extends org.apache.hive.jdbc.HiveDriver
   :init init
   :prefix "driver-"
   :constructors {[] []}))

(set! *warn-on-reflection* true)

(defn driver-init []
  [[] nil])

(defn driver-connect [^org.apache.hive.jdbc.HiveDriver this ^String url ^java.util.Properties info]
  (when (.acceptsURL this url)
    (clojure.lang.Reflector/invokeConstructor (Class/forName "metabase.driver.FixedHiveConnection") (to-array [url info]))))

(ns metabase.driver.hive-like.fixed-hive-connection
  (:import
   (java.sql Connection ResultSet SQLException)
   (java.util Properties)
   (org.apache.hive.jdbc HiveConnection)))

(set! *warn-on-reflection* true)

(defn fixed-hive-connection
  "Subclass of [[org.apache.hive.jdbc.HiveConnection]] has a few special overrides to make things work as expected with
  Metabase."
  ^Connection [^String url ^Properties properties]
  (proxy [HiveConnection] [url properties]
    (getHoldability []
      ResultSet/CLOSE_CURSORS_AT_COMMIT)

    (setReadOnly [read-only?]
      (when (.isClosed ^Connection this)
        (throw (SQLException. "Connection is closed")))
      (when read-only?
        (throw (SQLException. "Enabling read-only mode is not supported"))))))

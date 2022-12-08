(ns migration-timestamp
  (:import
    (java.time LocalDateTime)
    (java.time.format DateTimeFormatter)))

(defn -main []
  (println (.format (java.time.LocalDateTime/now) (java.time.format.DateTimeFormatter/ofPattern "YmdHM"))))

(ns metabase.db.connection-pool.test
  (:require [metabase.db.connection-pool :as connection-pool]
            [clojure.java.jdbc :as jdbc]
            [metabase.util.date :as du]))




;;; ------------------------------------------------ Proxy DataSource ------------------------------------------------




;; NOCOMMIT

(def %jdbc-spec%
  {:classname   "org.postgresql.Driver",
   :subprotocol "postgresql",
   :subname
   "//localhost:5432/metabase?type=%3Apostgres&OpenSourceSubProtocolOverride=true",
   :type        :postgres,
   :dbname      "test-data",
   :user        "cam",
   :password    nil})

(defn- num-connections []
  (jdbc/with-db-connection [conn %jdbc-spec%]
    (-> (jdbc/query conn "SELECT sum(numbackends) AS connections FROM pg_stat_database;") first :connections)))

(defn- test-with-backend [backend n]
  (connection-pool/set-backend! backend)
  (let [spec (connection-pool/connection-pool-spec %jdbc-spec%)]
    (try
      (dorun
       (pmap (fn [_]
               (jdbc/query spec "SELECT 1 AS one;"))
             (range n)))
      (finally (connection-pool/destroy-connection-pool! spec)))))

(defn- test-it [n]
  (let [c3p0   (partial test-with-backend :c3p0 n)
        hikari (partial test-with-backend :hikari n)
        noop   (partial test-with-backend :noop n)]
    (du/profile (c3p0))
    (du/profile (hikari))
    #_(du/profile (noop))))

(defn- median [coll]
  (nth (sort coll)
       (int (/ (count coll) 2))))

(defn- percentile [percent coll]
  (nth (sort coll)
       (int (* (count coll) percent))))

(defn- format-nano [ns]
  (int (/ ns 1000.0)))

(defn- test-with-backend-2 [backend n]
  (connection-pool/set-backend! backend)
  (let [spec  (connection-pool/connection-pool-spec %jdbc-spec%)
        times (atom [])]
    (try
      (dotimes [_ 1000]
        (jdbc/query spec "SELECT 1 AS one;"))
      (dorun
       (pmap
        (fn [_]
          (let [start-time (System/nanoTime)]
            (jdbc/query spec "SELECT 1 AS one;")
            (swap! times conj (- (System/nanoTime) start-time))))
        (range n)))
      (println backend
               "min:" (format-nano (reduce min @times))
               "median time:" (format-nano (median @times))
               "95th " (format-nano (percentile 0.95 @times))
               "99th" (format-nano (percentile 0.99 @times))
               "max:" (format-nano (reduce max @times)))
      (finally (connection-pool/destroy-connection-pool! spec)))))

(defn- test-it-2 [n]
  (let [c3p0   (partial test-with-backend-2 :c3p0 n)
        hikari (partial test-with-backend-2 :hikari n)
        noop   (partial test-with-backend-2 :noop n)]
    (hikari)
    (c3p0)
    (noop)))

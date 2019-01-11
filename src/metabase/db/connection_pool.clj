(ns metabase.db.connection-pool
  "Low-level logic for creating connection pools for a JDBC-based database. Used by both application DB and connected
  data warehouse DBs.

  The aim here is to completely encapsulate the connection pool library we use -- that way we can swap it out if we
  want to at some point without having to touch any other files. (TODO - this is currently true of everything except
  for the options, which are c3p0-specific -- consider abstracting those as well?)"
  (:require [metabase.db.connection-pool.interface :as i]
            [metabase.util :as u]))

(def ^:private current-backend
  (atom :hikari))

(defn set-backend! [new-backend]
  (reset! current-backend new-backend))

(defn- load-backend [backend]
  (require (symbol (format "metabase.db.connection-pool.%s" (name backend)))))

(defn the-backend []
  (u/prog1 @current-backend
    (when-not (get-method i/connection-pool-spec <>)
      (load-backend <>))))

(defn connection-pool-spec [jdbc-spec]
  (i/connection-pool-spec (the-backend) jdbc-spec))

(defn destroy-connection-pool! [pool-spec]
  (i/destroy-connection-pool! (the-backend) pool-spec))

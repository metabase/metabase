(ns metabase.db.connection
  "Functions for getting the application database connection type and JDBC spec, or temporarily overriding them.
   TODO - consider renaming this namespace `metabase.db.config`."
  (:require [metabase.db.connection-pool-setup :as connection-pool-setup]
            [metabase.db.env :as mdb.env]
            [potemkin :as p]))

(p/defrecord+ ApplicationDB [^clojure.lang.Keyword db-type
                             ^javax.sql.DataSource data-source
                             ^clojure.lang.Atom    cache
                             ^java.util.UUID       uuid]
  javax.sql.DataSource
  (getConnection [_]
    (.getConnection data-source))

  (getConnection [_ user password]
    (.getConnection data-source user password)))

(alter-meta! #'->ApplicationDB assoc :private true)
(alter-meta! #'map->ApplicationDB assoc :private true)

(defn application-db [db-type data-source & {:keys [create-pool?], :or {create-pool? false}}]
  (map->ApplicationDB
   {:db-type     db-type
    :data-source (if create-pool?
                   (connection-pool-setup/connection-pool-data-source db-type data-source)
                   data-source)
    :cache       (atom {})
    ;; for memoization purposes
    :uuid        (java.util.UUID/randomUUID)}))

(def ^:dynamic ^ApplicationDB *application-db*
  (application-db mdb.env/db-type mdb.env/data-source :create-pool? true))

(defn db-type
  "Keyword type name of the application DB. Matches corresponding db-type name e.g. `:h2`, `:mysql`, or `:postgres`."
  []
  (:db-type *application-db*))

(defn quoting-style
  "HoneySQL quoting style to use for application DBs of the given type. Note for H2 application DBs we automatically
  uppercase all identifiers (since this is H2's default behavior) whereas in the SQL QP we stick with the case we got
  when we synced the DB."
  [db-type]
  (case db-type
    :postgres :ansi
    :h2       :h2
    :mysql    :mysql))

(defn ^:deprecated data-source
  "Get a data source for the application DB, derived from environment variables. This is NOT a pooled data source!
  That's created later as part of [[metabase.db/setup-db!]] -- use [[toucan.db/connection]] if you want to get
  a [[clojure.java.jdbc]] spec for the connection pool.

  DEPRECATED: Just use [[*application-db*]] directly."
  ^javax.sql.DataSource []
  *application-db*)

(defn uuid []
  (:uuid *application-db*))

(defn cache ^clojure.lang.Atom []
  (:cache *application-db*))

(defn cached-value
  [k thunk]
  {:pre [(fn? thunk)]}
  (let [cache* (cache)
        v      (get @cache* k ::not-found)]
    (if-not (= v ::not-found)
      v
      (locking cache*
        (let [v (get @cache* k ::not-found)]
          (if-not (= v ::not-found)
            v
            (let [v (thunk)]
              (swap! cache* assoc k v)
              v)))))))

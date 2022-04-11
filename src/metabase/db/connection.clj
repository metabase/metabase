(ns metabase.db.connection
  "Functions for getting the application database connection type and JDBC spec, or temporarily overriding them.
   TODO - consider renaming this namespace `metabase.db.config`."
  (:require [metabase.db.connection-pool-setup :as connection-pool-setup]
            [metabase.db.env :as mdb.env]
            [potemkin :as p]))

;; Counter for [[unique-identifier]] -- this is a simple counter rather that [[java.util.UUID/randomUUID]] so we don't
;; waste precious entropy on launch generating something that doesn't need to be random (it just needs to be unique)
(defonce ^:private application-db-counter
  (atom 0))

(p/defrecord+ ApplicationDB [^clojure.lang.Keyword db-type
                             ^javax.sql.DataSource data-source
                             ;; used by [[metabase.db/setup-db!]] and [[metabase.db/db-is-set-up?]] to record whether
                             ;; the usual setup steps have been performed (i.e., running Liquibase and Clojure-land data
                             ;; migrations).
                             ^clojure.lang.Atom    status
                             ;; A unique identifier generated for this specific application DB. Use this as a
                             ;; memoization/cache key. See [[unique-identifier]] for more information.
                             id]
  javax.sql.DataSource
  (getConnection [_]
    (.getConnection data-source))

  (getConnection [_ user password]
    (.getConnection data-source user password)))

(alter-meta! #'->ApplicationDB assoc :private true)
(alter-meta! #'map->ApplicationDB assoc :private true)

(defn application-db
  "Create a new Metabase application database (type and [[javax.sql.DataSource]]). For use in combination
  with [[*application-db*]]:

    (binding [mdb.connection/*application-db* (mdb.connection/application-db :h2 my-data-source)]
      ...)

  Options:

  * `:create-pool?` -- whether to create a c3p0 connection pool data source for this application database if
    `data-source` is not already a pooled data source. Default: `false`. You should only do this for application DBs
    that are expected to be long-lived; for test DBs that will be destroyed at the end of the test it's hardly worth it."
  ^ApplicationDB [db-type data-source & {:keys [create-pool?], :or {create-pool? false}}]
  ;; this doesn't use [[schema.core/defn]] because [[schema.core/defn]] doesn't like optional keyword args
  {:pre [(#{:h2 :mysql :postgres} db-type)
         (instance? javax.sql.DataSource data-source)]}
  (map->ApplicationDB
   {:db-type     db-type
    :data-source (if create-pool?
                   (connection-pool-setup/connection-pool-data-source db-type data-source)
                   data-source)
    :status      (atom nil)
    ;; for memoization purposes. See [[unique-identifier]] for more information.
    :id          (swap! application-db-counter inc)}))

(def ^:dynamic ^ApplicationDB *application-db*
  "Type info and [[javax.sql.DataSource]] for the current Metabase application database. Create a new instance
  with [[application-db]]."
  (application-db mdb.env/db-type mdb.env/data-source :create-pool? true))

(defn db-type
  "Keyword type name of the application DB. Matches corresponding db-type name e.g. `:h2`, `:mysql`, or `:postgres`."
  []
  (.db-type *application-db*))

(defn quoting-style
  "HoneySQL quoting style to use for application DBs of the given type. Note for H2 application DBs we automatically
  uppercase all identifiers (since this is H2's default behavior) whereas in the SQL QP we stick with the case we got
  when we synced the DB."
  [db-type]
  (case db-type
    :postgres :ansi
    :h2       :h2
    :mysql    :mysql))

;; TODO -- you can just use [[*application-db*]] directly, we can probably get rid of this and use that directly instead
(defn data-source
  "Get a data source for the application DB, derived from environment variables. Usually this should be a pooled data
  source (i.e. a c3p0 pool) -- but in test situations it might not be."
  ^javax.sql.DataSource []
  (.data-source *application-db*))

;; I didn't call this `id` so there's no confusing this with a data warehouse [[metabase.models.database]] instance --
;; it's a number that I don't want getting mistaken for an `Database` `id`. Also the fact that it's an Integer is not
;; something callers of this function really need to be concerned about
(defn unique-identifier
  "Unique identifier for the Metabase application DB. This value will stay the same as long as the application DB stays
  the same; if the application DB is dynamically rebound, this will return a new value.

  For normal memoization you can use [[memoize-for-application-db]]; you should only need to use this directly for TTL
  memoization with [[clojure.core.memoize]] or other special cases. See [[metabase.driver.util/database->driver*]] for
  an example of using this for TTL memoization."
  []
  (.id *application-db*))

(defn memoize-for-application-db
  "Like [[clojure.core/memoize]], but only memoizes for the current application database; memoized values will be
  ignored if the app DB is dynamically rebound. For TTL memoization with [[clojure.core.memoize]], set
  `:clojure.core.memoize/args-fn` instead; see [[metabase.driver.util/database->driver*]] for an example of how to do
  this."
  [f]
  (let [f* (memoize (fn [_application-db-id & args]
                      (apply f args)))]
    (fn [& args]
      (apply f* (unique-identifier) args))))

(ns metabase.db.connection
  "Functions for getting the application database connection type and JDBC spec, or temporarily overriding them.
   TODO - consider renaming this namespace `metabase.db.config`."
  (:require
   [metabase.db.connection-pool-setup :as connection-pool-setup]
   [metabase.db.env :as mdb.env]
   [methodical.core :as methodical]
   [potemkin :as p]
   [toucan2.connection :as t2.conn]
   [toucan2.jdbc.connection :as t2.jdbc.conn])
  (:import
   (java.util.concurrent.locks ReentrantReadWriteLock)))

(set! *warn-on-reflection* true)

(defonce ^{:doc "Counter for [[unique-identifier]] -- this is a simple counter rather that [[java.util.UUID/randomUUID]]
  so we don't waste precious entropy on launch generating something that doesn't need to be random (it just needs to be
  unique)"}
  application-db-counter
  (atom 0))

(p/defrecord+ ApplicationDB [^clojure.lang.Keyword db-type
                             ^javax.sql.DataSource data-source
                             ;; used by [[metabase.db/setup-db!]] and [[metabase.db/db-is-set-up?]] to record whether
                             ;; the usual setup steps have been performed (i.e., running Liquibase and Clojure-land data
                             ;; migrations).
                             ^clojure.lang.Atom    status
                             ;; A unique identifier generated for this specific application DB. Use this as a
                             ;; memoization/cache key. See [[unique-identifier]] for more information.
                             id
                             ;; Reentrant read-write lock for GETTING new connections. Lock doesn't track whether any
                             ;; existing connections are open! Holding the write lock will however prevent any NEW
                             ;; connections from being acquired.
                             ;;
                             ;; This is a reentrant read-write lock, which means any number of read locks are allowed at
                             ;; the same time, but the write lock is exclusive. So if you want to prevent anyone from
                             ;; getting new connections, lock the write lock.
                             ;;
                             ;; The main purpose of this is to power [[metabase.api.testing]] which allows you to reset
                             ;; the application DB with data from a SQL dump -- during the restore process it is
                             ;; important that we do not allow anyone to access the DB.
                             ^ReentrantReadWriteLock lock]
  javax.sql.DataSource
  (getConnection [_]
    (try
      (.. lock readLock lock)
      (.getConnection data-source)
      (finally
        (.. lock readLock unlock))))

  (getConnection [_ user password]
    (try
      (.. lock readLock lock)
      (.getConnection data-source user password)
      (finally
        (.. lock readLock unlock)))))

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
    :id          (swap! application-db-counter inc)
    :lock        (ReentrantReadWriteLock.)}))

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

(methodical/defmethod t2.conn/do-with-connection :default
  [_connectable f]
  (t2.conn/do-with-connection *application-db* f))

(def ^:private ^:dynamic *transaction-depth* 0)

(defn- do-transaction [^java.sql.Connection connection f]
  (letfn [(thunk []
            (let [savepoint (.setSavepoint connection)]
              (try
                (let [result (f connection)]
                  (when (= *transaction-depth* 1)
                    ;; top-level transaction, commit
                    (.commit connection))
                  result)
                (catch Throwable e
                  (.rollback connection savepoint)
                  (throw e)))))]
    ;; optimization: don't set and unset autocommit if it's already false
    (if (.getAutoCommit connection)
      (try
        (.setAutoCommit connection false)
        (thunk)
        (finally
          (.setAutoCommit connection true)))
      (thunk))))

(comment
 ;; in toucan2.jdbc.connection, there is a 'defmethod' for t2.conn/do-with-transaction java.sql.Connection
 ;; since we don't want our implementation to be overwritten, we need to require it here first before defininng ours
 t2.jdbc.conn/keepme)

(methodical/defmethod t2.conn/do-with-transaction java.sql.Connection
  "Support nested transactions without introducing a lock like `next.jdbc` does, as that can cause deadlocks -- see
  https://github.com/seancorfield/next-jdbc/issues/244. Use `Savepoint`s because MySQL only supports nested
  transactions when done this way.

  See also https://metaboat.slack.com/archives/CKZEMT1MJ/p1694103570500929

  Note that these \"nested transactions\" are not the real thing (e.g., as in Oracle):
    - there is only one commit, meaning that every transaction in a tree of transactions can see the changes
      other transactions have made,
    - in the presence of unsynchronized concurrent threads running nested transactions, the effects of rollback
      are not well defined - a rollback will undo all work done by other transactions in the same tree that
      started later."
  [^java.sql.Connection connection {:keys [nested-transaction-rule] :or {nested-transaction-rule :allow} :as options} f]
  (assert (#{:allow :ignore :prohibit} nested-transaction-rule))
  (cond
   (and (pos? *transaction-depth*)
        (= nested-transaction-rule :ignore))
   (f connection)

   (and (pos? *transaction-depth*)
        (= nested-transaction-rule :prohibit))
   (throw (ex-info "Attempted to create nested transaction with :nested-transaction-rule set to :prohibit"
                   {:options options}))

   :else
   (binding [*transaction-depth* (inc *transaction-depth*)]
     (do-transaction connection f))))

(ns metabase.driver.mongo.util
  "`*mongo-connection*`, `with-mongo-connection`, and other functions shared between several Mongo driver namespaces."
  (:require [clojure.string :as s]
            [clojure.tools.logging :as log]
            [colorize.core :as color]
            [monger.core :as mg]
            [metabase.driver :as driver]))

(def ^:const ^:private connection-timeout-ms
  "Number of milliseconds to wait when attempting to establish a Mongo connection.
   By default, Monger uses a 10-second timeout, which means `can/connect?` can take
   forever, especially when called with bad details. This translates to our tests
   taking longer and the DB setup API endpoints seeming sluggish.

   Don't set the timeout too low -- I've have Circle fail when the timeout was 250ms
   on one occasion."
  1000)

(defn- details-map->connection-string
  [{:keys [user pass host port dbname]}]
  {:pre [host
         dbname]}
  (str "mongodb://"
       user
       (when-not (s/blank? pass)
         (assert (not (s/blank? user)) "Can't have a password without a user!")
         (str ":" pass))
       (when-not (s/blank? user) "@")
       host
       (when-not (s/blank? (str port))
         (str ":" port))
       "/"
       dbname
       "?connectTimeoutMS="
       connection-timeout-ms))

(def ^:dynamic ^com.mongodb.DBApiLayer *mongo-connection*
  "Connection to a Mongo database.
   Bound by top-level `with-mongo-connection` so it may be reused within its body."
  nil)

(defn -with-mongo-connection
  "Run F with a new connection (bound to `*mongo-connection*`) to DATABASE.
   Don't use this directly; use `with-mongo-connection`."
  [f database]
  (let [connection-string (cond
                            (string? database)              database
                            (:dbname (:details database))   (details-map->connection-string (:details database)) ; new-style -- entire Database obj
                            (:dbname database)              (details-map->connection-string database)            ; new-style -- connection details map only
                            :else                           (throw (Exception. (str "with-mongo-connection failed: bad connection details:" (:details database)))))
        {conn :conn, mongo-connection :db} (mg/connect-via-uri connection-string)]
    (log/debug (color/cyan "<< OPENED NEW MONGODB CONNECTION >>"))
    (try
      (binding [*mongo-connection* mongo-connection]
        (f *mongo-connection*))
      (finally
        (mg/disconnect conn)))))

(defmacro with-mongo-connection
  "Open a new MongoDB connection to DATABASE-OR-CONNECTION-STRING, bind connection to BINDING, execute BODY, and close the connection.
   The DB connection is re-used by subsequent calls to `with-mongo-connection` within BODY.
   (We're smart about it: DATABASE isn't even evaluated if `*mongo-connection*` is already bound.)

     ;; delay isn't derefed if *mongo-connection* is already bound
     (with-mongo-connection [^com.mongodb.DBApiLayer conn @(:db (sel :one Table ...))]
       ...)

     ;; You can use a string instead of a Database
     (with-mongo-connection [^com.mongodb.DBApiLayer conn \"mongodb://127.0.0.1:27017/test\"]
        ...)

   DATABASE-OR-CONNECTION-STRING can also optionally be the connection details map on its own."
  [[binding database] & body]
  `(let [f# (fn [~binding]
              ~@body)]
     (if *mongo-connection* (f# *mongo-connection*)
         (-with-mongo-connection f# ~database))))

;; TODO - this isn't neccesarily Mongo-specific; consider moving
(defn values->base-type
  "Given a sequence of values, return `Field.base_type` in the most ghetto way possible.
   This just gets counts the types of *every* value and returns the `base_type` for class whose count was highest."
  [values-seq]
  {:pre [(sequential? values-seq)]}
  (println (first values-seq))
  (or (->> values-seq
           ;; TODO - why not do a query to return non-nil values of this column instead
           (filter identity)
           ;; it's probably fine just to consider the first 1,000 *non-nil* values when trying to type a column instead
           ;; of iterating over the whole collection. (VALUES-SEQ should be up to 10,000 values, but we don't know how many are
           ;; nil)
           (take 1000)
           (group-by type)
           (map (fn [[klass valus]]
                  (println [klass (count valus)])
                  [klass (count valus)]))
           (sort-by second)
           first
           first
           ((fn [klass]
              (println klass)
              klass))
           driver/class->base-type)
      :UnknownField))

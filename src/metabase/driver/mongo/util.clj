(ns metabase.driver.mongo.util
  "`*mongo-connection*`, `with-mongo-connection`, and other functions shared between several Mongo driver namespaces."
  (:require [clojure.tools.logging :as log]
            [colorize.core :as color]
            [monger.core :as mg]
            [metabase.driver :as driver]))

(defn- details-map->connection-string
  [{:keys [user pass host port dbname]}]
  {:pre [host
         dbname]}
  (str "mongodb://"
       user
       (when pass
         (assert user "Can't have a password without a user!")
         (str ":" pass))
       (when user "@")
       host
       (when port
         (str ":" port))
       "/"
       dbname))

(def ^:dynamic *mongo-connection*
  "Connection to a Mongo database.
   Bound by top-level `with-mongo-connection` so it may be reused within its body."
  nil)

(defn -with-mongo-connection
  "Run F with a new connection (bound to `*mongo-connection*`) to DATABASE.
   Don't use this directly; use `with-mongo-connection`."
  [f database]
  (let [connection-string (cond
                            (string? database)              database
                            (:dbname (:details database))   (details-map->connection-string (:details database)) ; new-style
                            (:conn_str (:details database)) (:conn_str (:details database))                      ; legacy
                            :else                           (throw (Exception. (str "with-mongo-connection failed: bad connection details:" (:details database)))))
        {conn :conn mongo-connection :db} (mg/connect-via-uri connection-string)]
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
        ...)"
  [[binding database] & body]
  `(let [f# (fn [~binding]
              ~@body)]
     (if *mongo-connection* (f# *mongo-connection*)
         (-with-mongo-connection f# ~database))))

;; TODO - this is actually more sophisticated than the one used for annotation in the GenericSQL driver, which just takes the
;; types of the values in the first row.
;; We should move this somewhere where it can be shared amongst the drivers and rewrite GenericSQL to use it instead.
(defn values->base-type
  "Given a sequence of values, return `Field` `base_type` in the most ghetto way possible.
   This just gets counts the types of *every* value and returns the `base_type` for class whose count was highest."
  [values-seq]
  {:pre [(sequential? values-seq)]}
  (or (->> values-seq
           (filter identity)             ; TODO - why not do a query to return non-nil values of this column instead
           (take 1000)                   ; it's probably fine just to consider the first 1,000 non-nil values when trying to type a column instead of iterating over the whole collection
           (group-by type)
           (map (fn [[type valus]]
                  [type (count valus)]))
           (sort-by second)
           first
           first
           driver/class->base-type)
      :UnknownField))

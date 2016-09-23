(ns metabase.driver.mongo.util
  "`*mongo-connection*`, `with-mongo-connection`, and other functions shared between several Mongo driver namespaces."
  (:require [clojure.tools.logging :as log]
            (monger [core :as mg]
                    [credentials :as mcred])
            (metabase [driver :as driver]
                      [util :as u])))

(def ^:const ^:private connection-timeout-ms
  "Number of milliseconds to wait when attempting to establish a Mongo connection.
   By default, Monger uses a 10-second timeout, which means `can/connect?` can take
   forever, especially when called with bad details. This translates to our tests
   taking longer and the DB setup API endpoints seeming sluggish.

   Don't set the timeout too low -- I've have Circle fail when the timeout was 1000ms
   on *one* occasion."
  3000)

(def ^:dynamic ^com.mongodb.DB *mongo-connection*
  "Connection to a Mongo database.
   Bound by top-level `with-mongo-connection` so it may be reused within its body."
  nil)

(defn- build-connection-options
  "Build connection options for Mongo.
   We have to use `MongoClientOptions.Builder` directly to configure our Mongo connection
   since Monger's wrapper method doesn't support `.serverSelectionTimeout` or `.sslEnabled`."
  [& {:keys [ssl?]}]
  (-> (com.mongodb.MongoClientOptions$Builder.)
      (.connectTimeout connection-timeout-ms)
      (.serverSelectionTimeout connection-timeout-ms)
      (.sslEnabled ssl?)
      .build))

;; The arglists metadata for mg/connect are actually *WRONG* -- the function additionally supports a 3-arg airity where you can pass
;; options and credentials, as we'd like to do. We need to go in and alter the metadata of this function ourselves because otherwise
;; the Eastwood linter will complain that we're calling the function with the wrong airity :sad: :/
(alter-meta! #'mg/connect assoc :arglists '([{:keys [host port uri]}]
                                            [server-address options]
                                            [server-address options credentials]))

(defn -with-mongo-connection
  "Run F with a new connection (bound to `*mongo-connection*`) to DATABASE.
   Don't use this directly; use `with-mongo-connection`."
  [f database]
  (let [{:keys [dbname host port user pass ssl]
         :or   {port 27017, pass "", ssl false}} (cond
                                                   (string? database)            {:dbname database}
                                                   (:dbname (:details database)) (:details database) ; entire Database obj
                                                   (:dbname database)            database            ; connection details map only
                                                   :else                         (throw (Exception. (str "with-mongo-connection failed: bad connection details:" (:details database)))))
        user             (when (seq user) ; ignore empty :user and :pass strings
                           user)
        pass             (when (seq pass)
                           pass)
        server-address   (mg/server-address host port)
        credentials      (when user
                           (mcred/create user dbname pass))
        connect          (partial mg/connect server-address (build-connection-options :ssl? ssl))
        conn             (if credentials
                           (connect credentials)
                           (connect))
        mongo-connection (mg/get-db conn dbname)]
    (log/debug (u/format-color 'cyan "<< OPENED NEW MONGODB CONNECTION >>"))
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
     (with-mongo-connection [^com.mongodb.DB conn @(:db (sel :one Table ...))]
       ...)

     ;; You can use a string instead of a Database
     (with-mongo-connection [^com.mongodb.DB conn \"mongodb://127.0.0.1:27017/test\"]
        ...)

   DATABASE-OR-CONNECTION-STRING can also optionally be the connection details map on its own."
  [[binding database] & body]
  `(let [f# (fn [~binding]
              ~@body)]
     (if *mongo-connection*
       (f# *mongo-connection*)
       (-with-mongo-connection f# ~database))))

;; TODO - this isn't neccesarily Mongo-specific; consider moving
(defn values->base-type
  "Given a sequence of values, return `Field.base_type` in the most ghetto way possible.
   This just gets counts the types of *every* value and returns the `base_type` for class whose count was highest."
  [values-seq]
  {:pre [(sequential? values-seq)]}
  (or (->> values-seq
           ;; TODO - why not do a query to return non-nil values of this column instead
           (filter identity)
           ;; it's probably fine just to consider the first 1,000 *non-nil* values when trying to type a column instead
           ;; of iterating over the whole collection. (VALUES-SEQ should be up to 10,000 values, but we don't know how many are
           ;; nil)
           (take 1000)
           (group-by type)
           ;; create tuples like [Integer count].
           (map (fn [[klass valus]]
                  [klass (count valus)]))
           (sort-by second)
           last                     ; last result will be tuple with highest count
           first                    ; keep just the type
           driver/class->base-type) ; convert to Field base_type
      :type/*))

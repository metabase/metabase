(ns metabase.driver.mongo.util
  "`*mongo-connection*`, `with-mongo-connection`, and other functions shared between several Mongo driver namespaces."
  (:require [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [util :as u]]
            [metabase.models.database :refer [Database]]
            [metabase.util.ssh :as ssh]
            [monger
             [core :as mg]
             [credentials :as mcred]]
            [toucan.db :as db])
  (:import [com.mongodb MongoClientOptions MongoClientOptions$Builder MongoClientURI]))

(def ^:const ^:private connection-timeout-ms
  "Number of milliseconds to wait when attempting to establish a Mongo connection. By default, Monger uses a 10-second
  timeout, which means `can/connect?` can take forever, especially when called with bad details. This translates to
  our tests taking longer and the DB setup API endpoints seeming sluggish.

  Don't set the timeout too low -- I've have Circle fail when the timeout was 1000ms on *one* occasion."
  3000)

(def ^:dynamic ^com.mongodb.DB *mongo-connection*
  "Connection to a Mongo database. Bound by top-level `with-mongo-connection` so it may be reused within its body."
  nil)

;; the code below is done to support "additional connection options" the way some of the JDBC drivers do.
;; For example, some people might want to specify a`readPreference` of `nearest`. The normal Java way of
;; doing this would be to do
;;
;;     (.readPreference builder (ReadPreference/nearest))
;;
;; But the user will enter something like `readPreference=nearest`. Luckily, the Mongo Java lib can parse
;; these options for us and return a `MongoClientOptions` like we'd prefer. Code below:

(defn- client-options-for-url-params
  "Return an instance of `MongoClientOptions` from a URL-PARAMS string, e.g.

     (client-options-for-url-params \"readPreference=nearest\")
      ;; -> #MongoClientOptions{readPreference=nearest, ...}"
  ^MongoClientOptions [^String url-params]
  (when (seq url-params)
    ;; just make a fake connection string to tack the URL params on to. We can use that to have the Mongo lib
    ;; take care of parsing the params and converting them to Java-style `MongoConnectionOptions`
    (.getOptions (MongoClientURI. (str "mongodb://localhost/?" url-params)))))

(defn- client-options->builder
  "Return a `MongoClientOptions.Builder` for a `MongoClientOptions` `client-options`.
  If `client-options` is `nil`, return a new 'default' builder."
  ^MongoClientOptions$Builder [^MongoClientOptions client-options]
  ;; We do it tnis way because (MongoClientOptions$Builder. nil) throws a NullPointerException
  (if client-options
    (MongoClientOptions$Builder. client-options)
    (MongoClientOptions$Builder.)))

(defn- build-connection-options
  "Build connection options for Mongo.
  We have to use `MongoClientOptions.Builder` directly to configure our Mongo connection since Monger's wrapper method
  doesn't support `.serverSelectionTimeout` or `.sslEnabled`. `additional-options`, a String like
  `readPreference=nearest`, can be specified as well; when passed, these are parsed into a `MongoClientOptions` that
  serves as a starting point for the changes made below."
  ^MongoClientOptions [& {:keys [ssl? additional-options]
                          :or   {ssl? false}}]
  (-> (client-options-for-url-params additional-options)
      client-options->builder
      (.description config/mb-app-id-string)
      (.connectTimeout connection-timeout-ms)
      (.serverSelectionTimeout connection-timeout-ms)
      (.sslEnabled ssl?)
      .build))

;; The arglists metadata for mg/connect are actually *WRONG* -- the function additionally supports a 3-arg airity
;; where you can pass options and credentials, as we'd like to do. We need to go in and alter the metadata of this
;; function ourselves because otherwise the Eastwood linter will complain that we're calling the function with the
;; wrong airity :sad: :/
(alter-meta! #'mg/connect assoc :arglists '([{:keys [host port uri]}]
                                            [server-address options]
                                            [server-address options credentials]))

(defn- database->details
  "Make sure DATABASE is in a standard db details format. This is done so we can accept several different types of
   values for DATABASE, such as plain strings or the usual MB details map."
  [database]
  (cond
    (integer? database)           (db/select-one [Database :details] :id database)
    (string? database)            {:dbname database}
    (:dbname (:details database)) (:details database) ; entire Database obj
    (:dbname database)            database            ; connection details map only
    :else                         (throw (Exception. (str "with-mongo-connection failed: bad connection details:"
                                                          (:details database))))))

(defn -with-mongo-connection
  "Run F with a new connection (bound to `*mongo-connection*`) to DATABASE.
   Don't use this directly; use `with-mongo-connection`."
  [f database]
  (let [details (database->details database)]
    (ssh/with-ssh-tunnel [details-with-tunnel details]
      (let [{:keys [dbname host port user pass ssl authdb tunnel-host tunnel-user tunnel-pass additional-options]
             :or   {port 27017, pass "", ssl false}} details-with-tunnel
            user             (when (seq user) ; ignore empty :user and :pass strings
                               user)
            pass             (when (seq pass)
                               pass)
            authdb           (if (seq authdb)
                               authdb
                               dbname)
            server-address   (mg/server-address host port)
            credentials      (when user
                               (mcred/create user authdb pass))
            connect          (partial mg/connect server-address (build-connection-options :ssl? ssl, :additional-options additional-options))
            conn             (if credentials
                               (connect credentials)
                               (connect))
            mongo-connection (mg/get-db conn dbname)]
        (log/debug (u/format-color 'cyan "<< OPENED NEW MONGODB CONNECTION >>"))
        (try
          (binding [*mongo-connection* mongo-connection]
            (f *mongo-connection*))
          (finally        (mg/disconnect conn)
                          (log/debug (u/format-color 'cyan "<< CLOSED MONGODB CONNECTION >>"))))))))

(defmacro with-mongo-connection
  "Open a new MongoDB connection to ``database-or-connection-string`, bind connection to `binding`, execute `body`, and
  close the connection. The DB connection is re-used by subsequent calls to `with-mongo-connection` within
  `body`. (We're smart about it: `database` isn't even evaluated if `*mongo-connection*` is already bound.)

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

(ns metabase.driver.mongo.util
  "`*mongo-connection*`, `with-mongo-connection`, and other functions shared between several Mongo driver namespaces."
  (:require [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [util :as u]]
            [metabase.driver.util :as driver.u]
            [metabase.models.database :refer [Database]]
            [metabase.util
             [i18n :refer [trs tru]]
             [ssh :as ssh]]
            [monger
             [core :as mg]
             [credentials :as mcred]]
            [toucan.db :as db])
  (:import [com.mongodb MongoClient MongoClientOptions MongoClientOptions$Builder MongoClientURI]))

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

(defn- connection-options-builder
  "Build connection options for Mongo.
  We have to use `MongoClientOptions.Builder` directly to configure our Mongo connection since Monger's wrapper method
  doesn't support `.serverSelectionTimeout` or `.sslEnabled`. `additional-options`, a String like
  `readPreference=nearest`, can be specified as well; when passed, these are parsed into a `MongoClientOptions` that
  serves as a starting point for the changes made below."
  ^MongoClientOptions [& {:keys [ssl? additional-options ssl-cert]
                          :or   {ssl? false, ssl-cert ""}, :as details}]
  (let [client-options (-> (client-options-for-url-params additional-options)
                           client-options->builder
                           (.description config/mb-app-id-string)
                           (.connectTimeout connection-timeout-ms)
                           (.serverSelectionTimeout connection-timeout-ms)
                           (.sslEnabled ssl?))]
    (if (not (str/blank? ssl-cert))
      (-> client-options
          (.socketFactory (driver.u/socket-factory-for-cert ssl-cert)))
      client-options)))

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
    (integer? database)             (db/select-one [Database :details] :id database)
    (string? database)              {:dbname database}
    (:dbname (:details database))   (:details database) ; entire Database obj
    (:dbname database)              database            ; connection details map only
    (:conn-uri database)            database            ; connection URI has all the parameters
    (:conn-uri (:details database)) (:details database)
    :else                           (throw (Exception. (str "with-mongo-connection failed: bad connection details:"
                                                          (:details database))))))

(defn- srv-conn-str
  "Creates Mongo client connection string to connect using
   DNS + SRV discovery mechanism."
  [user pass host authdb]
  (format "mongodb+srv://%s:%s@%s/%s" user pass host authdb))

(defn- normalize-details [details]
  (let [{:keys [dbname host port user pass ssl authdb tunnel-host tunnel-user tunnel-pass additional-options use-srv ssl-cert conn-uri]
         :or   {port 27017, pass "", ssl false, use-srv false, ssl-cert ""}} details
        ;; ignore empty :user and :pass strings
        user             (when (seq user)
                           user)
        pass             (when (seq pass)
                           pass)
        authdb           (if (seq authdb)
                           authdb
                           dbname)]
    {:host               host
     :port               port
     :user               user
     :authdb             authdb
     :pass               pass
     :dbname             dbname
     :ssl                ssl
     :additional-options additional-options
     :conn-uri           conn-uri
     :srv?               use-srv
     :ssl-cert           ssl-cert}))

(defn- fqdn?
  "A very simple way to check if a hostname is fully-qualified:
   Check if there are two or more periods in the name."
  [host]
  (<= 2 (-> host frequencies (get \. 0))))

(defn- srv-connection-info
  "Connection info for Mongo using DNS SRV.  Requires FQDN for `host` in the format
   'subdomain. ... .domain.top-level-domain'.  Only a single host is supported, but a
   replica list could easily provided instead of a single host.
   Using SRV automatically enables SSL, though we explicitly set SSL to true anyway.
   Docs to generate URI string: https://docs.mongodb.com/manual/reference/connection-string/#dns-seedlist-connection-format"
  [{:keys [host port user authdb pass dbname ssl additional-options ssl-cert], :as details}]
  (if-not (fqdn? host)
    (throw (ex-info (tru "Using DNS SRV requires a FQDN for host")
                    {:host host}))
    (let [conn-opts (connection-options-builder :ssl? ssl, :additional-options additional-options, :ssl-cert ssl-cert)
          authdb (if (seq authdb)
                   authdb
                   dbname)
          conn-str (srv-conn-str user pass host authdb)]
      {:type :srv
       :uri  (MongoClientURI. conn-str conn-opts)})))

(defn- normal-connection-info
  "Connection info for Mongo.  Returns options for the fallback method to connect
   to hostnames that are not FQDNs.  This works with 'localhost', but has been problematic with FQDNs.
   If you would like to provide a FQDN, use `srv-connection-info`"
  [{:keys [host port user authdb pass dbname ssl additional-options ssl-cert], :as details}]
  (let [server-address                   (mg/server-address host port)
        credentials                      (when user
                                           (mcred/create user authdb pass))
        ^MongoClientOptions$Builder opts (connection-options-builder :ssl? ssl, :additional-options additional-options,
                                                                     :ssl-cert ssl-cert)]
    {:type           :normal
     :server-address server-address
     :credentials    credentials
     :dbname         dbname
     :options        (-> opts .build)}))

(defn- conn-string-info
  "Connection info for Mongo using a user-provided connection string."
  [{:keys [conn-uri], :as details}]
  {:type        :conn-string
   :conn-string conn-uri})

(defn- details->mongo-connection-info [{:keys [conn-uri srv?], :as details}]
  (if (str/blank? conn-uri)
      ((if srv?
         srv-connection-info
         normal-connection-info) details)
      (conn-string-info details)))

(defmulti ^:private connect
  "Connect to MongoDB using Mongo `connection-info`, return a tuple of `[mongo-client db]`, instances of `MongoClient`
   and `DB` respectively.

   If `host` is a fully-qualified domain name, then we need to connect to Mongo
   differently.  It has been problematic to connect to Mongo with an FQDN using
   `mg/connect`.  The fix was to create a connection string and use DNS SRV for
   FQDNS.  In this fn we provide the correct connection fn based on host."
  {:arglists '([connection-info])}
  :type)

(defmethod connect :srv
  [{:keys [^MongoClientURI uri ]}]
  (let [mongo-client (MongoClient. uri)]
    (if-let [db-name (.getDatabase uri)]
      [mongo-client (.getDB mongo-client db-name)]
      (throw (ex-info (tru "No database name specified in URI. Monger requires a database to be explicitly configured.")
                      {:hosts (-> uri .getHosts)
                       :uri   (-> uri .getURI)
                       :opts  (-> uri .getOptions)})))))

(defmethod connect :normal
  [{:keys [server-address options credentials dbname]}]
  (let [do-connect (partial mg/connect server-address options)
        mongo-client (if credentials
                       (do-connect credentials)
                       (do-connect))]
    [mongo-client (mg/get-db mongo-client dbname)]))

(defmethod connect :conn-string
  [{:keys [conn-string dbname]}]
  (let [mongo-client (mg/connect-via-uri conn-string)]
    [(:conn mongo-client) (:db mongo-client)]))

(defn -with-mongo-connection
  "Run `f` with a new connection (bound to `*mongo-connection*`) to `database`. Don't use this directly; use
  `with-mongo-connection`."
  [f database]
  (let [details (database->details database)]
    (ssh/with-ssh-tunnel [details-with-tunnel details]
      (let [connection-info (details->mongo-connection-info (normalize-details details-with-tunnel))
           [mongo-client db] (connect connection-info)]
       (log/debug (u/format-color 'cyan (trs "Opened new MongoDB connection.")))
       (try
         (binding [*mongo-connection* db]
           (f *mongo-connection*))
         (finally
           (mg/disconnect mongo-client)
           (log/debug (u/format-color 'cyan (trs "Closed MongoDB connection.")))))))))


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

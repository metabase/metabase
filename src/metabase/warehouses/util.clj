(ns metabase.warehouses.util
  (:require
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn get-database
  "Retrieve database respecting `include-editable-data-model?`, `exclude-uneditable-details?` and `include-mirror-databases?`"
  ([id] (get-database id {}))
  ([id :- ms/PositiveInt
    {:keys [include-editable-data-model?
            exclude-uneditable-details?
            include-destination-databases?]}
    :- [:map
        [:include-editable-data-model? {:optional true :default false} ms/MaybeBooleanValue]
        [:exclude-uneditable-details? {:optional true :default false} ms/MaybeBooleanValue]
        [:include-destination-databases? {:optional true :default false} ms/MaybeBooleanValue]]]
   (let [filter-by-data-access? (not (or include-editable-data-model? exclude-uneditable-details?))
         database               (api/check-404 (if include-destination-databases?
                                                 (t2/select-one :model/Database :id id)
                                                 (t2/select-one :model/Database :id id :router_database_id nil)))
         router-db-id           (:router_database_id database)]
     (cond-> database
       filter-by-data-access? api/read-check
       (or exclude-uneditable-details?
           router-db-id)      api/write-check))))

(defn test-database-connection
  "Try out the connection details for a database and useful error message if connection fails, returns `nil` if
   connection succeeds."
  [engine {:keys [host port] :as details}, & {:keys [log-exception]
                                              :or   {log-exception true}}]
  {:pre [(some? engine)]}
  (let [engine  (keyword engine)
        details (assoc details :engine engine)]
    (try
      (cond
        (driver.u/can-connect-with-details? engine details :throw-exceptions)
        nil

        (and host port (u/host-port-up? host port))
        {:message (tru "Connection to ''{0}:{1}'' successful, but could not connect to DB."
                       host port)}

        (and host (u/host-up? host))
        {:message (tru "Connection to host ''{0}'' successful, but port {1} is invalid."
                       host port)
         :errors  {:port (deferred-tru "check your port settings")}}

        host
        {:message (tru "Host ''{0}'' is not reachable" host)
         :errors  {:host (deferred-tru "check your host settings")}}

        :else
        {:message (tru "Unable to connect to database.")})
      (catch Throwable e
        (when (and log-exception (not (some->> e ex-cause ex-data ::driver/can-connect-message?)))
          (log/error e "Cannot connect to Database"))
        (if (-> e ex-data :message)
          (ex-data e)
          {:message (ex-message e)})))))

;; TODO - Just make `:ssl` a `feature`
(defn- supports-ssl?
  "Does the given `engine` have an `:ssl` setting?"
  [driver]
  {:pre [(driver/available? driver)]}
  (let [driver-props (driver.u/collect-all-props-by-name (driver/connection-properties driver))]
    (contains? driver-props "ssl")))

(mu/defn test-connection-details :- :map
  "Try a making a connection to database `engine` with `details`.

  If the `details` has SSL explicitly enabled, go with that and do not accept plaintext connections. If it is disabled,
  try twice: once with SSL, and a second time without if the first fails. If either attempt is successful, returns
  the details used to successfully connect. Otherwise returns a map with the connection error message. (This map will
  also contain the key `:valid` = `false`, which you can use to distinguish an error from valid details.)"
  [engine  :- [:or keyword? string?]
   details :- :map]
  (let [;; Try SSL first if SSL is supported and not already enabled
        ;; If not successful or not applicable, details-with-ssl will be nil
        details-with-ssl (assoc details :ssl true)
        details-with-ssl (when (and (supports-ssl? (keyword engine))
                                    (not (true? (:ssl details)))
                                    (nil? (test-database-connection engine details-with-ssl :log-exception false)))
                           details-with-ssl)]
    (or
      ;; Opportunistic SSL
     details-with-ssl
      ;; Try with original parameters
     (some-> (test-database-connection engine details)
             (assoc :valid false))
     details)))

(ns metabase.driver.druid
  "Druid driver."
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [clojure.tools.logging :as log]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.druid.query-processor :as qp]
            [metabase.models
             [database :refer [Database]]
             [field :as field]
             [table :as table]]
            [metabase.util.ssh :as ssh]
            [toucan.db :as db]))

;;; ### Request helper fns

(defn- details->url
  "Helper for building a Druid URL.

    (details->url {:host \"http://localhost\", :port 8082} \"druid/v2\") -> \"http://localhost:8082/druid/v2\""
  [{:keys [host port]} & strs]
  {:pre [(string? host) (seq host) (integer? port)]}
  (apply str (format "%s:%d" host port) (map name strs)))

;; TODO - Should this go somewhere more general, like util ?
(defn- do-request
  "Perform a JSON request using REQUEST-FN against URL.
   Tho

     (do-request http/get \"http://my-json-api.net\")"
  [request-fn url & {:as options}]
  {:pre [(fn? request-fn) (string? url)]}
  (let [options               (cond-> (merge {:content-type "application/json"} options)
                                (:body options) (update :body json/generate-string))
        {:keys [status body]} (request-fn url options)]
    (when (not= status 200)
      (throw (Exception. (format "Error [%d]: %s" status body))))
    (try (json/parse-string body keyword)
         (catch Throwable _
           (throw (Exception. (str "Failed to parse body: " body)))))))

(def ^:private ^{:arglists '([url & {:as options}])} GET  (partial do-request http/get))
(def ^:private ^{:arglists '([url & {:as options}])} POST (partial do-request http/post))


;;; ### Misc. Driver Fns

(defn- can-connect? [details]
  (ssh/with-ssh-tunnel [details-with-tunnel details]
    (= 200 (:status (http/get (details->url details-with-tunnel "/status"))))))


;;; ### Query Processing

(defn- do-query [details query]
  {:pre [(map? query)]}
  (ssh/with-ssh-tunnel [details-with-tunnel details]
    (try (vec (POST (details->url details-with-tunnel "/druid/v2"), :body query))
         (catch Throwable e
           ;; try to extract the error
           (println "(u/pprint-to-str 'red e):" (u/pprint-to-str 'red (or (ex-data e) e))) ; NOCOMMIT
           (let [message (or (u/ignore-exceptions
                               (:error (json/parse-string (:body (:object (ex-data e))) keyword)))
                             (.getMessage e))]
             (log/error (u/format-color 'red "Error running query:\n%s" message))
             ;; Re-throw a new exception with `message` set to the extracted message
             (throw (Exception. message e)))))))


;;; ### Sync

(defn- do-segment-metadata-query [details datasource]
  (do-query details {"queryType"     "segmentMetadata"
                     "dataSource"    datasource
                     "intervals"     ["1999-01-01/2114-01-01"]
                     "analysisTypes" []
                     "merge"         true}))

(defn- druid-type->base-type [field-type]
  (case field-type
    "STRING"      :type/Text
    "FLOAT"       :type/Float
    "LONG"        :type/Integer
    "hyperUnique" :type/DruidHyperUnique
    :type/Float))

(defn- describe-table-field [field-name {field-type :type, :as info}]
  ;; all dimensions are Strings, and all metrics as JS Numbers, I think (?)
  ;; string-encoded booleans + dates are treated as strings (!)
  {:name          (name field-name)
   :base-type     (druid-type->base-type field-type)
   :database-type field-type})

(defn- describe-table [database table]
  (ssh/with-ssh-tunnel [details-with-tunnel (:details database)]
    (let [{:keys [columns]} (first (do-segment-metadata-query details-with-tunnel (:name table)))]
      {:schema nil
       :name   (:name table)
       :fields (set (concat
                     ;; every Druid table is an event stream w/ a timestamp field
                     [{:name          "timestamp"
                       :database-type "timestamp"
                       :base-type     :type/DateTime
                       :pk?           true}]
                     (for [[field-name field-info] (dissoc columns :__time)]
                       (describe-table-field field-name field-info))))})))

(defn- describe-database [database]
  {:pre [(map? (:details database))]}
  (ssh/with-ssh-tunnel [details-with-tunnel (:details database)]
    (let [druid-datasources (GET (details->url details-with-tunnel "/druid/v2/datasources"))]
      {:tables (set (for [table-name druid-datasources]
                      {:schema nil, :name table-name}))})))


;;; ### DruidrDriver Class Definition

(defrecord DruidDriver []
  clojure.lang.Named
  (getName [_] "Druid"))

(u/strict-extend DruidDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:can-connect?      (u/drop-first-arg can-connect?)
          :describe-database (u/drop-first-arg describe-database)
          :describe-table    (u/drop-first-arg describe-table)
          :details-fields    (constantly (ssh/with-tunnel-config
                                           [{:name         "host"
                                             :display-name "Host"
                                             :default      "http://localhost"}
                                            {:name         "port"
                                             :display-name "Broker node port"
                                             :type         :integer
                                             :default      8082}]))
          :execute-query     (fn [_ query] (qp/execute-query do-query query))
          :features          (constantly #{:basic-aggregations :set-timezone :expression-aggregations})
          :mbql->native      (u/drop-first-arg qp/mbql->native)}))

(defn -init-driver
  "Register the druid driver."
  []
  (driver/register-driver! :druid (DruidDriver.)))

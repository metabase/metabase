(ns metabase.driver.druid
  "Druid driver."
  (:require [clj-http.client :as http]
            [cheshire.core :as json]
            [metabase.driver :as driver]))

;; TODO - should we use clj-druid ? https://github.com/y42/clj-druid

(def ^:private ^:const +details+ {:host  "http://localhost", :port 8084})

(defn- details->url [{:keys [host port]} & args]
  {:pre [(string? host) (seq host) (integer? port)]}
  (apply str (format "%s:%d" host port) args))

(defn- can-connect?
  ([_ details]
   (can-connect? details))
  ([details]
   (= 200 (:status (http/get (details->url details "/status"))))))

(defn- do-query [details query]
  {:pre [(map? query)]}
  (let [url      (details->url details "/druid/v2")
        response (http/post url {:content-type "application/json"
                                 :body         (json/generate-string query)})]
    (when (not= (:status response) 200)
      (throw (Exception. (format "Error [%d]: %s" (:status response) (:body response)))))
    (vec (json/parse-string (:body response) keyword))))

(defn- process-structured [_ query]
  {:ok true})

(def ^:private query (partial do-query +details+))

(defn- q1
  "timeBoundary -- boundaries of the ingested data"
  [] (query {:queryType  :timeBoundary
             :dataSource :wikipedia}))

(defn- q2
  "timeseries query -- grouped into single bucket"
  [] (query {:queryType    :timeseries
             :dataSource   :wikipedia
             :intervals    ["2010-01-01/2020-01-01"]
             :granularity  :all
             :aggregations [{:type      :longSum
                             :fieldName :count
                             :name      :edit_count}
                            {:type      :doubleSum
                             :fieldName :added
                             :name      :chars_added}]}))

(defn- q3
  "timeseries query w/ minute granularity"
  [] (query {:queryType    :timeseries
             :dataSource   :wikipedia
             :intervals    ["2010-01-01/2020-01-01"]
             :granularity  :minute
             :aggregations [{:type      :longSum
                             :fieldName :count
                             :name      :edit_count}
                            {:type      :doubleSum
                             :fieldName :added
                             :name      :chars_added}]}))

(defn- q4
  "top 10 pages in the US"
  [] (query {:queryType    :topN
             :threshold    10
             :granularity  :all
             :filter       {:type      :selector
                            :dimension :country
                            :value     "United States"}
             :dataSource   :wikipedia
             :dimension    :page
             :intervals    ["2012-10-01T00:00/2020-01-01T00"]
             :metric       :edit_count
             :aggregations [{:type      :longSum
                             :fieldName :count
                             :name      :edit_count}]}))

(defn- get-datasources-list
  "TODO -- why doesn't this work? This is how we can implement `active-tables`
   See also http://druid.io/docs/latest/development/router.html"
  [] (http/get (details->url +details+ "/druid/v2/datasources")))

(defn- q5
  "Data Source Metadata query -- metadata information for a dataSource (table).
   http://druid.io/docs/latest/querying/datasourcemetadataquery.html"
  [] (query {:queryType :dataSourceMetadata
             :dataSource :wikipedia}))


(defrecord DruidDriver []
  clojure.lang.Named
  (getName [_] "Druid"))

(extend DruidDriver
  driver/IDriver
  (merge driver/IDriverDefaultsMixin
         {:active-column-names->type      (constantly nil)
          :active-nested-field-name->type (constantly nil)
          :active-tables                  (constantly nil)
          :can-connect?                   can-connect?
          :details-fields                 (constantly [{:name         "host"
                                                        :display-name "Host"
                                                        :default      "localhost"}
                                                       {:name         "port"
                                                        :display-name "Port"
                                                        :type         :integer
                                                        :default      8084}])
          :field-values-lazy-seq          (constantly nil)
          :process-native                 (constantly nil)
          :process-structured             process-structured
          :table-pks                      (constantly nil)}))

(driver/register-driver! :druid (DruidDriver.))

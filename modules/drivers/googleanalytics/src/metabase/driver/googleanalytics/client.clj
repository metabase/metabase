(ns metabase.driver.googleanalytics.client
  (:require [metabase.driver.google :as google])
  (:import com.google.api.client.googleapis.auth.oauth2.GoogleCredential
           [com.google.api.services.analytics Analytics Analytics$Builder AnalyticsScopes]
           java.util.Collections))

(defn- ^Analytics credential->client [^GoogleCredential credential]
  (.build (doto (Analytics$Builder. google/http-transport google/json-factory credential)
            (.setApplicationName google/application-name))))

(def ^:private ^{:arglists '([database])} ^GoogleCredential database->credential
  (partial google/database->credential (Collections/singleton AnalyticsScopes/ANALYTICS_READONLY)))

(defn database->client
  "Given a Metabase Database return an instance of the Google Analytics client."
  ^Analytics [database]
  (-> database database->credential credential->client))

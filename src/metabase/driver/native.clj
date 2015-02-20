(ns metabase.driver.native
  "The `native` query processor."
  (:import com.metabase.corvus.api.ApiException)
  (:require [metabase.api.common :refer :all]
            [metabase.db :refer [sel]]
            (metabase.models [database :refer [Database]])))

(def class->base-type
  "Map of classes returned from DB call to metabase.models.field/base-types"
  {java.lang.Boolean :BooleanField
   java.lang.Double :FloatField
   java.lang.Integer :IntegerField
   java.lang.Long :IntegerField
   java.lang.String :TextField
   java.sql.Timestamp :DateTimeField})

(defn- value->base-type
  "Attempt to match a value we get back from the DB with the corresponding base-type`."
  [v]
  (if-not v :UnknownField
          (or (class->base-type (type v))
              (throw (ApiException. (int 500) (format "Missing base type mapping for %s in metabase.driver.native/class->base-type. Please add an entry."
                                                      (str (type v))))))))

(defn- get-cols [row]
  (->> row
       (map (fn [[k v]]
              {:name k
               :base_type (value->base-type v)}))))

(defn process-and-run [{:keys [native database] :as query}]
  (println "QUERY: " query)
  (let [db (sel :one Database :id database)
        sql (:query native)
        results ((:native-query db) sql)]
    {:status :completed
     :row_count (count results)
     :data {:rows (map vals results)
            :columns (keys (first results))
            :cols (get-cols (first results))}}))

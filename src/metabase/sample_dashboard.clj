(ns metabase.sample-dashboard
  (:require [cheshire.core :as json]))

;; create dashboard

#_(-> (slurp "sample-dashboard.json")
      (json/parse-string)
      (first)
      (update "Parameters" json/parse-string))

(def ^:private tabs
  ;; position, 0-indexed
  ["Overview" "Portfolio performance" "Demographics"])

{:name "E-commerce insights"
 :description "Quickly take an overview of an e-commerce reseller business and dive into separate tabs that focus on top selling products and demographic insights. Each vendor can log in as a tenant and see their own data sandboxed from all the others."
 :width "full"
 :show_in_getting_started false}

(def ^:private params
  [{:name "Vendor",     :slug "vendor",     :id "fc2cd1be", :type "string/=",   :sectionId "string", :isMultiSelect false}
   {:name "Date Range", :slug "date_range", :id "afa56954", :type "date/range", :sectionId "date"}
   {:name "Category",   :slug "category",   :id "5eeec658", :type "string/=",   :sectionId "string",   :values_query_type "list"}
   {:name "Location",   :slug "location",   :id "512c560a", :type "string/=",   :sectionId "location", :values_query_type "none"}])

;; No idea what this is versus params. No idea what table each corresponds to.
(def ^:private param-fields
  ["Created At"
   "Category"
   "Vendor"
   ;; different table
   "Created At"
   "State"])

{
 "Show In Getting Started" "false",
 "Width"                   "full",
 "Collection ID"           "1449",
 "Creator ID"              "151",
 }

;; create questions

;; add question to dashboard

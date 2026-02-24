(ns metabase-enterprise.product-analytics.cors
  (:require
   [clojure.string :as str]
   [metabase.premium-features.core :refer [defenterprise]]
   [toucan2.core :as t2]))

(defenterprise product-analytics-approved-origins
  "Returns space-separated approved origins from all active PA sites' allowed_domains.
   Only applies to the PA send endpoint."
  :feature :product-analytics
  [request]
  (when (str/starts-with? (str (:uri request)) "/api/ee/product-analytics/api/send")
    (let [domains (t2/select-fn-set :allowed_domains :model/ProductAnalyticsSite :archived false)]
      (when (seq domains)
        (let [result (->> domains
                          (remove str/blank?)
                          (mapcat #(str/split % #","))
                          (map str/trim)
                          (remove str/blank?)
                          (str/join " "))]
          (when-not (str/blank? result)
            result))))))

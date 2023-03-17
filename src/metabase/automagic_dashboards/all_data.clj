(ns metabase.automagic-dashboards.all-data
  (:require [metabase.automagic-dashboards.rules :as rules]
            [metabase.util.i18n :as i18n :refer [deferred-tru trs tru]]))

(def all-dims
  (->>
   (for [prefix    ["comparison" "field" "metric" "question" "table"]
         {:keys [dimensions]} (rules/get-rules [prefix])
         dimension dimensions
         :let [[dimension-name dimension-def] (first dimension)]]
     [dimension-name
      (-> dimension-def
          (update :field_type (fn [[a b]] [(or b a)])))])
   distinct
   (map (partial apply hash-map))
   (sort-by (juxt ffirst (comp - :score second first)))))

(def all-dims
  [{"BatchNum" {:field_type [:type/Integer] :score 100 :named "batch"}}
   {"Birthdate" {:field_type [:type/Birthdate] :score 100}}
   {"Channel" {:field_type ["ga:channelGrouping"] :score 100}}
   {"Cohort" {:field_type [:type/JoinTimestamp] :score 100}}
   {"Cohort" {:field_type [:type/CreationTimestamp] :score 90}}
   {"Cohort" {:field_type [:type/DateTime] :score 80}}
   {"Country" {:field_type [:type/Country] :score 100}}
   {"Country" {:field_type ["ga:countryIsoCode"] :score 100}}
   {"CreateDate" {:field_type [:type/CreationDate] :score 80}}
   {"CreateTime" {:field_type [:type/CreationTime] :score 80}}
   {"CreateTimestamp" {:field_type [:type/CreationTimestamp] :score 80}}
   {"Date" {:field_type [:type/Date] :score 50}}
   {"Day" {:field_type ["ga:date"] :score 100}}
   {"DeviceType" {:field_type ["ga:deviceCategory"] :score 100}}
   {"Discount" {:field_type [:type/Discount] :score 100}}
   {"FK" {:field_type [:type/FK] :score 100}}
   {"GenericCategoryLarge" {:field_type [:type/Category] :score 80}}
   {"GenericCategoryMedium" {:field_type [:type/Category] :score 90 :max_cardinality 10}}
   {"GenericCategoryMedium" {:field_type [:type/Category] :score 90 :max_cardinality 12}}
   {"GenericCategoryMedium" {:field_type [:type/Category] :score 75 :max_cardinality 10}}
   {"GenericCategoryMedium" {:field_type [:type/Category] :score 75}}
   {"GenericCategorySmall" {:field_type [:type/Category] :score 100 :max_cardinality 5}}
   {"GenericNumber" {:field_type [:type/Number] :score 100}}
   {"GenericNumber" {:field_type [:type/Number] :score 80}}
   {"Income" {:field_type [:type/Income] :score 100}}
   {"JoinDate" {:field_type [:type/JoinTimestamp] :score 100}}
   {"JoinDate" {:field_type [:type/JoinDate] :score 100}}
   {"JoinDate" {:field_type [:type/CreationTimestamp] :score 99}}
   {"JoinDate" {:field_type [:type/CreationDate] :score 90}}
   {"JoinDate" {:field_type [:type/JoinDate] :score 50}}
   {"JoinDate" {:field_type [:type/DateTime] :score 30}}
   {"JoinDate" {:field_type [:type/Date] :score 30}}
   {"JoinTime" {:field_type [:type/JoinTime] :score 50}}
   {"JoinTimestamp" {:field_type [:type/JoinTimestamp] :score 50}}
   {"LandingPage" {:field_type ["ga:landingPagePath"] :score 100}}
   {"Lat" {:field_type [:type/Latitude] :score 100}}
   {"Long" {:field_type [:type/Longitude] :score 100}}
   {"LongLat" {:field_type [:type/Coordinate] :score 100}}
   {"Name" {:field_type [:type/Name] :score 100}}
   {"Page" {:field_type ["ga:pagePath"] :score 100}}
   {"ProductCategory" {:field_type [:type/Category] :score 100 :max_cardinality 10}}
   {"ProductCategoryMedium" {:field_type [:type/Category] :score 90 :named "category"}}
   {"ProductMedium" {:field_type [:type/Name] :score 100 :max_cardinality 10}}
   {"ProductMedium" {:field_type [:type/Title] :score 100}}
   {"ProductMedium" {:field_type [:type/Name] :score 100}}
   {"ProductMedium" {:field_type [:type/Product] :score 90 :max_cardinality 10}}
   {"Quantity" {:field_type [:type/Quantity] :score 100}}
   {"Singleton" {:field_type [:type/Category] :score 100 :max_cardinality 1}}
   {"Source" {:field_type [:type/Source] :score 100}}
   {"Source" {:field_type ["ga:source"] :score 100}}
   {"SourceMedium" {:field_type [:type/Source] :score 90}}
   {"SourceSmall" {:field_type [:type/Source] :score 100 :max_cardinality 5}}
   {"State" {:field_type [:type/State] :score 100}}
   {"Time" {:field_type [:type/Time] :score 50}}
   {"Timestamp" {:field_type [:type/CreationTimestamp] :score 90}}
   {"Timestamp" {:field_type [:type/CreationDate] :score 80}}
   {"Timestamp" {:field_type [:type/DateTime] :score 70}}
   {"Timestamp" {:field_type [:type/Date] :score 60}}
   {"Timestamp" {:field_type [:type/DateTime] :score 50}}
   {"UserFK" {:field_type [:type/FK] :score 100 :links_to :entity/UserTable}}
   {"UserPK" {:field_type [:type/PK] :score 100}}
   {"ZIP" {:field_type [:type/ZipCode] :score 100}}
   {"ZipCode" {:field_type [:type/ZipCode] :score 100}}])

(def prefixes ["comparison" "field" "metric" "question" "table"])

(def all-metrics
  (->>
   (for [prefix prefixes
         {:keys [metrics]} (rules/get-rules [prefix])
         item   metrics
         :let [[n def] (first item)]]
     [n def])
   distinct
   (map (partial apply hash-map))))

(def all-metrics
  (map
   (fn [m] (update-vals m (fn [{:keys [name] :as v}]
                            (cond-> v
                              name
                              (update :name #(i18n/->UserLocalizedString % nil {}))))))
   [{"Count" {:metric ["count"], :score 100}}
    ;{"Sum" {:metric ["sum" ["dimension" "GenericNumber"]], :score 100}}
    ;{"Avg" {:metric ["avg" ["dimension" "GenericNumber"]], :score 100}}
    {"Distinct" {:metric ["distinct" ["dimension" "this"]], :score 100}}
    {"Sum" {:metric ["sum" ["dimension" "this"]], :score 100}}
    {"Avg" {:metric ["avg" ["dimension" "this"]], :score 100}}
    {"Min" {:metric ["min" ["dimension" "this"]], :score 100}}
    {"Max" {:metric ["max" ["dimension" "this"]], :score 100}}
    {"SD" {:metric ["stddev" ["dimension" "this"]], :score 100}}
    ;{"TotalIncome" {:metric ["sum" ["dimension" "Income"]], :score 90}}
    ;{"TotalOrders" {:metric ["count"], :score 100}}
    {"CountDistinctFKs" {:metric ["distinct" ["dimension" "FK"]], :score 100}}
    {"AvgDiscount" {:metric ["/"
                             ["sum" ["dimension" "Discount"]]
                             ["sum" ["dimension" "Income"]]],
                    :score  100,
                    :name   "Average discount %"}}
    {"TotalIncome" {:metric ["sum" ["dimension" "Income"]],
                    :score  100,
                    :name   "Total income"}}
    {"AvgIncome" {:metric ["avg" ["dimension" "Income"]],
                  :score  100,
                  :name   "Average income per transaction"}}
    {"AvgQuantity" {:metric ["avg" ["dimension" "Quantity"]],
                    :score  100,
                    :name   "Average quantity"}}
    {"TotalOrders" {:metric ["count"], :score 100, :name "Number of orders"}}
    {"Sessions" {:metric ["METRIC" "ga:sessions"], :score 100}}
    {"Pageviews" {:metric ["METRIC" "ga:pageviews"], :score 100}}
    {"1DayActiveUsers" {:metric ["METRIC" "ga:1dayUsers"], :score 100}}]))

(def all-groups
  (->>
   (for [prefix prefixes
         {:keys [groups]} (rules/get-rules [prefix])
         item   groups]
     item)
   distinct
   (map (partial apply hash-map))
   (apply merge)))

(def all-groups
  (apply merge
         (map
          (fn [m]
            (update-vals m (fn [{:keys [comparison_title] :as m}]
                             (cond-> (update m :title #(i18n/->UserLocalizedString % nil {}))
                               comparison_title
                               (update :comparison_title #(i18n/->UserLocalizedString % nil {}))))))
          [{"Breakdowns" {:title "How the [[this]] is distributed",
                          :comparison_title "How they compare by distribution"}}
           ;{"Breakdowns" {:title "How the [[this]] is distributed across categories",
           ;               :comparison_title "How they compare by distribution"}}
           {"ByTime" {:title "These [[this.short-name]] across time",
                      :comparison_title "How they compare across time"}}
           {"Categories" {:title "How this metric is distributed across different categories",
                          :comparison_title "How they compare across different categories"}}
           ;{"General" {:title "How these [[this.short-name]] are distributed",
           ;            :comparison_title "How they compare by distribution"}}
           ;{"General" {:title "How these transactions are distributed"}}
           ;{"General" {:title "Events by different categories"}}
           {"General" {:title "How these [[this.short-name]] are distributed"}}
           ;{"Geographical" {:title "How the [[this]] is distributed geographically",
           ;                 :comparison_title "How they compare across location"}}
           ;{"Geographical" {:title "The [[this]] by location",
           ;                 :comparison_title "How they compare across location"}}
           {"Geographical" {:title "Where your [[this.short-name]] are",
                            :comparison_title "How they compare across location"}}
           ;{"Geographical" {:title "Where these transactions happened"}}
           ;{"Geographical" {:title "Where these events are happening"}}
           ;{"Geographical" {:title "Where these [[this.short-name]] are"}}
           {"LargeCategoriesBottom" {:title "Bottom 5 per category"}}
           {"LargeCategoriesTop" {:title "Top 5 per category"}}
           {"Numbers" {:title "How this metric is distributed across different numbers",
                       :comparison_title "How they compare by across different numbers"}}
           {"OrderBreakdown" {:title "Some breakdown"}}
           {"Overview" {:title "Overview"}}
           ;{"Overview" {:title "Summary"}}
           {"Periodicity" {:title "The [[this]] over time",
                           :comparison_title "How they compare across time"}}
           ;{"Periodicity" {:title "Events over time"}}
           {"Seasonality" {:title "Seasonal patterns in the [[this]]",
                           :comparison_title "How they compare by seasonality"}}
           ;{"Seasonality" {:title "How the [[this]] changes with time",
           ;                :comparison_title "How they compare across time"}}
           {"SessionsBreakdown" {:title "Sessions"}}
           {"Singletons" {:title "These are the same for all your [[this.short-name]]"}}])))

(def all-filters
  (->>
   (for [prefix prefixes
         {:keys [filters]} (rules/get-rules [prefix])
         item   filters
         :let [[n def] (first item)]]
     [n def])
   distinct
   (map (partial apply hash-map))))

(def all-cards
  (->>
   (for [prefix prefixes
         {:keys [cards]} (rules/get-rules [prefix])
         item   cards
         :let [[n def] (first item)]]
     [n def])
   distinct
   (map (partial apply hash-map))
   (drop 4)
   (take 1)
   ;; Temporary hack to understand a single card's behavior
   ;(filter (comp #{"OrdersByState"} ffirst))
   ))

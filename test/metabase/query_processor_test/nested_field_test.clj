(ns metabase.query-processor-test.nested-field-test
  "Tests for nested field access."
  (:require [metabase.query-processor-test :refer :all]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]))

;;; Nested Field in FILTER
;; Get the first 10 tips where tip.venue.name == "Kyle's Low-Carb Grill"
(datasets/expect-with-engines (non-timeseries-engines-with-feature :nested-fields)
  [[8   "Kyle's Low-Carb Grill"]
   [67  "Kyle's Low-Carb Grill"]
   [80  "Kyle's Low-Carb Grill"]
   [83  "Kyle's Low-Carb Grill"]
   [295 "Kyle's Low-Carb Grill"]
   [342 "Kyle's Low-Carb Grill"]
   [417 "Kyle's Low-Carb Grill"]
   [426 "Kyle's Low-Carb Grill"]
   [470 "Kyle's Low-Carb Grill"]]
  (->> (data/dataset geographical-tips
         (data/run-mbql-query tips
           {:filter   [:= $tips.venue.name "Kyle's Low-Carb Grill"]
            :order-by [[:asc $id]]
            :limit    10}))
       rows (mapv (fn [[id _ _ _ {venue-name :name}]] [id venue-name]))))

;;; Nested Field in ORDER
;; Let's get all the tips Kyle posted on Twitter sorted by tip.venue.name
(datasets/expect-with-engines (non-timeseries-engines-with-feature :nested-fields)
  [[446
    {:mentions ["@cams_mexican_gastro_pub"], :tags ["#mexican" "#gastro" "#pub"], :service "twitter", :username "kyle"}
    "Cam's Mexican Gastro Pub is a historical and underappreciated place to conduct a business meeting with friends."
    {:large  "http://cloudfront.net/6e3a5256-275f-4056-b61a-25990b4bb484/large.jpg",
     :medium "http://cloudfront.net/6e3a5256-275f-4056-b61a-25990b4bb484/med.jpg",
     :small  "http://cloudfront.net/6e3a5256-275f-4056-b61a-25990b4bb484/small.jpg"}
    {:phone "415-320-9123", :name "Cam's Mexican Gastro Pub", :categories ["Mexican" "Gastro Pub"], :id "bb958ac5-758e-4f42-b984-6b0e13f25194"}]
   [230
    {:mentions ["@haight_european_grill"], :tags ["#european" "#grill"], :service "twitter", :username "kyle"}
    "Haight European Grill is a horrible and amazing place to have a birthday party during winter."
    {:large  "http://cloudfront.net/1dcef7de-a1c4-405b-a9e1-69c92d686ef1/large.jpg",
     :medium "http://cloudfront.net/1dcef7de-a1c4-405b-a9e1-69c92d686ef1/med.jpg",
     :small  "http://cloudfront.net/1dcef7de-a1c4-405b-a9e1-69c92d686ef1/small.jpg"}
    {:phone "415-191-2778", :name "Haight European Grill", :categories ["European" "Grill"], :id "7e6281f7-5b17-4056-ada0-85453247bc8f"}]
   [319
    {:mentions ["@haight_soul_food_pop_up_food_stand"], :tags ["#soul" "#food" "#pop-up" "#food" "#stand"], :service "twitter", :username "kyle"}
    "Haight Soul Food Pop-Up Food Stand is a underground and modern place to have breakfast on a Tuesday afternoon."
    {:large  "http://cloudfront.net/8f613909-550f-4d79-96f6-dc498ff65d1b/large.jpg",
     :medium "http://cloudfront.net/8f613909-550f-4d79-96f6-dc498ff65d1b/med.jpg",
     :small  "http://cloudfront.net/8f613909-550f-4d79-96f6-dc498ff65d1b/small.jpg"}
    {:phone "415-741-8726", :name "Haight Soul Food Pop-Up Food Stand", :categories ["Soul Food" "Pop-Up Food Stand"], :id "9735184b-1299-410f-a98e-10d9c548af42"}]
   [224
    {:mentions ["@pacific_heights_free_range_eatery"], :tags ["#free-range" "#eatery"], :service "twitter", :username "kyle"}
    "Pacific Heights Free-Range Eatery is a wonderful and modern place to take visiting friends and relatives Friday nights."
    {:large  "http://cloudfront.net/cedd4221-dbdb-46c3-95a9-935cce6b3fe5/large.jpg",
     :medium "http://cloudfront.net/cedd4221-dbdb-46c3-95a9-935cce6b3fe5/med.jpg",
     :small  "http://cloudfront.net/cedd4221-dbdb-46c3-95a9-935cce6b3fe5/small.jpg"}
    {:phone "415-901-6541", :name "Pacific Heights Free-Range Eatery", :categories ["Free-Range" "Eatery"], :id "88b361c8-ce69-4b2e-b0f2-9deedd574af6"}]]
  (rows (data/dataset geographical-tips
          (data/run-mbql-query tips
            {:filter   [:and
                        [:= $tips.source.service "twitter"]
                        [:= $tips.source.username "kyle"]]
             :order-by [[:asc $tips.venue.name]]}))))

;; Nested Field in AGGREGATION
;; Let's see how many *distinct* venue names are mentioned
(datasets/expect-with-engines (non-timeseries-engines-with-feature :nested-fields)
  [99]
  (first-row (data/dataset geographical-tips
               (data/run-mbql-query tips
                 {:aggregation [[:distinct $tips.venue.name]]}))))

;; Now let's just get the regular count
(datasets/expect-with-engines (non-timeseries-engines-with-feature :nested-fields)
  [500]
  (first-row (data/dataset geographical-tips
               (data/run-mbql-query tips
                 {:aggregation [[:count $tips.venue.name]]}))))

;;; Nested Field in BREAKOUT
;; Let's see how many tips we have by source.service
(datasets/expect-with-engines (non-timeseries-engines-with-feature :nested-fields)
  {:rows        [["facebook"   107]
                 ["flare"      105]
                 ["foursquare" 100]
                 ["twitter"     98]
                 ["yelp"        90]]
   :columns     ["source.service" "count"]
   :native_form true}
  (->> (data/dataset geographical-tips
         (data/run-mbql-query tips
           {:aggregation [[:count]]
            :breakout    [$tips.source.service]}))
       booleanize-native-form
       :data (#(dissoc % :cols)) (format-rows-by [str int])))

;;; Nested Field in FIELDS
;; Return the first 10 tips with just tip.venue.name
(datasets/expect-with-engines (non-timeseries-engines-with-feature :nested-fields)
  {:columns ["venue.name"]
   :rows    [["Lucky's Gluten-Free Café"]
             ["Joe's Homestyle Eatery"]
             ["Lower Pac Heights Cage-Free Coffee House"]
             ["Oakland European Liquor Store"]
             ["Tenderloin Gormet Restaurant"]
             ["Marina Modern Sushi"]
             ["Sunset Homestyle Grill"]
             ["Kyle's Low-Carb Grill"]
             ["Mission Homestyle Churros"]
             ["Sameer's Pizza Liquor Store"]]}
  (select-keys (:data (data/dataset geographical-tips
                        (data/run-mbql-query tips
                          {:fields   [$tips.venue.name]
                           :order-by [[:asc $id]]
                           :limit    10})))
               [:columns :rows]))


;;; Nested Field w/ ordering by aggregation
(datasets/expect-with-engines (non-timeseries-engines-with-feature :nested-fields)
  [["jane"           4]
   ["kyle"           5]
   ["tupac"          5]
   ["jessica"        6]
   ["bob"            7]
   ["lucky_pigeon"   7]
   ["joe"            8]
   ["mandy"          8]
   ["amy"            9]
   ["biggie"         9]
   ["sameer"         9]
   ["cam_saul"      10]
   ["rasta_toucan"  13]
   [nil            400]]
  (->> (data/dataset geographical-tips
         (data/run-mbql-query tips
           {:aggregation [[:count]]
            :breakout    [$tips.source.mayor]
            :order-by    [[:asc [:aggregation 0]]]}))
       rows (format-rows-by [identity int])))

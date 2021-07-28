(ns metabase.query-processor-test.nested-field-test
  "Tests for nested field access."
  (:require [clojure.test :refer :all]
            [metabase.test :as mt]))

(deftest filter-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-fields)
    (testing "Nested Field in FILTER"
      (mt/dataset geographical-tips
        ;; Get the first 10 tips where tip.venue.name == "Kyle's Low-Carb Grill"
        (is (= [[8   "Kyle's Low-Carb Grill"]
                [67  "Kyle's Low-Carb Grill"]
                [80  "Kyle's Low-Carb Grill"]
                [83  "Kyle's Low-Carb Grill"]
                [295 "Kyle's Low-Carb Grill"]
                [342 "Kyle's Low-Carb Grill"]
                [417 "Kyle's Low-Carb Grill"]
                [426 "Kyle's Low-Carb Grill"]
                [470 "Kyle's Low-Carb Grill"]]
               (mapv
                (fn [[id _ _ _ {venue-name :name}]] [id venue-name])
                (mt/rows
                  (mt/run-mbql-query tips
                    {:filter   [:= $tips.venue.name "Kyle's Low-Carb Grill"]
                     :order-by [[:asc $id]]
                     :limit    10})))))))))

(deftest order-by-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-fields)
    (testing "Nested Field in ORDER-BY"
      (mt/dataset geographical-tips
        ;; Let's get all the tips Kyle posted on Twitter sorted by tip.venue.name
        (is (= [[446
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
               (mt/rows
                 (mt/run-mbql-query tips
                   {:filter   [:and
                               [:= $tips.source.service "twitter"]
                               [:= $tips.source.username "kyle"]]
                    :order-by [[:asc $tips.venue.name]]}))))))))

(deftest aggregation-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-fields)
    (testing "Nested Field in AGGREGATION"
      (mt/dataset geographical-tips
        (testing ":distinct aggregation"
          ;; Let's see how many *distinct* venue names are mentioned
          (is (= [99]
                 (mt/first-row
                   (mt/run-mbql-query tips
                     {:aggregation [[:distinct $tips.venue.name]]})))))

        (testing ":count aggregation"
          ;; Now let's just get the regular count
          (is (= [500]
                 (mt/first-row
                   (mt/run-mbql-query tips
                     {:aggregation [[:count $tips.venue.name]]})))))))))

(deftest breakout-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-fields)
    (testing "Nested Field in BREAKOUT"
      ;; Let's see how many tips we have by source.service
      (mt/dataset geographical-tips
        (is (= [["facebook"   107]
                ["flare"      105]
                ["foursquare" 100]
                ["twitter"     98]
                ["yelp"        90]]
               (mt/formatted-rows [str int]
                 (mt/run-mbql-query tips
                   {:aggregation [[:count]]
                    :breakout    [$tips.source.service]}))))

        (is (= [[nil 297]
                ["amy" 20]
                ["biggie" 11]
                ["bob" 20]]
               (mt/formatted-rows [str int]
                 (mt/run-mbql-query tips
                   {:aggregation [[:count]]
                    :breakout    [$tips.source.username]
                    :limit       4}))))))))

(deftest fields-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-fields)
    (testing "Nested Field in FIELDS"
      (mt/dataset geographical-tips
        ;; Return the first 10 tips with just tip.venue.name
        (is (= [["Lucky's Gluten-Free Café"]
                ["Joe's Homestyle Eatery"]
                ["Lower Pac Heights Cage-Free Coffee House"]
                ["Oakland European Liquor Store"]
                ["Tenderloin Gormet Restaurant"]
                ["Marina Modern Sushi"]
                ["Sunset Homestyle Grill"]
                ["Kyle's Low-Carb Grill"]
                ["Mission Homestyle Churros"]
                ["Sameer's Pizza Liquor Store"]]
               (mt/rows
                 (mt/run-mbql-query tips
                   {:fields   [$tips.venue.name]
                    :order-by [[:asc $id]]
                    :limit    10}))))))))

(deftest order-by-aggregation-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-fields)
    (testing "Nested Field w/ ordering by aggregation"
      (mt/dataset geographical-tips
        (is (= [["jane"           4]
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
               (mt/formatted-rows [identity int]
                 (mt/run-mbql-query tips
                   {:aggregation [[:count]]
                    :breakout    [$tips.source.mayor]
                    :order-by    [[:asc [:aggregation 0]]]}))))))))

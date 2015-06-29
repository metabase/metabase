(ns metabase.test.data.dataset-definitions
  "Definitions of various datasets for use in tests with `with-temp-db`."
  (:require [clojure.tools.reader.edn :as edn]
            [metabase.test.data.interface :refer [def-database-definition]]))

;; ## Helper Functions

(defn- unix-timestamp-ms
  "Create a Unix timestamp (in milliseconds).

     (unix-timestamp-ms :year 2012 :month 12 :date 27)"
  ^Long [& {:keys [year month date hour minute second nano]
            :or   {year 0, month 1, date 1, hour 0, minute 0, second 0, nano 0}}]
  (-> (java.sql.Timestamp. (- year 1900) (- month 1) date hour minute second nano)
      .getTime
      long)) ; coerce to long since Korma doesn't know how to insert bigints


(defn- unix-timestamp
  "Create a Unix timestamp, in seconds."
  ^Long [& args]
  (/ (apply unix-timestamp-ms args) 1000))


;; ## Datasets

(def ^:private ^:const edn-definitions-dir "./test/metabase/test/data/dataset_definitions/")

;; TODO - move this to interface
;; TODO - make rows be lazily loadable for DB definitions from a file
(defmacro ^:private def-database-definition-edn [dbname]
  `(def-database-definition ~dbname
     ~@(edn/read-string (slurp (str edn-definitions-dir (name dbname) ".edn")))))

;; Times when the Toucan cried
(def-database-definition-edn sad-toucan-incidents)

;; Places, times, and circumstances where Tupac was sighted
(def-database-definition-edn tupac-sightings)

(def-database-definition-edn geographical-tips)


(defn random-venue []
  (let [cat-1 (rand-nth ["Paleo" "Free-Range" "Chinese" "Gluten-Free" "Mexican" "Afgan" "American" "BBQ" "Taquería" "Pizza" "Irish" "Low-Carb" "Gormet" "Red White & Blue"
                         "Japanese" "Korean" "Cage-Free" "GMO-Free" "No-MSG" "Deep-Dish" "Soul Food" "British" "European" "Homestyle" "Old-Fashioned" "Modern"])
        cat-2 (rand-nth ["Bakery" "Restaurant" "Café" "Gastro Pub" "Eatery" "Pizzeria" "Taqueria" "Bar & Grill" "Coffee House" "Cupcakes" "Sushi" "Liquor Store"
                         "Grill" "Diner" "Hotel & Restaurant" "Food Truck" "Pop-Up Food Stand" "Churros" "Ice Cream Truck"])]
    {:name (str (rand-nth ["Cam's" "Rasta's" "Joe's" "Kyle's" "Sameer's" "Lucky's" "SF" "Alcatraz" "Oakland" "Mission" "Chinatown" "Pacific Heights" "Nob Hill" "Marina"
                           "Lower Pac Heights" "Polk St." "Sunset" "Tenderloin" "SoMa" "Market St." "Haight"])
                " " cat-1 " " cat-2)
     :categories [cat-1 cat-2]
     :phone (str "415-" (apply str (repeatedly 3 #(rand-int 10))) "-" (apply str (repeatedly 4 #(rand-int 10))))
     :id    (str (java.util.UUID/randomUUID))}))

(def venues (repeatedly 100 random-venue))

(defn random-source [venue]
  (let [username (rand-nth ["cam_saul" "rasta_toucan" "lucky_pigeon" "sameer" "joe" "bob" "amy" "jane" "jessica" "mandy" "kyle" "tupac" "biggie"])]
    ((rand-nth [(fn []
                  {:service  "twitter"
                   :mentions [(str "@" (-> (:name venue)
                                           clojure.string/lower-case
                                           (clojure.string/replace #"\s|-" "_")
                                           (clojure.string/replace #"'" "")))]
                   :tags     (->> (:categories venue)
                                  (interpose " ")
                                  (apply str)
                                  (#(clojure.string/split % #" "))
                                  (map clojure.string/lower-case)
                                  (mapv (partial str "#")))
                   :username username})
                (fn []
                  {:service  "flare"
                   :username username})
                (fn []
                  {:service             "foursquare"
                   :foursquare-photo-id (str (java.util.UUID/randomUUID))
                   :mayor               username})
                (fn []
                  (let [fb-id (str (java.util.UUID/randomUUID))]
                    {:service           "facebook"
                     :facebook-photo-id fb-id
                     :url               (str "http://facebook.com/photos/" fb-id)}))
                (fn []
                  {:service       "yelp"
                   :yelp-photo-id (str (java.util.UUID/randomUUID))
                   :categories    (:categories venue)})]))))

(defn random-tip [venue]
  (let [adjectives ["great"
                    "decent"
                    "acceptable"
                    "fantastic"
                    "wonderful"
                    "amazing"
                    "delicious"
                    "atmospheric"
                    "family-friendly"
                    "exclusive"
                    "well-decorated"
                    "modern"
                    "classic"
                    "world-famous"
                    "popular"
                    "underappreciated"
                    "historical"
                    "swell"
                    "groovy"
                    "underground"
                    "horrible"
                    "overrated"]]
    (str (:name venue)
         " is a "
         (rand-nth adjectives)
         " and "
         (rand-nth adjectives)
         " "
         (if (= (rand-int 1) 0)
           "place"
           (rand-nth ["local landmark"
                      "tourist destination"
                      "hidden gem"
                      "traditional hippie hangout"
                      "hipster spot"]))
         " to "
         (rand-nth ["catch a bite to eat"
                    "have a after-work cocktail"
                    "conduct a business meeting"
                    "pitch an investor"
                    "have brunch"
                    "people-watch"
                    "take visiting friends and relatives"
                    "meet new friends"
                    "have a birthday party"
                    "have breakfast"
                    "take a date"
                    "nurse a hangover"
                    "have a drink"
                    "drink a craft beer"
                    "sip a glass of expensive wine"
                    "sip Champagne"
                    "watch the Giants game"
                    "watch the Warriors game"])
         " "
         (rand-nth ["with friends"
                    "on a Tuesday afternoon"
                    "weekend mornings"
                    "weekday afternoons"
                    "weekend evenings"
                    "on Taco Tuesday"
                    "Friday nights"
                    "the first Sunday of the month"
                    "the second Saturday of the month"
                    "during summer"
                    "during winter"
                    "in July"
                    "in June"
                    "after baseball games"
                    "when hungover"
                    "in the spring"
                    "in the fall"
                    "with your pet dog"
                    "with your pet toucan"
                    "on Thursdays"
                    "on Saturday night"
                    "on public holidays"
                    ])
         ".")))

(defn random-photo []
  (let [url   (str "http://cloudfront.net/" (java.util.UUID/randomUUID) "/%s.jpg")
        venue (rand-nth venues)]
    [(random-tip venue)
     {:small  (format url "small")
              :medium (format url "med")
      :large  (format url "large")}
     (-> venue
         (dissoc :cat-1 :cat-2))
     (random-source venue)]))

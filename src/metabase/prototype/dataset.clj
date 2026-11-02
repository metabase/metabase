(ns metabase.prototype.dataset
  "The prototype dataset: table definitions and deterministic row generators.

  Each table has a fixed random seed, so every run makes the same rows. When you change a definition or a
  generator, increment [[version]] so that existing instances seed the data again on their next start."
  (:require
   [clojure.string :as str]
   [metabase.prototype.reference-data :as ref]
   [metabase.util :as u]
   [metabase.util.json :as json])
  (:import
   (java.time LocalDate LocalDateTime LocalTime OffsetDateTime ZoneOffset)
   (java.util Random UUID)))

(set! *warn-on-reflection* true)

(def version
  "Version of the dataset. Increment it to make existing instances seed the data again."
  1)

(def schema-name
  "Postgres schema that holds the dataset."
  "prototype_data")

;;; ------------------------------------------------ Random helpers -------------------------------------------------

(defn- rng ^Random [seed] (Random. (long seed)))

(defn- rand-int-between
  "Random integer in `[lo, hi]`."
  [^Random r lo hi]
  (+ (long lo) (long (.nextInt r (int (inc (- (long hi) (long lo))))))))

(defn- rand-double-between [^Random r lo hi]
  (+ (double lo) (* (.nextDouble r) (- (double hi) (double lo)))))

(defn- chance? [^Random r p]
  (< (.nextDouble r) (double p)))

(defn- pick [^Random r coll]
  (nth coll (.nextInt r (count coll))))

(defn- pick-n
  "`n` distinct random elements of `coll`."
  [^Random r coll n]
  (loop [acc (sorted-set), tries 0]
    (if (or (= (count acc) n) (> tries 100))
      (mapv #(nth coll %) acc)
      (recur (conj acc (.nextInt r (count coll))) (inc tries)))))

(defn- pick-weighted
  "Pick from `entries`, where `(weight-fn entry)` is the relative weight of each entry."
  [^Random r entries weight-fn]
  (let [total (reduce + (map weight-fn entries))
        roll  (* (.nextDouble r) total)]
    (loop [[e & more] entries, acc 0.0]
      (let [acc (+ acc (double (weight-fn e)))]
        (if (or (< roll acc) (empty? more)) e (recur more acc))))))

(defn- gaussian ^double [^Random r mean sd]
  (+ (double mean) (* (.nextGaussian r) (double sd))))

(defn- clamp [lo hi x]
  (max lo (min hi x)))

(defn- round-to [places x]
  (let [m (Math/pow 10 places)]
    (/ (Math/round (* (double x) m)) m)))

(defn- jitter
  "Move a coordinate by up to `amount` degrees."
  [^Random r coordinate amount]
  (round-to 6 (+ (double coordinate) (rand-double-between r (- amount) amount))))

(defn- uuid [^Random r]
  (UUID. (.nextLong r) (.nextLong r)))

(defn- words [^Random r n]
  (str/join " " (repeatedly n #(pick r ref/lorem-words))))

(defn- sentence [^Random r lo hi]
  (let [s (words r (rand-int-between r lo hi))]
    (str (u/upper-case-en (subs s 0 1)) (subs s 1) ".")))

(defn- pg-array
  "Postgres array literal for a collection of strings, e.g. `{\"a\",\"b\"}`."
  [coll]
  (str "{" (str/join "," (map #(str "\"" (str/replace % "\"" "\\\"") "\"") coll)) "}"))

;;; ------------------------------------------------- Time helpers --------------------------------------------------

(def ^:private start-epoch-second
  (.toEpochSecond (OffsetDateTime/of 2023 1 1 0 0 0 0 ZoneOffset/UTC)))

(def ^:private end-epoch-second
  (.toEpochSecond (OffsetDateTime/of 2026 9 30 23 59 59 0 ZoneOffset/UTC)))

(defn- epoch-second->odt ^OffsetDateTime [s]
  (OffsetDateTime/ofInstant (java.time.Instant/ofEpochSecond (long s)) ZoneOffset/UTC))

(defn- rand-epoch-second
  "Random epoch second in the dataset time range. With `skew`, recent dates are more frequent, which looks like a
  growing business."
  ([r] (rand-epoch-second r 1.0))
  ([^Random r skew]
   (let [u (Math/pow (.nextDouble r) (/ 1.0 (double skew)))]
     (+ start-epoch-second (long (* u (- end-epoch-second start-epoch-second)))))))

(defn- rand-odt
  (^OffsetDateTime [r] (epoch-second->odt (rand-epoch-second r)))
  (^OffsetDateTime [r skew] (epoch-second->odt (rand-epoch-second r skew))))

(defn- odt-after
  "Random timestamp between `odt` and `max-hours` hours later, clamped to the dataset range."
  ^OffsetDateTime [^Random r ^OffsetDateTime odt max-hours]
  (let [s (+ (.toEpochSecond odt) (long (* (.nextDouble r) (double max-hours) 3600)))]
    (epoch-second->odt (min s end-epoch-second))))

(defn- rand-local-date ^LocalDate [^Random r year-lo year-hi]
  (LocalDate/of (int (rand-int-between r year-lo year-hi))
                (int (rand-int-between r 1 12))
                (int (rand-int-between r 1 28))))

(defn- odt->ldt ^LocalDateTime [^OffsetDateTime odt]
  (.toLocalDateTime odt))

(defn- odt->local-date ^LocalDate [^OffsetDateTime odt]
  (.toLocalDate odt))

(defn- odt->local-time ^LocalTime [^OffsetDateTime odt]
  (.toLocalTime odt))

(defn- hours-between
  "Hours from `from` to `to`, to one decimal place."
  [^OffsetDateTime from ^OffsetDateTime to]
  (round-to 1 (/ (- (.toEpochSecond to) (.toEpochSecond from)) 3600.0)))

;;; ------------------------------------------------ Shared lookups -------------------------------------------------

(defn- weighted-us-city [r] (pick-weighted r ref/us-cities #(nth % 5)))
(defn- weighted-world-city [r] (pick-weighted r ref/world-cities #(nth % 4)))

(defn- location
  "Random location map. `us-share` is the probability that the location is in the US."
  [^Random r us-share]
  (if (chance? r us-share)
    (let [[city state lat lon zip-prefix] (weighted-us-city r)]
      {:city city, :state state, :country "US"
       :zip (format "%s%02d" zip-prefix (rand-int-between r 1 99))
       :latitude (jitter r lat 0.08), :longitude (jitter r lon 0.08)})
    (let [[city country lat lon] (weighted-world-city r)]
      {:city city, :state nil, :country country
       :zip (format "%s-%04d" country (rand-int-between r 1000 9999))
       :latitude (jitter r lat 0.08), :longitude (jitter r lon 0.08)})))

(defn- street-address [^Random r]
  (format "%d %s %s" (rand-int-between r 1 9999)
          (pick r ["Oak" "Maple" "Pine" "Cedar" "Elm" "Main" "Park" "Lake" "Hill" "River" "Sunset" "Market"])
          (pick r ["St" "Ave" "Blvd" "Rd" "Ln" "Way" "Dr" "Ct"])))

(defn- slug [s]
  (-> (u/lower-case-en s)
      (str/replace #"[^a-z0-9]+" "-")
      (str/replace #"(^-|-$)" "")))

;;; ------------------------------------------------ Table definitions ----------------------------------------------
;;;
;;; Each column is `[name postgres-type semantic-type]`. A nil semantic type means the column has no semantic type.
;;; Metabase applies these semantic types after sync, so sync inference cannot change them.

(defn- countries-rows [_ctx]
  (let [r (rng 101)]
    (map-indexed
     (fn [i [code nm continent pop-m gdp area capital lat lon independence languages eu?]]
       {:id                 (inc i)
        :code               code
        :name               nm
        :continent          continent
        :population         (long (* pop-m 1000000))
        :gdp_usd_billions   gdp
        :gdp_per_capita     (round-to 2 (/ (* gdp 1000.0) pop-m))
        :area_km2           (long (* area 1000))
        :capital            capital
        :capital_latitude   lat
        :capital_longitude  lon
        :independence_date  (some-> independence LocalDate/parse)
        :languages          (pg-array languages)
        :is_eu_member       eu?
        :happiness_score    (round-to 2 (clamp 3.0 8.0 (gaussian r 6.0 0.9)))
        :internet_penetration (round-to 3 (clamp 0.3 0.99 (gaussian r 0.8 0.15)))
        :flag_url           (str "https://flagcdn.com/w80/" (u/lower-case-en code) ".png")
        :wikipedia_url      (str "https://en.wikipedia.org/wiki/" (str/replace nm " " "_"))})
     ref/countries)))

(defn- us-states-rows [_ctx]
  (let [r (rng 102)]
    (map-indexed
     (fn [i [code nm region capital lat lon pop-m area statehood income]]
       {:id                    (inc i)
        :code                  code
        :name                  nm
        :region                region
        :capital               capital
        :capital_latitude      lat
        :capital_longitude     lon
        :population            (long (* pop-m 1000000))
        :area_sq_mi            (long (* area 1000))
        :statehood_date        (LocalDate/of (int statehood) (int (rand-int-between r 1 12)) (int (rand-int-between r 1 28)))
        :median_household_income income
        :unemployment_rate     (round-to 3 (clamp 0.02 0.07 (gaussian r 0.038 0.008)))
        :sales_tax_rate        (round-to 4 (clamp 0.0 0.0725 (gaussian r 0.05 0.015)))})
     ref/us-states)))

(defn- stores-rows [_ctx]
  (let [r (rng 103)]
    (for [i (range 300)
          :let [{:keys [city state country zip latitude longitude]} (location r 0.7)
                store-type (pick r ref/store-types)
                opened     (rand-local-date r 2005 2025)
                closed?    (chance? r 0.08)
                open-hour  (rand-int-between r 7 10)]]
      {:id              (inc i)
       :name            (format "%s %s" city store-type)
       :store_type      store-type
       :address         (street-address r)
       :city            city
       :state           state
       :country         country
       :zip             zip
       :latitude        latitude
       :longitude       longitude
       :opened_on       opened
       :closed_on       (when closed? (.plusDays opened (rand-int-between r 200 3000)))
       :square_feet     (rand-int-between r 800 45000)
       :monthly_rent    (round-to 2 (rand-double-between r 2500 85000))
       :employee_count  (rand-int-between r 3 140)
       :manager_email   (format "manager.%d@stores.example.com" (inc i))
       :phone           (format "+1-%03d-%03d-%04d" (rand-int-between r 200 989) (rand-int-between r 200 999) (rand-int-between r 0 9999))
       :website_url     (format "https://stores.example.com/%s-%d" (slug city) (inc i))
       :rating          (round-to 1 (clamp 1.0 5.0 (gaussian r 4.0 0.6)))
       :is_open         (not closed?)
       :opening_time    (LocalTime/of (int open-hour) (int (pick r [0 30])))
       :closing_time    (LocalTime/of (int (rand-int-between r 18 23)) (int (pick r [0 30])))})))

(defn- products-rows [_ctx]
  (let [r          (rng 104)
        categories (vec (sort (keys ref/product-categories)))]
    (for [i (range 1000)
          :let [category    (pick r categories)
                subcategory (pick r (get ref/product-categories category))
                material    (pick r ref/product-materials)
                title       (format "%s %s %s" (pick r ref/product-adjectives) material
                                    (str/replace subcategory #"s$" ""))
                price       (round-to 2 (clamp 1.99 2499.0 (Math/exp (gaussian r 3.6 1.0))))
                cost        (round-to 2 (* price (rand-double-between r 0.3 0.8)))
                created     (rand-odt r 0.7)
                discontinued? (chance? r 0.06)]]
      {:id               (inc i)
       :sku              (uuid r)
       :ean              (format "%013d" (Math/abs (.nextLong r)))
       :title            title
       :category         category
       :subcategory      subcategory
       :brand            (pick r ref/brands)
       :price            price
       :cost             cost
       :gross_margin     (round-to 2 (- price cost))
       :discount_rate    (if (chance? r 0.3) (pick r [0.05 0.1 0.15 0.2 0.25 0.3 0.5]) 0.0)
       :rating           (round-to 1 (clamp 1.0 5.0 (gaussian r 3.9 0.7)))
       :review_count     (long (clamp 0 5000 (Math/exp (gaussian r 3.5 1.3))))
       :stock_quantity   (if (chance? r 0.08) 0 (rand-int-between r 1 900))
       :weight_kg        (round-to 3 (clamp 0.05 60.0 (Math/exp (gaussian r 0.2 1.1))))
       :color            (pick r ref/colors)
       :image_url        (format "https://picsum.photos/seed/product-%d/200/200" (inc i))
       :product_url      (format "https://shop.example.com/products/%s-%d" (slug title) (inc i))
       :description      (sentence r 12 30)
       :tags             (pg-array (pick-n r ref/tags (rand-int-between r 0 4)))
       :attributes       (json/encode {:material       material
                                       :color          (pick r ref/colors)
                                       :warranty_years (rand-int-between r 0 5)
                                       :dimensions_cm  {:w (rand-int-between r 5 200)
                                                        :h (rand-int-between r 5 200)
                                                        :d (rand-int-between r 5 200)}
                                       :recyclable     (chance? r 0.4)})
       :is_featured      (chance? r 0.1)
       :created_at       created
       :updated_at       (odt-after r created (* 24 365))
       :discontinued_at  (when discontinued? (odt-after r created (* 24 700)))})))

(defn- customers-rows [_ctx]
  (let [r (rng 105)]
    (for [i (range 5000)
          :let [first-name (pick r ref/first-names)
                last-name  (pick r ref/last-names)
                loc        (location r 0.72)
                signup     (rand-odt r 1.6)
                plan       (first (pick-weighted r ref/plans second))
                churned?   (chance? r 0.15)
                churned-at (when churned? (odt-after r signup (* 24 500)))
                email-name (slug (str first-name "." last-name))]]
      {:id                 (inc i)
       :uuid               (uuid r)
       :full_name          (str first-name " " last-name)
       :email              (format "%s%d@%s" email-name (rand-int-between r 1 999) (pick r ref/email-domains))
       :avatar_url         (format "https://i.pravatar.cc/150?u=prototype-%d" (inc i))
       :website            (when (chance? r 0.2) (format "https://%s.example.com" email-name))
       :phone              (format "+%d %03d %03d %04d" (rand-int-between r 1 99) (rand-int-between r 100 999)
                                   (rand-int-between r 100 999) (rand-int-between r 0 9999))
       :birth_date         (rand-local-date r 1950 2006)
       :address            (street-address r)
       :city               (:city loc)
       :state              (:state loc)
       :country            (:country loc)
       :zip                (:zip loc)
       :latitude           (:latitude loc)
       :longitude          (:longitude loc)
       :plan               plan
       :status             (cond churned?            "churned"
                                 (chance? r 0.05)    "suspended"
                                 (chance? r 0.1)     "trial"
                                 :else               "active")
       :source             (pick r ref/acquisition-sources)
       :lifetime_value     (round-to 2 (clamp 0.0 50000.0 (Math/exp (gaussian r 5.5 1.4))))
       :satisfaction_score (rand-int-between r 0 100)
       :nps_score          (rand-int-between r 0 10)
       :ip_address         (format "%d.%d.%d.%d" (rand-int-between r 11 223) (rand-int-between r 0 255)
                                   (rand-int-between r 0 255) (rand-int-between r 1 254))
       :is_verified        (chance? r 0.8)
       :marketing_opt_in   (chance? r 0.45)
       :preferences        (json/encode {:newsletter (chance? r 0.5)
                                         :theme      (pick r ["light" "dark" "system"])
                                         :language   (pick r ["en" "es" "fr" "de" "uk" "ja" "pt"])
                                         :interests  (pick-n r (vec (keys ref/product-categories)) (rand-int-between r 0 3))})
       :notes              (when (chance? r 0.1) (sentence r 6 20))
       :signed_up_at       signup
       :last_seen_at       (odt-after r signup (* 24 900))
       :churned_at         churned-at})))

(defn- orders-rows [{:keys [products customers stores]}]
  (let [r            (rng 106)
        open-stores  (filterv :is_open stores)]
    (for [i (range 100000)
          :let [customer  (pick r customers)
                product   (pick r products)
                channel   (pick-weighted r [["Online" 45] ["Mobile App" 25] ["In Store" 22] ["Phone" 3] ["Marketplace" 5]] second)
                channel   (first channel)
                store     (when (= channel "In Store") (pick r open-stores))
                quantity  (long (clamp 1 12 (Math/round (Math/abs (gaussian r 1.5 1.6)))))
                unit      (:price product)
                subtotal  (round-to 2 (* unit quantity))
                discount  (if (chance? r 0.25) (round-to 2 (* subtotal (pick r [0.05 0.1 0.15 0.2]))) 0.0)
                tax       (round-to 2 (* (- subtotal discount) 0.07))
                ordered   (rand-odt r 1.5)
                status    (first (pick-weighted r [["delivered" 70] ["shipped" 8] ["processing" 5] ["pending" 4]
                                                   ["cancelled" 8] ["returned" 5]] second))
                shipped?  (contains? #{"delivered" "shipped" "returned"} status)
                shipped   (when shipped? (odt-after r ordered 72))
                delivered (when (contains? #{"delivered" "returned"} status) (odt-after r shipped 240))
                loc       (if store store customer)]]
      {:id                 (inc i)
       :customer_id        (:id customer)
       :product_id         (:id product)
       :store_id           (:id store)
       :channel            channel
       :status             status
       :quantity           quantity
       :unit_price         unit
       :subtotal           subtotal
       :discount           discount
       :tax                tax
       :total              (round-to 2 (+ (- subtotal discount) tax))
       :discount_rate      (if (pos? subtotal) (round-to 4 (/ discount subtotal)) 0.0)
       :ordered_at         ordered
       :shipped_on         (some-> shipped odt->local-date)
       :delivered_at       (some-> delivered odt->ldt)
       :delivery_hours     (when delivered (hours-between ordered delivered))
       :shipping_city      (:city loc)
       :shipping_state     (:state loc)
       :shipping_country   (:country loc)
       :shipping_zip       (:zip loc)
       :shipping_latitude  (:latitude loc)
       :shipping_longitude (:longitude loc)
       :coupon_code        (when (pos? discount) (pick r ["WELCOME10" "SPRING15" "VIP20" "BLACKFRIDAY" "FREESHIP" "SAVE5"]))
       :is_gift            (chance? r 0.07)
       :gift_message       (when (chance? r 0.03) (sentence r 4 12))})))

(defn- web-events-rows [{:keys [customers]}]
  (let [r (rng 107)]
    (for [_ (range 150000)
          :let [customer   (when (chance? r 0.6) (pick r customers))
                event-type (first (pick-weighted r ref/event-types second))
                occurred   (rand-odt r 2.0)
                loc        (if customer customer (location r 0.6))
                path       (pick r ref/site-paths)]]
      {:id           (uuid r)
       :customer_id  (:id customer)
       :session_id   (uuid r)
       :event_type   event-type
       :page_url     (str "https://shop.example.com" path)
       :referrer_url (pick r ref/referrers)
       :occurred_at  occurred
       :local_time   (odt->local-time occurred)
       :duration_ms  (long (clamp 5 600000 (Math/exp (gaussian r 8.5 1.6))))
       :device       (first (pick-weighted r ref/devices second))
       :browser      (first (pick-weighted r ref/browsers second))
       :os           (first (pick-weighted r ref/operating-systems second))
       :ip_address   (format "%d.%d.%d.%d" (rand-int-between r 11 223) (rand-int-between r 0 255)
                             (rand-int-between r 0 255) (rand-int-between r 1 254))
       :city         (:city loc)
       :country      (:country loc)
       :latitude     (:latitude loc)
       :longitude    (:longitude loc)
       :revenue      (when (= event-type "purchase") (round-to 2 (clamp 5.0 3000.0 (Math/exp (gaussian r 4.3 0.9)))))
       :is_bot       (chance? r 0.03)
       :properties   (json/encode (cond-> {:utm_source (pick r ["google" "facebook" "newsletter" "direct" "tiktok"])
                                           :experiment (pick r ["control" "variant_a" "variant_b"])}
                                    (= event-type "search")      (assoc :query (words r (rand-int-between r 1 3)))
                                    (= event-type "add_to_cart") (assoc :cart_size (rand-int-between r 1 8))))})))

(defn- reviews-rows [{:keys [products customers]}]
  (let [r (rng 108)]
    (for [i (range 25000)
          :let [product (pick r products)
                rating  (long (clamp 1 5 (Math/round (gaussian r (:rating product) 1.0))))]]
      {:id                (inc i)
       :product_id        (:id product)
       :customer_id       (:id (pick r customers))
       :rating            rating
       :title             (pick r (case (long rating)
                                    5 ["Love it!" "Perfect" "Exceeded expectations" "Best purchase this year"]
                                    4 ["Very good" "Happy with it" "Solid choice" "Would buy again"]
                                    3 ["It's okay" "Average" "Does the job" "Mixed feelings"]
                                    2 ["Not great" "Disappointed" "Expected more" "Meh"]
                                    1 ["Terrible" "Broke quickly" "Do not buy" "Waste of money"]))
       :body              (sentence r 10 45)
       :sentiment         (round-to 3 (clamp -1.0 1.0 (gaussian r (/ (- rating 3) 2.0) 0.25)))
       :helpful_votes     (long (clamp 0 900 (Math/exp (gaussian r 1.0 1.4))))
       :verified_purchase (chance? r 0.75)
       :photo_url         (when (chance? r 0.12) (format "https://picsum.photos/seed/review-%d/300/200" (inc i)))
       :created_at        (rand-odt r 1.5)})))

(defn- support-tickets-rows [{:keys [customers]}]
  (let [r (rng 109)]
    (for [i (range 15000)
          :let [opened    (rand-odt r 1.8)
                status    (first (pick-weighted r [["open" 10] ["in_progress" 10] ["waiting_on_customer" 8]
                                                   ["resolved" 62] ["closed" 10]] second))
                resolved? (contains? #{"resolved" "closed"} status)
                resolved  (when resolved? (odt-after r opened (* 24 14)))]]
      {:id               (inc i)
       :customer_id      (:id (pick r customers))
       :subject          (pick r ref/ticket-subjects)
       :body             (sentence r 15 60)
       :priority         (first (pick-weighted r [["low" 35] ["medium" 40] ["high" 18] ["urgent" 7]] second))
       :status           status
       :channel          (pick r ["Email" "Chat" "Phone" "Twitter" "Help Center"])
       :assignee         (when-not (= status "open") (pick r ref/support-agents))
       :tags             (pg-array (pick-n r ["billing" "shipping" "returns" "account" "bug" "feature-request" "vip"]
                                           (rand-int-between r 0 3)))
       :csat_score       (when resolved? (rand-int-between r 1 5))
       :first_response_minutes (rand-int-between r 1 2880)
       :resolution_hours (when resolved (hours-between opened resolved))
       :created_at       opened
       :resolved_at      resolved})))

(def tables
  "Table definitions in insert order. `:slow?` marks the tables whose queries Metabase delays on purpose."
  [{:name        "countries"
    :display-name "Countries"
    :description "Countries of the world, one row per country."
    :slow?       false
    :rows        countries-rows
    :columns     [[:id "integer" :type/PK]
                  [:code "char(2)" :type/Country]
                  [:name "text" :type/Name]
                  [:continent "text" :type/Category]
                  [:population "bigint" :type/Quantity]
                  [:gdp_usd_billions "numeric(12,2)" :type/Currency]
                  [:gdp_per_capita "numeric(12,2)" :type/Currency]
                  [:area_km2 "bigint" nil]
                  [:capital "text" :type/City]
                  [:capital_latitude "double precision" :type/Latitude]
                  [:capital_longitude "double precision" :type/Longitude]
                  [:independence_date "date" nil]
                  [:languages "text[]" nil]
                  [:is_eu_member "boolean" nil]
                  [:happiness_score "numeric(4,2)" :type/Score]
                  [:internet_penetration "numeric(5,3)" :type/Percentage]
                  [:flag_url "text" :type/ImageURL]
                  [:wikipedia_url "text" :type/URL]]}
   {:name        "us_states"
    :display-name "US States"
    :description "US states, one row per state."
    :slow?       false
    :rows        us-states-rows
    :columns     [[:id "integer" :type/PK]
                  [:code "char(2)" :type/State]
                  [:name "text" :type/Name]
                  [:region "text" :type/Category]
                  [:capital "text" :type/City]
                  [:capital_latitude "double precision" :type/Latitude]
                  [:capital_longitude "double precision" :type/Longitude]
                  [:population "bigint" :type/Quantity]
                  [:area_sq_mi "bigint" nil]
                  [:statehood_date "date" nil]
                  [:median_household_income "integer" :type/Income]
                  [:unemployment_rate "numeric(5,3)" :type/Percentage]
                  [:sales_tax_rate "numeric(6,4)" :type/Percentage]]}
   {:name        "stores"
    :display-name "Stores"
    :description "Physical stores, in the US and abroad."
    :slow?       false
    :rows        stores-rows
    :columns     [[:id "integer" :type/PK]
                  [:name "text" :type/Name]
                  [:store_type "text" :type/Category]
                  [:address "text" nil]
                  [:city "text" :type/City]
                  [:state "char(2)" :type/State]
                  [:country "char(2)" :type/Country]
                  [:zip "text" :type/ZipCode]
                  [:latitude "double precision" :type/Latitude]
                  [:longitude "double precision" :type/Longitude]
                  [:opened_on "date" :type/CreationDate]
                  [:closed_on "date" :type/CancelationDate]
                  [:square_feet "integer" :type/Quantity]
                  [:monthly_rent "numeric(10,2)" :type/Cost]
                  [:employee_count "integer" :type/Quantity]
                  [:manager_email "text" :type/Email]
                  [:phone "text" nil]
                  [:website_url "text" :type/URL]
                  [:rating "numeric(2,1)" :type/Score]
                  [:is_open "boolean" nil]
                  [:opening_time "time" nil]
                  [:closing_time "time" nil]]}
   {:name        "products"
    :display-name "Products"
    :description "Product catalog."
    :slow?       false
    :rows        products-rows
    :columns     [[:id "integer" :type/PK]
                  [:sku "uuid" nil]
                  [:ean "text" nil]
                  [:title "text" :type/Title]
                  [:category "text" :type/Category]
                  [:subcategory "text" :type/Category]
                  [:brand "text" :type/Company]
                  [:price "numeric(10,2)" :type/Price]
                  [:cost "numeric(10,2)" :type/Cost]
                  [:gross_margin "numeric(10,2)" :type/GrossMargin]
                  [:discount_rate "numeric(4,2)" :type/Percentage]
                  [:rating "numeric(2,1)" :type/Score]
                  [:review_count "integer" :type/Quantity]
                  [:stock_quantity "integer" :type/Quantity]
                  [:weight_kg "double precision" nil]
                  [:color "text" :type/Category]
                  [:image_url "text" :type/ImageURL]
                  [:product_url "text" :type/URL]
                  [:description "text" :type/Description]
                  [:tags "text[]" nil]
                  [:attributes "jsonb" nil]
                  [:is_featured "boolean" nil]
                  [:created_at "timestamptz" :type/CreationTimestamp]
                  [:updated_at "timestamptz" :type/UpdatedTimestamp]
                  [:discontinued_at "timestamptz" :type/DeletionTimestamp]]}
   {:name        "customers"
    :display-name "Customers"
    :description "Customers of the shop."
    :slow?       false
    :rows        customers-rows
    :columns     [[:id "integer" :type/PK]
                  [:uuid "uuid" nil]
                  [:full_name "text" :type/Name]
                  [:email "text" :type/Email]
                  [:avatar_url "text" :type/AvatarURL]
                  [:website "text" :type/URL]
                  [:phone "text" nil]
                  [:birth_date "date" :type/Birthdate]
                  [:address "text" nil]
                  [:city "text" :type/City]
                  [:state "char(2)" :type/State]
                  [:country "char(2)" :type/Country]
                  [:zip "text" :type/ZipCode]
                  [:latitude "double precision" :type/Latitude]
                  [:longitude "double precision" :type/Longitude]
                  [:plan "text" :type/Subscription]
                  [:status "prototype_data.customer_status" :type/Category]
                  [:source "text" :type/Source]
                  [:lifetime_value "numeric(10,2)" :type/Income]
                  [:satisfaction_score "integer" :type/Score]
                  [:nps_score "integer" :type/Score]
                  [:ip_address "inet" :type/IPAddress]
                  [:is_verified "boolean" nil]
                  [:marketing_opt_in "boolean" nil]
                  [:preferences "jsonb" nil]
                  [:notes "text" :type/Comment]
                  [:signed_up_at "timestamptz" :type/JoinTimestamp]
                  [:last_seen_at "timestamptz" nil]
                  [:churned_at "timestamptz" :type/CancelationTimestamp]]}
   {:name        "orders"
    :display-name "Orders"
    :description "Orders. A slow table: Metabase delays its queries on purpose."
    :slow?       true
    :rows        orders-rows
    :foreign-keys {:customer_id "customers", :product_id "products", :store_id "stores"}
    :columns     [[:id "integer" :type/PK]
                  [:customer_id "integer" :type/FK]
                  [:product_id "integer" :type/FK]
                  [:store_id "integer" :type/FK]
                  [:channel "text" :type/Category]
                  [:status "prototype_data.order_status" :type/Category]
                  [:quantity "integer" :type/Quantity]
                  [:unit_price "numeric(10,2)" :type/Price]
                  [:subtotal "numeric(12,2)" :type/Currency]
                  [:discount "numeric(12,2)" :type/Discount]
                  [:tax "numeric(12,2)" :type/Currency]
                  [:total "numeric(12,2)" :type/Currency]
                  [:discount_rate "numeric(5,4)" :type/Percentage]
                  [:ordered_at "timestamptz" :type/CreationTimestamp]
                  [:shipped_on "date" nil]
                  [:delivered_at "timestamp" nil]
                  [:delivery_hours "numeric(8,1)" :type/Duration]
                  [:shipping_city "text" :type/City]
                  [:shipping_state "char(2)" :type/State]
                  [:shipping_country "char(2)" :type/Country]
                  [:shipping_zip "text" :type/ZipCode]
                  [:shipping_latitude "double precision" :type/Latitude]
                  [:shipping_longitude "double precision" :type/Longitude]
                  [:coupon_code "text" :type/Category]
                  [:is_gift "boolean" nil]
                  [:gift_message "text" :type/Comment]]}
   {:name        "web_events"
    :display-name "Web Events"
    :description "Website and app analytics events. A slow table: Metabase delays its queries on purpose."
    :slow?       true
    :rows        web-events-rows
    :foreign-keys {:customer_id "customers"}
    :columns     [[:id "uuid" :type/PK]
                  [:customer_id "integer" :type/FK]
                  [:session_id "uuid" nil]
                  [:event_type "text" :type/Category]
                  [:page_url "text" :type/URL]
                  [:referrer_url "text" :type/URL]
                  [:occurred_at "timestamptz" :type/CreationTimestamp]
                  [:local_time "time" nil]
                  [:duration_ms "integer" :type/Duration]
                  [:device "text" :type/Category]
                  [:browser "text" :type/Category]
                  [:os "text" :type/Category]
                  [:ip_address "inet" :type/IPAddress]
                  [:city "text" :type/City]
                  [:country "char(2)" :type/Country]
                  [:latitude "double precision" :type/Latitude]
                  [:longitude "double precision" :type/Longitude]
                  [:revenue "numeric(10,2)" :type/Income]
                  [:is_bot "boolean" nil]
                  [:properties "jsonb" nil]]}
   {:name        "reviews"
    :display-name "Reviews"
    :description "Product reviews. A slow table: Metabase delays its queries on purpose."
    :slow?       true
    :rows        reviews-rows
    :foreign-keys {:product_id "products", :customer_id "customers"}
    :columns     [[:id "integer" :type/PK]
                  [:product_id "integer" :type/FK]
                  [:customer_id "integer" :type/FK]
                  [:rating "integer" :type/Score]
                  [:title "text" :type/Title]
                  [:body "text" :type/Comment]
                  [:sentiment "numeric(4,3)" :type/Score]
                  [:helpful_votes "integer" :type/Quantity]
                  [:verified_purchase "boolean" nil]
                  [:photo_url "text" :type/ImageURL]
                  [:created_at "timestamptz" :type/CreationTimestamp]]}
   {:name        "support_tickets"
    :display-name "Support Tickets"
    :description "Customer support tickets. A slow table: Metabase delays its queries on purpose."
    :slow?       true
    :rows        support-tickets-rows
    :foreign-keys {:customer_id "customers"}
    :columns     [[:id "integer" :type/PK]
                  [:customer_id "integer" :type/FK]
                  [:subject "text" :type/Title]
                  [:body "text" :type/Description]
                  [:priority "prototype_data.ticket_priority" :type/Category]
                  [:status "text" :type/Category]
                  [:channel "text" :type/Category]
                  [:assignee "text" :type/Owner]
                  [:tags "text[]" nil]
                  [:csat_score "integer" :type/Score]
                  [:first_response_minutes "integer" :type/Duration]
                  [:resolution_hours "numeric(8,1)" :type/Duration]
                  [:created_at "timestamptz" :type/CreationTimestamp]
                  [:resolved_at "timestamptz" nil]]}])

(def enum-types
  "Postgres enum types that the tables use, as `[type-name values]`."
  [["customer_status" ["trial" "active" "suspended" "churned"]]
   ["order_status" ["pending" "processing" "shipped" "delivered" "cancelled" "returned"]]
   ["ticket_priority" ["low" "medium" "high" "urgent"]]])

(defn table-display-name
  "Display name of `table` in Metabase, with a label that says whether it is slow or fast."
  [{:keys [display-name slow?]}]
  (str display-name (if slow? " (slow)" " (fast)")))

(def slow-table-names
  "Names of the tables whose queries Metabase delays on purpose."
  (into #{} (comp (filter :slow?) (map :name)) tables))

(def context-tables
  "Tables whose generated rows later generators need, e.g. `orders` picks from `products`."
  #{"stores" "products" "customers"})

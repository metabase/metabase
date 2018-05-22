(ns metabase.sample-dataset.generate
  "Logic for generating the sample dataset.
   Run this with `lein generate-sample-dataset`."
  (:require [clojure
             [edn :as edn]
             [string :as s]]
            [clojure.java
             [io :as io]
             [jdbc :as jdbc]]
            [clojure.math.numeric-tower :as math]
            [faker
             [company :as company]
             [internet :as internet]
             [lorem :as lorem]
             [name :as name]]
            [jdistlib.core :as dist]
            [medley.core :as m]
            [metabase.db.spec :as dbspec]
            [metabase.util :as u])
  (:import java.util.Date))

(def ^:private ^:const sample-dataset-filename
  (str (System/getProperty "user.dir") "/resources/sample-dataset.db"))

(def ^:private num-rows-to-create
  {:people   2500
   :products 200})

(def ^:private num-reviews-distribution
  "Normal distribution sampled to determine number of reviews each product should have. Actual average number of
  reviews will be slightly higher because negative values returned by the sample will be floored at 0 (e.g. a product
  cannot have less than 0 reviews)."
  (dist/normal 5 4))

(def ^:private num-orders-distibution
  "Normal distribution sampled to determine number of orders each person should have."
  (dist/normal 5 10))

;;; ## PEOPLE

(defn ^Date random-date-between [^Date min, ^Date max]
  (let [min-ms (.getTime min)
        max-ms (.getTime max)
        range  (- max-ms min-ms)
        d      (Date.)]
    (.setTime d (+ (long (rand range)) min-ms))
    d))

(def ^:private addresses (atom nil))

(defn- load-addresses! []
  (println "Loading addresses...")
  (reset! addresses (edn/read-string (slurp "sample_dataset/metabase/sample_dataset/addresses.edn")))
  :ok)

(defn- next-address []
  (when-not (seq @addresses)
    (load-addresses!))
  (let [address (first @addresses)]
    (swap! addresses rest)
    address))

(defn- random-person []
  (let [first (name/first-name)
        last  (name/last-name)
        addr  (next-address)]
    {:name       (format "%s %s" first last)
     :email      (internet/free-email (format "%s.%s" first last))
     :password   (str (java.util.UUID/randomUUID))
     :birth_date (random-date-between (u/relative-date :year -60) (u/relative-date :year -18))
     :address    (str (:house-number addr) " " (:street addr))
     :city       (:city addr)
     :zip        (:zip addr)
     :state      (:state-abbrev addr)
     :latitude   (:lat addr)
     :longitude  (:lon addr)
     :source     (rand-nth ["Google" "Twitter" "Facebook" "Organic" "Affiliate"])
     :created_at (random-date-between (u/relative-date :year -2) (u/relative-date :year 1))}))

;;; ## PRODUCTS

(defn- random-company-name []
  (first (company/names)))

(defn- rejection-sample
  "Sample from distribution `dist` until `pred` is truthy for the sampled value.
   https://en.wikipedia.org/wiki/Rejection_sampling"
  [pred dist]
  (let [x (dist/sample dist)]
    (if (pred x)
      x
      (rejection-sample pred dist))))

(defn- random-price [min max]
  (let [range    (- max min)
        mean1    (+ min (* range 0.3))
        mean2    (+ min (* range 0.75))
        variance (/ range 8)]
    ; Sample from a multi modal distribution (mix of two normal distributions
    ; with means `mean1` and `mean2` and variance `variance`).
    (rejection-sample #(<= min % max) (rand-nth [(dist/normal mean1 variance)
                                                 (dist/normal mean2 variance)]))))

(def ^:private ^:const product-names
  {:adjective '[Small, Ergonomic, Rustic, Intelligent, Gorgeous, Incredible, Fantastic, Practical, Sleek, Awesome,
                Enormous, Mediocre, Synergistic, Heavy-Duty, Lightweight, Aerodynamic, Durable]
   :material  '[Steel, Wooden, Concrete, Plastic, Cotton, Granite, Rubber, Leather, Silk, Wool, Linen, Marble, Iron,
                Bronze, Copper, Aluminum, Paper]
   :product   '[Chair, Car, Computer, Gloves, Pants, Shirt, Table, Shoes, Hat, Plate, Knife, Bottle, Coat, Lamp,
                Keyboard, Bag, Bench, Clock, Watch, Wallet, Toucan]})

(defn- random-product-name []
  (format "%s %s %s"
          (rand-nth (product-names :adjective))
          (rand-nth (product-names :material))
          (rand-nth (product-names :product))))

(def ^:private ean-checksum
  (let [^:const weights (flatten (repeat 6 [1 3]))]
    (fn [digits]
      {:pre [(= 12 (count digits))
             (= 12 (count (apply str digits)))]
       :post [(= 1 (count (str %)))]}
      (as-> (reduce + (map (fn [digit weight]
                             (* digit weight))
                           digits weights))
          it
        (mod it 10)
        (- 10 it)
        (mod it 10)))))

(defn- random-ean []
  {:post [(= (count %) 13)]}
  (let [digits (vec (repeatedly 12 #(rand-int 10)))]
    (->> (conj digits (ean-checksum digits))
         (apply str))))

(defn- random-product []
  {:ean        (random-ean)
   :title      (random-product-name)
   :category   (rand-nth ["Widget" "Gizmo" "Gadget" "Doohickey"])
   :vendor     (random-company-name)
   :price      (random-price 12 100)
   :created_at (random-date-between (u/relative-date :year -2) (u/relative-date :year 1))})


;;; ## ORDERS

(def ^:private state->tax-rate
  {"AK" 0.0
   "AL" 0.04
   "AR" 0.065
   "AZ" 0.056
   "CA" 0.075
   "CO" 0.029
   "CT" 0.0635
   "DC" 0.0575
   "DE" 0.0
   "FL" 0.06
   "GA" 0.04
   "HI" 0.04
   "IA" 0.06
   "ID" 0.06
   "IL" 0.0625
   "IN" 0.07
   "KS" 0.065
   "KY" 0.06
   "LA" 0.04
   "MA" 0.0625
   "MD" 0.06
   "ME" 0.055
   "MI" 0.06
   "MN" 0.06875
   "MO" 0.04225
   "MS" 0.07
   "MT" 0.0
   "NC" 0.0475
   "ND" 0.05
   "NE" 0.055
   "NH" 0.0
   "NJ" 0.07
   "NM" 0.05125
   "NV" 0.0685
   "NY" 0.04
   "OH" 0.0575
   "OK" 0.045
   "OR" 0.0
   "PA" 0.06
   "RI" 0.07
   "SC" 0.06
   "SD" 0.04
   "TN" 0.07
   "TX" 0.0625
   "UT" 0.047
   "VA" 0.043
   "VT" 0.06
   "WA" 0.065
   "WI" 0.05
   "WV" 0.06
   "WY" 0.04
   ;; Territories / Associated States / Armed Forces - just give these all zero
   ;; These might come back from address/us-state-abbr
   "AA" 0.0 ; Armed Forces - Americas
   "AE" 0.0 ; Armed Forces - Europe
   "AP" 0.0 ; Armed Forces - Pacific
   "AS" 0.0 ; American Samoa
   "FM" 0.0 ; Federated States of Micronesia
   "GU" 0.0 ; Guam
   "MH" 0.0 ; Marshall Islands
   "MP" 0.0 ; Northern Mariana Islands
   "PR" 0.0 ; Puerto Rico
   "PW" 0.0 ; Palau
   "VI" 0.0 ; Virgin Islands
   })

(defn- max-date [& dates]
  {:pre [(every? (partial instance? Date) dates)]
   :post [(instance? Date %)]}
  (doto (Date.)
    (.setTime (apply max (map #(.getTime ^Date %) dates)))))

(defn- min-date [& dates]
  {:pre [(every? (partial instance? Date) dates)]
   :post [(instance? Date %)]}
  (doto (Date.)
    (.setTime (apply min (map #(.getTime ^Date %) dates)))))

(defn- with-probability
  "Return `(f)` with probability `p`, else return nil."
  [p f]
  (when (> p (rand))
    (f)))

(defn random-order [{:keys [state], :as ^Person person} {:keys [price], :as product}]
  {:pre [(string? state)
         (number? price)]
   :post [(map? %)]}
  (let [tax-rate   (state->tax-rate state)
        _          (assert tax-rate
                     (format "No tax rate found for state '%s'." state))
        created-at (random-date-between (min-date (:created_at person)
                                                  (:created_at product))
                                        (u/relative-date :year 2))
        price      (if (> (.getTime created-at) (.getTime (Date. 118 0 1)))
                     (* 1.5 price)
                     price)
        tax        (u/round-to-decimals 2 (* price tax-rate))]
    {:user_id    (:id person)
     :product_id (:id product)
     :subtotal   price
     :tax        tax
     :quantity   (random-price 1 5)
     :discount   (with-probability 0.1 #(random-price 0 10))
     :total      (+ price tax)
     :created_at created-at}))


;;; ## REVIEWS

(defn random-review [product]
  {:product_id (:id product)
   :reviewer   (internet/user-name)
   :rating     (rand-nth [1 1
                          2 2 2
                          3 3
                          4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4
                          5 5 5 5 5 5 5 5 5 5 5 5 5])
   :body       (first (lorem/paragraphs))
   :created_at (random-date-between (:created_at product) (u/relative-date :year 2))})

(defn- add-ids [objs]
  (map-indexed
   (fn [id obj]
     (assoc obj :id (inc id)))
   objs))

(defn- create-randoms [n f]
  (-> (take n (distinct (repeatedly f)))
      add-ids))

(defn- product-add-reviews [product]
  (let [num-reviews (max 0 (dist/sample num-reviews-distribution)) ; with 200 products should give us ~1000 reviews
        reviews     (vec (for [review (repeatedly num-reviews #(random-review product))]
                           (assoc review :product_id (:id product))))
        rating      (if (seq reviews) (/ (reduce + (map :rating reviews))
                                         (count reviews))
                        0.0)]
    (assoc product :reviews reviews, :rating (-> (* rating 10.0)
                                                 int
                                                 (/ 10.0)))))

(defn- person-add-orders [products person]
  {:pre [(sequential? products)
         (map? person)]
   :post [(map? %)]}
  (let [num-orders (max 0 (dist/sample num-orders-distibution))] ; with 2500 people should give us ~15k orders
    (if (zero? num-orders)
      person
      (assoc person :orders (vec (repeatedly num-orders #(random-order person (rand-nth products))))))))

(defn- add-autocorrelation
  "Add autocorrelation with lag `lag` to field `k` by adding the value from `lag` steps back (and dividing by 2 to
  retain roughly the same value range). https://en.wikipedia.org/wiki/Autocorrelation"
  ([k xs] (add-autocorrelation 1 k xs))
  ([lag k xs]
   (map (fn [prev next]
          (update next k #(/ (+ % (k prev)) 2)))
        xs
        (drop lag xs))))

(defn- add-increasing-variance
  "Gradually increase variance of field `k` by scaling it an (on average) increasingly larger random noise.

   https://en.wikipedia.org/wiki/Variance"
  [k xs]
  (let [n (count xs)]
    (map-indexed (fn [i x]
                   ; Limit the noise to [0.1, 2.1].
                   (update x k * (+ 1 (* (/ i n) (- (* 2 (rand)) 0.9)))))
                 xs)))

(defn- add-seasonality
  "Add seasonal component to field `k`. Seasonal variation (a multiplicative factor) is described with map
  `seasonality-map` indexed into by `season-fn` (eg. month of year of field created_at)."
  [season-fn k seasonality-map xs]
  (for [x xs]
    (update x k * (seasonality-map (season-fn x)))))

(defn- add-outliers
  "Add `n` outliers (times `scale` value spikes) to field `k`. `n` can be either percentage or count, determined by
  `mode`."
  ([mode n k xs] (add-outliers mode n 10 k xs))
  ([mode n scale k xs]
   (if (= mode :share)
     (for [x xs]
       (if (< (rand) n)
         (update x k * scale)
         x))
     (let [candidate-idxs (keep (fn [[idx x]]
                                  (when (k x)
                                    idx))
                                (m/indexed xs))
           ; Note: since we are sampling with replacement there is a small chance
           ; single index gets chosen multiple times.
           outlier-idx? (set (repeatedly n #(rand-nth candidate-idxs)))]
       (for [[idx x] (m/indexed xs)]
         (if (outlier-idx? idx)
           (update x k * scale)
           x))))))

(defn create-random-data []
  {:post [(map? %)
          (= (count (:people %)) (:people num-rows-to-create))
          (= (count (:products %)) (:products num-rows-to-create))
          (every? keyword? (keys %))
          (every? sequential? (vals %))]}
  (let [{:keys [products people]} num-rows-to-create]
    (printf "Generating random data: %d people, %d products...\n" people products)
    (let [products (for [product (create-randoms products random-product)]
                     (product-add-reviews product))
          people   (vec (for [person (create-randoms people random-person)]
                          (person-add-orders products person)))]
      {:people   (map #(dissoc % :orders) people)
       :products (map #(dissoc % :reviews) products)
       :reviews  (mapcat :reviews products)
       :orders   (->> people
                      (mapcat :orders)
                      (add-autocorrelation :quantity)
                      (add-outliers :share 0.01 :quantity)
                      (add-outliers :count 5 :discount)
                      (add-increasing-variance :total)
                      (add-seasonality #(.getMonth ^java.util.Date (:created_at %))
                                       :quantity {0  0.6
                                                  1  0.5
                                                  2  0.3
                                                  3  0.9
                                                  4  1.3
                                                  5  1.9
                                                  6  1.5
                                                  7  2.1
                                                  8  1.5
                                                  9  1.7
                                                  10 0.9
                                                  11 0.6}))})))

;;; # LOADING THE DATA

(defn- create-table-sql [table-name field->type]
  {:pre [(keyword? table-name)
         (map? field->type)
         (every? keyword? (keys field->type))
         (every? string? (vals field->type))]
   :post [(string? %)]}
  (format "CREATE TABLE \"%s\" (\"ID\" BIGINT AUTO_INCREMENT, %s, PRIMARY KEY (\"ID\"));"
          (s/upper-case (name table-name))
          (apply str (->> (for [[field type] (seq field->type)]
                            (format "\"%s\" %s" (s/upper-case (name field)) type))
                          (interpose ", ")))))

(def ^:private ^:const tables
  {:people {:name       "VARCHAR(255)"
            :email      "VARCHAR(255)"
            :password   "VARCHAR(255)"
            :birth_date "DATE"
            :address    "VARCHAR(255)"
            :zip        "CHAR(5)"
            :city       "VARCHAR(255)"
            :state      "CHAR(2)"
            :latitude   "FLOAT"
            :longitude  "FLOAT"
            :source     "VARCHAR(255)"
            :created_at "DATETIME"}
   :products {:ean        "CHAR(13)"
              :title      "VARCHAR(255)"
              :category   "VARCHAR(255)"
              :vendor     "VARCHAR(255)"
              :price      "FLOAT"
              :rating     "FLOAT"
              :created_at "DATETIME"}
   :orders {:user_id    "INTEGER"
            :product_id "INTEGER"
            :subtotal   "FLOAT"
            :tax        "FLOAT"
            :total      "FLOAT"
            :discount   "FLOAT"
            :created_at "DATETIME"
            :quantity   "INTEGER"}
   :reviews {:product_id "INTEGER"
             :reviewer   "VARCHAR(255)"
             :rating     "SMALLINT"
             :body       "TEXT"
             :created_at "DATETIME"}})

(def ^:private ^:const fks
  [{:source-table "ORDERS"
    :field        "USER_ID"
    :dest-table   "PEOPLE"}
   {:source-table "ORDERS"
    :field        "PRODUCT_ID"
    :dest-table   "PRODUCTS"}
   {:source-table "REVIEWS"
    :field        "PRODUCT_ID"
    :dest-table   "PRODUCTS"}])

(def ^:private ^:const metabase-metadata
  {:orders   {:description "This is a confirmed order for a product from a user."
              :columns     {:created_at {:description "The date and time an order was submitted."}
                            :id         {:description "This is a unique ID for the product. It is also called the “Invoice number” or “Confirmation number” in customer facing emails and screens."}
                            :product_id {:description "The product ID. This is an internal identifier for the product, NOT the SKU."}
                            :subtotal   {:description "The raw, pre-tax cost of the order. Note that this might be different in the future from the product price due to promotions, credits, etc."}
                            :tax        {:description (str "This is the amount of local and federal taxes that are collected on the purchase. Note that other governmental fees "
                                                           "on some products are not included here, but instead are accounted for in the subtotal.")}
                            :total      {:description "The total billed amount."}
                            :user_id    {:description (str "The id of the user who made this order. Note that in some cases where an order was created on behalf "
                                                           "of a customer who phoned the order in, this might be the employee who handled the request.")}
                            :quantity   {:description "Number of products bought."}
                            :discount   {:description "Discount amount."}}}
   :people {:description "This is a user account. Note that employees and customer support staff will have accounts."
            :columns     {:address    {:description "The street address of the account’s billing address"}
                          :birth_date {:description "The date of birth of the user"}
                          :city       {:description "The city of the account’s billing address"}
                          :created_at {:description "The date the user record was created. Also referred to as the user’s \"join date\""}
                          :email      {:description "The contact email for the account."}
                          :id         {:description "A unique identifier given to each user."}
                          :latitude   {:description "This is the latitude of the user on sign-up. It might be updated in the future to the last seen location."}
                          :longitude  {:description "This is the longitude of the user on sign-up. It might be updated in the future to the last seen location."}
                          :name       {:description "The name of the user who owns an account"}
                          :password   {:description "This is the salted password of the user. It should not be visible"}
                          :source     {:description "The channel through which we acquired this user. Valid values include: Affiliate, Facebook, Google, Organic and Twitter"}
                          :state      {:description "The state or province of the account’s billing address"}
                          :zip        {:description  "The postal code of the account’s billing address"
                                       :special_type "type/ZipCode"}}}
   :products {:description "This is our product catalog. It includes all products ever sold by the Sample Company."
              :columns      {:category   {:description "The type of product, valid values include: Doohicky, Gadget, Gizmo and Widget"}
                             :created_at {:description "The date the product was added to our catalog."}
                             :ean        {:description "The international article number. A 13 digit number uniquely identifying the product."}
                             :id         {:description "The numerical product number. Only used internally. All external communication should use the title or EAN."}
                             :price      {:description "The list price of the product. Note that this is not always the price the product sold for due to discounts, promotions, etc."}
                             :rating     {:description "The average rating users have given the product. This ranges from 1 - 5"}
                             :title      {:description "The name of the product as it should be displayed to customers."}
                             :vendor     {:description "The source of the product."}}}
   :reviews  {:description "These are reviews our customers have left on products. Note that these are not tied to orders so it is possible people have reviewed products they did not purchase from us."
              :columns     {:body       {:description  "The review the user left. Limited to 2000 characters."
                                         :special_type "type/Description"}
                            :created_at {:description "The day and time a review was written by a user."}
                            :id         {:description "A unique internal identifier for the review. Should not be used externally."}
                            :product_id {:description "The product the review was for"}
                            :rating     {:description "The rating (on a scale of 1-5) the user left."}
                            :reviewer   {:description "The user who left the review"}}}})

(defn create-h2-db
  ([filename]
   (create-h2-db filename (create-random-data)))
  ([filename data]
   (println "Deleting existing db...")
   (io/delete-file (str filename ".mv.db") :silently)
   (io/delete-file (str filename ".trace.db") :silently)
   (println "Creating db...")
   (let [db (dbspec/h2 {:db (format (str "file:%s;UNDO_LOG=0;CACHE_SIZE=131072;QUERY_CACHE_SIZE=128;COMPRESS=TRUE;"
                                         "MULTI_THREADED=TRUE;MVCC=TRUE;DEFRAG_ALWAYS=TRUE;MAX_COMPACT_TIME=5000;"
                                         "ANALYZE_AUTO=100")
                                    filename)})]
     (doseq [[table-name field->type] (seq tables)]
       (jdbc/execute! db [(create-table-sql table-name field->type)]))

     ;; Add FK constraints
     (println "Adding FKs...")
     (doseq [{:keys [source-table field dest-table]} fks]
       (jdbc/execute! db [(format "ALTER TABLE \"%s\" ADD CONSTRAINT \"FK_%s_%s_%s\" FOREIGN KEY (\"%s\") REFERENCES \"%s\" (\"ID\");"
                                  source-table
                                  source-table field dest-table
                                  field
                                  dest-table)]))

     ;; Insert the data
     (println "Inserting data...")
     (doseq [[table rows] (seq data)]
       (assert (keyword? table))
       (assert (sequential? rows))
       (let [table-name (s/upper-case (name table))]
         (println (format "Inserting %d rows into %s..." (count rows) table-name))
         (jdbc/insert-multi! db table-name (for [row rows]
                                             (into {} (for [[k v] (seq row)]
                                                        {(s/upper-case (name k)) v}))))))

     ;; Insert the _metabase_metadata table
     (println "Inserting _metabase_metadata...")
     (jdbc/execute! db ["CREATE TABLE \"_METABASE_METADATA\" (\"KEYPATH\" VARCHAR(255), \"VALUE\" VARCHAR(255), PRIMARY KEY (\"KEYPATH\"));"])
     (jdbc/insert-multi! db "_METABASE_METADATA" (reduce concat (for [[table-name {table-description :description, columns :columns}] metabase-metadata]
                                                                  (let [table-name (s/upper-case (name table-name))]
                                                                    (conj (for [[column-name kvs] columns
                                                                                [k v]             kvs]
                                                                            {:keypath (format "%s.%s.%s" table-name (s/upper-case (name column-name)) (name k))
                                                                             :value   v})
                                                                          {:keypath (format "%s.description" table-name)
                                                                           :value table-description})))))

     ;; Create the 'GUEST' user
     (println "Preparing database for export...")
     (jdbc/execute! db ["CREATE USER GUEST PASSWORD 'guest';"])
     (doseq [table (conj (keys data) "_METABASE_METADATA")]
       (jdbc/execute! db [(format "GRANT SELECT ON %s TO GUEST;" (s/upper-case (name table)))]))

     (println "Done."))))

(defn -main [& [filename]]
  (let [filename (or filename sample-dataset-filename)]
    (printf "Writing sample dataset to %s...\n" filename)
    (create-h2-db filename)
    (System/exit 0)))

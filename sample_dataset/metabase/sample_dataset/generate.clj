(ns metabase.sample-dataset.generate
  "Logic for generating the sample dataset.
   Run this with `lein generate-sample-dataset`."
  (:require [clojure.java
             [io :as io]
             [jdbc :as jdbc]]
            [clojure.math.numeric-tower :as math]
            [clojure.string :as s]
            [faker
             [address :as address]
             [company :as company]
             [internet :as internet]
             [lorem :as lorem]
             [name :as name]]
            [incanter.distributions :as dist]
            [metabase.db.spec :as dbspec]
            [metabase.util :as u])
  (:import java.util.Date))

(def ^:private ^:const sample-dataset-filename
  (str (System/getProperty "user.dir") "/resources/sample-dataset.db"))

(defn- normal-distribution-rand [mean median]
  (dist/draw (dist/normal-distribution mean median)))

(defn- normal-distribution-rand-int [mean median]
  (math/round (normal-distribution-rand mean median)))

;;; ## PEOPLE

(defn- random-latitude []
  (-> (rand)
      (* 180)
      (- 90)))

(defn- random-longitude []
  (-> (rand)
      (* 360)
      (- 180)))

(defn ^Date random-date-between [^Date min, ^Date max]
  (let [min-ms (.getTime min)
        max-ms (.getTime max)
        range  (- max-ms min-ms)
        d      (Date.)]
    (.setTime d (+ (long (rand range)) min-ms))
    d))

(defn- random-person []
  (let [first (name/first-name)
        last  (name/last-name)]
    {:name       (format "%s %s" first last)
     :email      (internet/free-email (format "%s.%s" first last))
     :password   (str (java.util.UUID/randomUUID))
     :birth_date (random-date-between (u/relative-date :year -60) (u/relative-date :year -18))
     :address    (address/street-address)
     :city       (address/city)
     :zip        (apply str (take 5 (address/zip-code)))
     :state      (address/us-state-abbr)
     :latitude   (random-latitude)
     :longitude  (random-longitude)
     :source     (rand-nth ["Google" "Twitter" "Facebook" "Organic" "Affiliate"])
     :created_at (random-date-between (u/relative-date :year -1) (u/relative-date :year 1))}))

;;; ## PRODUCTS

(defn- random-company-name []
  (first (company/names)))

(defn- random-price [min max]
  (let [range (- max min)]
    (-> (rand-int (* range 100))
        (/ 100.0)
        (+ min))))

(def ^:private ^:const product-names
  {:adjective '[Small, Ergonomic, Rustic, Intelligent, Gorgeous, Incredible, Fantastic, Practical, Sleek, Awesome, Enormous, Mediocre, Synergistic, Heavy-Duty, Lightweight, Aerodynamic, Durable]
   :material  '[Steel, Wooden, Concrete, Plastic, Cotton, Granite, Rubber, Leather, Silk, Wool, Linen, Marble, Iron, Bronze, Copper, Aluminum, Paper]
   :product   '[Chair, Car, Computer, Gloves, Pants, Shirt, Table, Shoes, Hat, Plate, Knife, Bottle, Coat, Lamp, Keyboard, Bag, Bench, Clock, Watch, Wallet, Toucan]})

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
   :created_at (random-date-between (u/relative-date :year -1) (u/relative-date :year 1))})


;;; ## ORDERS

(def ^:private ^:const state->tax-rate
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

(defn random-order [{:keys [state], :as ^Person person} {:keys [price], :as product}]
  {:pre [(string? state)
         (number? price)]
   :post [(map? %)]}
  (let [tax-rate (state->tax-rate state)
        _        (assert tax-rate
                   (format "No tax rate found for state '%s'." state))
        tax      (u/round-to-decimals 2 (* price tax-rate))]
    {:user_id    (:id person)
     :product_id (:id product)
     :subtotal   price
     :tax        tax
     :total      (+ price tax)
     :created_at (random-date-between (min-date (:created_at person) (:created_at product)) (u/relative-date :year 1))}))


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
   :created_at (random-date-between (:created_at product) (u/relative-date :year 1))})

(defn- create-randoms [n f]
  (vec (map-indexed (fn [id obj]
                      (assoc obj :id (inc id)))
                    (repeatedly n f))))

(defn- product-add-reviews [product]
  (let [num-reviews (max 0 (normal-distribution-rand-int 5 4))
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
  (let [num-orders (max 0 (normal-distribution-rand-int 5 10))]
    (if (zero? num-orders)
      person
      (assoc person :orders (vec (repeatedly num-orders #(random-order person (rand-nth products))))))))

(defn create-random-data [& {:keys [people products]
                             :or   {people 2500 products 200}}]
  {:post [(map? %)
          (= (count (:people %)) people)
          (= (count (:products %)) products)
          (every? keyword? (keys %))
          (every? sequential? (vals %))]}
  (printf "Generating random data: %d people, %d products...\n" people products)
  (let [products (mapv product-add-reviews (create-randoms products random-product))
        people   (mapv (partial person-add-orders products) (create-randoms people random-person))]
    {:people   (mapv #(dissoc % :orders) people)
     :products (mapv #(dissoc % :reviews) products)
     :reviews  (vec (mapcat :reviews products))
     :orders   (vec (mapcat :orders people))}))

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
                            (format "\"%s\" %s NOT NULL" (s/upper-case (name field)) type))
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
            :created_at "DATETIME"}
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
                                                           "of a customer who phoned the order in, this might be the employee who handled the request.")}}}
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
   (let [db (dbspec/h2 {:db (format "file:%s;UNDO_LOG=0;CACHE_SIZE=131072;QUERY_CACHE_SIZE=128;COMPRESS=TRUE;MULTI_THREADED=TRUE;MVCC=TRUE;DEFRAG_ALWAYS=TRUE;MAX_COMPACT_TIME=5000;ANALYZE_AUTO=100"
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

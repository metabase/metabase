(ns metabase.test-data
  "Functions relating to using the test data, Database, Organization, and Users."
  (:require [cemerick.friend.credentials :as creds]
            [korma.core :as k]
            [medley.core :as medley]
            (metabase [db :refer :all]
                      [http-client :as http])
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]]
                             [user :refer [User]])
            [metabase.test-data.load :as load])
  (:import com.metabase.corvus.api.ApiException))

(declare fetch-or-create-user
         tables
         table-fields
         user->info
         usernames)


;; # PUBLIC FUNCTIONS / VARS

;; ## Test Database / Tables / Fields
;;
;; Data is structured as follows:
;; *  users - 15 rows
;;    *  id
;;    *  name
;;    *  last_login
;; *  categories - 75 rows
;;    *  id
;;    *  name
;; *  venues - 100 rows
;;    *  id
;;    *  name
;;    *  latitude
;;    *  longitude
;;    *  price           number of $$$. 0 if unknown, otherwise between 1-4.
;;    *  category_id
;; *  checkins - 1000 rows
;;    *  id
;;    *  user_id
;;    *  venue_id
;;    *  date

(def test-db
  "The test `Database` object."
  (delay (setup-db-if-needed :auto-migrate true)
         (load/test-db)))

(def db-id
  "The ID of the test `Database`."
  (delay (assert @test-db)
         (:id @test-db)))

(defn field->id
  "Return the ID of a Field with FIELD-NAME belonging to Table with TABLE-NAME.

    (field->id :checkins :venue_id) -> 4"
  [table-name field-name]
  {:pre [(keyword? table-name)
         (keyword? field-name)]
   :post [(integer? %)
          (not (zero? %))]}
  (-> @table-fields table-name field-name))

(defn table->id
  "Return the ID of a Table with TABLE-NAME.

    (table->id :venues) -> 12"
  [table-name]
  {:pre [(keyword? table-name)]
   :post [(integer? %)
          (not (zero? %))]}
  (@tables table-name))

(defn table-name->table
  "Fetch `Table` with TABLE-NAME."
  [table-name]
  {:pre [(keyword? table-name)]
   :post [(map? %)]}
  (sel :one Table :id (table->id table-name)))


;; ## Test Users
;;
;; These users have permissions for the Test. They are lazily created as needed.
;; Three test users are defined:
;; *  rasta     - an admin
;; *  crowberto - an admin + superuser
;; *  lucky
;; *  trashbird

(defn fetch-user
  "Fetch the User object associated with USERNAME.

    (fetch-user :rasta) -> {:id 100 :first_name \"Rasta\" ...}"
  [username]
  {:pre [(contains? usernames username)]}
  (medley/mapply fetch-or-create-user (user->info username)))

(defn user->credentials
  "Return a map with `:email` and `:password` for User with USERNAME.

    (user->credentials :rasta) -> {:email \"rasta@metabase.com\", :password \"blueberries\"}"
  [username]
  {:pre [(contains? usernames username)]}
  (-> (user->info username)
      (select-keys [:email :password])))

(def user->id
  "Memoized fn that returns the ID of User associated with USERNAME.

    (user->id :rasta) -> 4"
  (memoize
   (fn [username]
     {:pre [(contains? usernames username)]}
     (:id (fetch-user username)))))

(def id->user
  "Reverse of `user->id`.

    (id->user 4) -> :rasta"
  (let [m (delay (zipmap (map user->id usernames) usernames))]
    (fn [id]
      (@m id))))

(let [tokens (atom {})
      user->token (fn [user]
                    (or (@tokens user)
                        (let [token (http/authenticate (user->credentials user))]
                          (when-not token
                            (throw (Exception. (format "Authentication failed for %s with credentials %s" user (user->credentials user)))))
                          (swap! tokens assoc user token)
                          token)))]
  (defn user->client
    "Returns a `metabase.http-client/client` partially bound with the credentials for User with USERNAME.
     In addition, it forces lazy creation of the User if needed.

       ((user->client) :get 200 \"meta/table\")"
    [username]
    ;; Force lazy creation of User if need be
    (user->id username)
    (fn call-client [& args]
      (try
        (apply http/client (user->token username) args)
        (catch ApiException e
          (if-not (= (.getStatusCode e) 401) (throw e)
                  ;; If we got a 401 unauthenticated clear the tokens cache + recur
                  (do (reset! tokens {})
                      (apply call-client args))))))))


;; ## Temporary Tables / Etc.

(defmacro with-temp-table
  "Execute BODY with a temporary Table that will be dropped afterward.
   The korma entity representing the Table is bound to TABLE-BINDING.
   FIELDS-MAP should be a map of FIELD-NAME -> SQL-TYPE.

    (with-temp-table [table {:name \"VARCHAR(254)\"}]
      (insert table (values [{:name \"A\"}
                             {:name \"B\"}]))
      (select table values (where {:name \"A\"})))"
  [[table-binding fields-map] & body]
  {:pre [(map? fields-map)]}
  (let [table-name (name (gensym "TABLE__"))
        formatted-fields (->> fields-map
                              (map (fn [[field-name field-type]]
                                     (format "\"%s\" %s" (.toUpperCase ^String (name field-name)) (name field-type))))
                              (interpose ", ")
                              (reduce str))]
    `(load/with-test-db
       (k/exec-raw load/*test-db* (format "DROP TABLE IF EXISTS \"%s\";" ~table-name))
       (k/exec-raw load/*test-db* (format "CREATE TABLE \"%s\" (%s, \"ID\" BIGINT AUTO_INCREMENT, PRIMARY KEY (\"ID\"));" ~table-name ~formatted-fields))
       (let [~table-binding (-> (k/create-entity ~table-name)
                                (k/database load/*test-db*))]
         (try
           ~@body
           (catch Throwable e#
             (println "E: " e#))
           (finally
             (k/exec-raw load/*test-db* (format "DROP TABLE \"%s\";" ~table-name))))))))


;; # INTERNAL

;; ## Tables + Fields

(defn- map-table-kws
  "Return a map create by mapping the keyword names of Tables in test DB (e.g. `:users`) against F, e.g.

    {:users (f :users)
     :venues (f :venues)
     ...}"
  [f]
  (->> [:users :venues :checkins :categories]
       (map (fn [table-kw]
              {table-kw (f table-kw)}))
       (into {})))

(def
  ^{:doc "A map of Table name keywords -> Table IDs.

              {:users 100
               :venues 101
               ...}"
    :private true}
  tables
  (delay
   @test-db ; force lazy evaluation of Test DB
    (map-table-kws (fn [table-kw]
                     (->> (-> table-kw name .toUpperCase)
                          (sel :one [Table :id] :db_id @db-id :name)
                          :id)))))

(def
  ^{:doc "A map of Table name keywords -> map of Field name keywords -> Field IDs.

              {:users {:id 14
                       :name 15}
               :venues ...}"
    :private true}
  table-fields
  (delay
   @test-db ; force lazy evaluation of Test DB
   (map-table-kws (fn [table-kw]
                    (->> (sel :many [Field :name :id] :table_id (@tables table-kw))
                         (map (fn [{:keys [^String name id]}]
                                {:pre [(string? name)
                                       (integer? id)
                                       (not (zero? id))]}
                                {(keyword (.toLowerCase name)) id}))
                         (into {}))))))

;; ## Users

(def ^:private user->info
  {:rasta {:email "rasta@metabase.com"
           :first "Rasta"
           :last "Toucan"
           :password "blueberries"
           :admin true}
   :crowberto {:email "crowberto@metabase.com"
               :first "Crowberto"
               :last "Corv"
               :password "blackjet"
               :admin true
               :superuser true}
   :lucky {:email "lucky@metabase.com"
           :first "Lucky"
           :last "Pigeon"
           :password "almonds"}
   :trashbird {:email "trashbird@metabase.com"
               :first "Trash"
               :last "Bird"
               :password "birdseed"
               :active false}})

(def ^:private usernames
  (set (keys user->info)))

(defn- fetch-or-create-user
  "Create User if they don't already exist and return User."
  [& {:keys [email first last password admin superuser active]
      :or {admin false
           superuser false
           active true}}]
  {:pre [(string? email)
         (string? first)
         (string? last)
         (string? password)
         (medley/boolean? admin)
         (medley/boolean? superuser)]}
  (or (sel :one User :email email)
      (let [user (ins User
                   :email email
                   :first_name first
                   :last_name last
                   :password password
                   :is_superuser superuser
                   :is_active active)]
        user)))

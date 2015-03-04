(ns metabase.test-data
  "Functions relating to using the test data, Database, Organization, and Users."
  (:require [cemerick.friend.credentials :as creds]
            [medley.core :as medley]
            [metabase.db :refer :all]
            [metabase.http-client :as http]
            (metabase.models [field :refer [Field]]
                             [org-perm :refer [OrgPerm]]
                             [table :refer [Table]]
                             [user :refer [User]])
            [metabase.test-data.load :as load]))

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
  (delay (migrate :up)
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


;; ## Test Organization

(def test-org
  "The test Organization."
  (delay (migrate :up)
         (load/test-org)))

(def org-id
  "The ID of the test Organization."
  (delay (assert @test-org)
         (:id @test-org)))


;; ## Test Users
;;
;; These users have permissions for the Test Org. They are lazily created as needed.
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

(defn user->client
  "Returns a `metabase.http-client/client` partially bound with the credentials for User with USERNAME.
   In addition, it forces lazy creation of the User if needed.

    ((user->client) :get 200 \"meta/table\")"
  [username]
  {:pre [(contains? usernames username)]}
  (user->id username)                                 ; call a function that will force User to created if need be
  (partial http/client (user->credentials username)))

(defn user->org-perm
  "Return the `OrgPerm` for User with USERNAME for the Test Org."
  [username]
  {:pre [(contains? usernames username)]}
  (sel :one OrgPerm :organization_id (:id @test-org) :user_id (user->id username)))


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
       (reduce merge {})))

(def
  ^{:doc "A map of Table name keywords -> Table IDs.

              {:users 100
               :venues 101
               ...}"
    :private true}
  tables
  (delay
   (binding [*log-db-calls* false]
     (letfn [(table-kw->table-id [table-kw]
               (->> (-> table-kw name .toUpperCase)
                    (sel :one [Table :id] :db_id @db-id :name)
                    :id))]
       (map-table-kws table-kw->table-id)))))

(def
  ^{:doc "A map of Table name keywords -> map of Field name keywords -> Field IDs.

              {:users {:id 14
                       :name 15}
               :venues ...}"
    :private true}
  table-fields
  (delay
   (binding [*log-db-calls* false]
     (letfn [(table-kw->fields [table-kw]
               (->> (sel :many [Field :name :id] :table_id (@tables table-kw))
                    (map (fn [{:keys [^String name id]}]
                           {:pre [(string? name)
                                  (integer? id)
                                  (not (zero? id))]}
                           {(keyword (.toLowerCase name)) id}))
                    (reduce merge {})))]
       (map-table-kws table-kw->fields)))))

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
               :password "birdseed"}})

(def ^:private usernames
  (set (keys user->info)))

(defn- fetch-or-create-user
  "Create User + OrgPerms if they don't already exist and return User."
  [& {:keys [email first last password admin superuser]
      :or {admin false
           superuser false}}]
  {:pre [(string? email)
         (string? first)
         (string? last)
         (string? password)
         (medley/boolean? admin)
         (medley/boolean? superuser)]}
  (or (sel :one User :email email)
      (let [salt (.toString (java.util.UUID/randomUUID))
            org (load/test-org)
            user (ins User
                   :email email
                   :first_name first
                   :last_name last
                   :password_salt salt
                   :password (creds/hash-bcrypt (str salt password))
                   :is_superuser superuser)]
        (or (exists? OrgPerm :organization_id (:id org) :user_id (:id user))
            (ins OrgPerm :organization_id (:id org) :user_id (:id user) :admin admin))
        user)))

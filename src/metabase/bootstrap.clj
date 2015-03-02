(ns metabase.bootstrap
  "Functions for creating new Orgs/Users from the command-line / REPL."
  (:require (metabase [db :refer :all]
                      [test-data :as data])
            (metabase.models [database :refer [Database]]
                             [org :refer [Org]]
                             [org-perm :refer [OrgPerm]]
                             [user :refer [User]])))

(declare bootstrap-user
         prompt-read-line
         prompt-read-line-boolean)

;; # BOOTSTRAPPING

(defn bootstrap
  "Create a User for development purposes. This will load the test data and create permissions for the Test Org."
  []
  @data/test-db ; migrate our DB + load the test data
  (bootstrap-user))


;; # (INTERNAL)

(defn- bootstrap-user
  "Create a new User (creating a new Org too if needed)."
  []
  (let [email (prompt-read-line "User email" "cam@metabase.com")
        ;; create User if needed
        user (or (sel :one User :email email)
                 (ins User
                      :email email
                      :first_name (prompt-read-line "User first name" "Cam")
                      :last_name (prompt-read-line "User last name" "Saul")
                      :password (-> (prompt-read-line "User password" "password")
                                    cemerick.friend.credentials/hash-bcrypt)))]
    ;; create OrgPerm if needed
    (or (sel :one OrgPerm :organization_id @data/org-id :user_id (:id user))
        (let [admin? (prompt-read-line-boolean "Make user an admin?" "true")]
          (ins OrgPerm
               :organization_id @data/org-id
               :user_id (:id user)
               :admin admin?)))
    user))

(defn- prompt-read-line
  "Prompt for input from stdin with PROMPT, returning DEFAULT if user hits return. Optionally, recurse until the returned value is in set VALID-VALUES."
  ([prompt default]
   (println prompt (str "[\"" default "\"]:"))
   (let [line (read-line)]
     (if (empty? line) default
         line)))
  ([prompt default valid-values]
   {:pre [(set? valid-values)]}
   (let [val (prompt-read-line prompt default)]
     (if (contains? valid-values val) val
         (do (println "Must be one of:" (map str valid-values))
             (recur prompt default valid-values))))))

(defn- prompt-read-line-boolean
  "Prompt user for true/false and return a boolean."
  [prompt default]
  {:pre [(contains? #{"true" "false"} default)]}
  (case (prompt-read-line prompt default #{"true" "false"})
    "true" true
    "false" false))

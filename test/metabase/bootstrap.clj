(ns metabase.bootstrap
  "Functions for creating new Orgs/Users from the command-line / REPL."
  (:require [metabase.db :refer :all]
            (metabase.models [database :refer [Database]]
                             [user :refer [User]])
            [metabase.test.data :refer :all]))

(declare bootstrap-user
         prompt-read-line
         prompt-read-line-boolean)

;; # BOOTSTRAPPING

(defn bootstrap
  "Create a `User` for development purposes.
   You may optionally load the test data."
  []
  (setup-db @db-connection-details :auto-migrate true)
  (let [{:keys [email]} (bootstrap-user)]
    (println (format "Successfully created User \"%s\"." email))))


;; # (INTERNAL)

(defn- bootstrap-user
  "Create a new User."
  []
  (let [email (prompt-read-line "User email" "cam@metabase.com")
        ;; create User if needed
        user (or (sel :one User :email email)
                 (ins User
                      :email email
                      :first_name (prompt-read-line "User first name" "Cam")
                      :last_name (prompt-read-line "User last name" "Saul")
                      :is_superuser (prompt-read-line-boolean "Make this user a superuser?" "true")
                      :password (prompt-read-line "User password" "password")))]
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

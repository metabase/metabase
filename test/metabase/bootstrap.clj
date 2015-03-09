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
  "Create a `User` (and, optionally, `Org`) for development purposes.
   You may optionally load the test data and use the test `Org`.
   Permissions will be created for `User` <-> `Org`."
  []
  (binding [*log-db-calls* false]
    (setup-db true)
    (let [{:keys [email]} (bootstrap-user)]
      (println (format "Successfully created User \"%s\"." email)))))


;; # (INTERNAL)

(defn- bootstrap-org
  "Create a new Organization."
  []
  (let [org-name (prompt-read-line "Org name" "Default")]
    (or (sel :one Org :name org-name)
        (ins Org
          :name org-name
          :slug (prompt-read-line "Org slug" "default")
          :inherits true))))

(defn- bootstrap-user
  "Create a new User (creating a new Org too if needed). Org perms between User & Org will be created."
  []
  (let [email (prompt-read-line "User email" "cam@metabase.com")
        ;; create User if needed
        user (or (sel :one User :email email)
                 (ins User
                      :email email
                      :first_name (prompt-read-line "User first name" "Cam")
                      :last_name (prompt-read-line "User last name" "Saul")
                      :is_superuser (prompt-read-line-boolean "Make this user a superuser?" "true")
                      :password (prompt-read-line "User password" "password")))
        use-test-org? (prompt-read-line-boolean "Should we use the test data? (User will be added to \"Test Organization\")" "true")
        org (if use-test-org? (do @data/test-db   ; load the test data reaaallly quick
                                  @data/test-org)
                (bootstrap-org))]
    ;; create OrgPerm if needed
    (or (sel :one OrgPerm :organization_id (:id org) :user_id (:id user))
        (let [admin? (prompt-read-line-boolean "Make user an admin?" "true")]
          (ins OrgPerm
               :organization_id (:id org)
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

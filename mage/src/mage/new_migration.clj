(ns mage.new-migration
  "Mage task for creating a new migration file."
  (:require
   [babashka.fs :as fs]
   [clojure.java.io :as io]
   [mage.util :as u])
  (:import
   (java.security SecureRandom)
   (java.time ZoneOffset ZonedDateTime)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

(def ^:private valid-description-re
  "Descriptions must be lowercase alphanumeric or underscores."
  #"[a-z0-9][a-z0-9_]*[a-z0-9]|[a-z0-9]")

(defn- git-user-name []
  (try
    (u/sh "git" "config" "user.name")
    (catch Exception _
      "author")))

(defn- migration-template [id author]
  (str "## TODO: quick description of what feature/bug this migration is for\n"
       "\n"
       "databaseChangeLog:\n"
       "  - changeSet:\n"
       "      id: " id "\n"
       "      author: " author "\n"
       "      comment: TODO\n"
       "      changes:\n"
       "        - TODO\n"))

(def ^:private first-chars
  "A version-less id must have a letter and must not start with `v`, so it starts with one of these."
  "abcdefghijklmnopqrstuwxyz")

(def ^:private alphanumeric "abcdefghijklmnopqrstuvwxyz0123456789")

(defn- random-id
  "A random 6-character version-less changeset id not in `existing-ids`."
  [existing-ids]
  (let [rng  (SecureRandom.)
        pick (fn [^String chars] (.charAt chars (.nextInt rng (count chars))))]
    (->> (repeatedly #(apply str (pick first-chars) (repeatedly 5 (fn [] (pick alphanumeric)))))
         (remove (set existing-ids))
         first)))

(defn migration-file
  "The `{:path :id :content}` of a new migration file. `:existing-ids` are the changeset ids already in the repository."
  [{:keys [description author ^ZonedDateTime now existing-ids]}]
  (when-not (re-matches valid-description-re description)
    (throw (ex-info (str "description must be lowercase alphanumeric or underscores, got: \"" description "\"")
                    {:description description})))
  (let [date (.format (DateTimeFormatter/ofPattern "yyyyMMdd") now)
        id   (random-id existing-ids)]
    {:path    (str "resources/migrations/" (.getYear now) "/" date "_" description ".yaml")
     :id      id
     :content (migration-template id author)}))

(defn- existing-changeset-ids []
  (into #{}
        (mapcat (fn [file]
                  (map second (re-seq #"(?m)^\s*-?\s*id:\s*(\S+)\s*$" (slurp (str file))))))
        (fs/glob (io/file u/project-root-directory "resources" "migrations") "**.yaml")))

(defn new-migration
  "Creates a new migration file.

  Usage: `./bin/mage new-migration mq_indexes`"
  [{:keys [arguments]}]
  (when-not (= 1 (count arguments))
    (throw (ex-info (str "Usage: mage new-migration <description>. Migrations are version-less on every supported "
                         "major, so there is no version argument.")
                    {:arguments arguments})))
  (let [{:keys [path]
         :as   migration} (try
                            (migration-file {:description  (first arguments)
                                             :author       (git-user-name)
                                             :now          (ZonedDateTime/now ZoneOffset/UTC)
                                             :existing-ids (existing-changeset-ids)})
                            (catch clojure.lang.ExceptionInfo e
                              (binding [*out* *err*]
                                (println (str "Error: " (ex-message e))))
                              (u/exit 1)))
        file      (io/file u/project-root-directory path)]
    (when (.exists file)
      (binding [*out* *err*]
        (println "Error:" path "already exists"))
      (u/exit 1))
    (io/make-parents file)
    (spit file (:content migration))
    (println "Created" path)))

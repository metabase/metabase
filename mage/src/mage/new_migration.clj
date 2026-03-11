(ns mage.new-migration
  "Mage task for creating new directory-based migration files (v60+).

  Each migration file is a YAML file inside a version directory,
  e.g., `resources/migrations/060/20260905_mq_indexes.yaml`."
  (:require
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

(defn- utc-date []
  (.format (DateTimeFormatter/ofPattern "yyyyMMdd")
           (ZonedDateTime/now ZoneOffset/UTC)))

(def ^:private alphanumeric "abcdefghijklmnopqrstuvwxyz0123456789")

(defn- random-id
  "Generates a random 6-character lowercase alphanumeric string."
  []
  (let [rng (SecureRandom.)]
    (apply str (repeatedly 6 #(nth alphanumeric (.nextInt rng (count alphanumeric)))))))

(defn- migration-template [version author]
  (let [id (random-id)]
    (str "## TODO: quick description of what feature/bug this migration is for\n"
         "\n"
         "databaseChangeLog:\n"
         "  - changeSet:\n"
         "      id: v" version "." id "\n"
         "      author: " author "\n"
         "      comment: TODO\n"
         "      changes:\n"
         "        - TODO\n")))

(defn new-migration
  "Creates a new directory-based migration file for the given version number.

  Usage: `./bin/mage new-migration 60 mq_indexes`"
  [{:keys [arguments]}]
  (let [version     (first arguments)
        description (second arguments)
        _           (when-not (and version description)
                      (binding [*out* *err*]
                        (println "Usage: mage new-migration <version> <description>")
                        (println "  e.g., mage new-migration 60 mq_indexes"))
                      (u/exit 1))
        _           (when-not (re-matches valid-description-re description)
                      (binding [*out* *err*]
                        (println (str "Error: description must be lowercase alphanumeric or underscores, got: \"" description "\""))
                        (println "  e.g., mq_indexes, add_user_table, fix_fk"))
                      (u/exit 1))
        dir-name    (format "%03d" version)
        dir         (io/file u/project-root-directory "resources" "migrations" dir-name)
        date        (utc-date)
        filename    (str date "_" description ".yaml")
        file        (io/file dir filename)
        author      (git-user-name)]
    (.mkdirs dir)
    (spit file (migration-template version author))
    (println "Created" (str "resources/migrations/" dir-name "/" filename))))

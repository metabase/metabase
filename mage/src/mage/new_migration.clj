(ns mage.new-migration
  "Mage task for creating new directory-based migration files (v60+).

  Each migration file is a timestamped YAML file inside a version directory,
  e.g., `resources/migrations/060/20260106_125531.yaml`."
  (:require
   [clojure.java.io :as io]
   [mage.util :as u])
  (:import
   (java.time ZoneOffset ZonedDateTime)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

(defn- git-user-name []
  (try
    (u/sh "git" "config" "user.name")
    (catch Exception _
      "author")))

(defn- utc-timestamp []
  (.format (DateTimeFormatter/ofPattern "yyyyMMdd_HHmmss")
           (ZonedDateTime/now ZoneOffset/UTC)))

(defn- migration-template [author]
  (str "databaseChangeLog:\n"
       "\n"
       "  - changeSet:\n"
       "      id: 1\n"
       "      author: " author "\n"
       "      comment: TODO\n"
       "      changes:\n"
       "        - TODO\n"))

(defn new-migration
  "Creates a new directory-based migration file for the given version number.

  Usage: `./bin/mage new-migration 60`"
  [{:keys [arguments]}]
  (let [version    (first arguments)
        _          (when-not version
                     (binding [*out* *err*]
                       (println "Error: version number is required (e.g., 60)"))
                     (u/exit 1))
        dir-name   (format "%03d" version)
        dir        (io/file u/project-root-directory "resources" "migrations" dir-name)
        timestamp  (utc-timestamp)
        filename   (str timestamp ".yaml")
        file       (io/file dir filename)
        author     (git-user-name)]
    (.mkdirs dir)
    (spit file (migration-template author))
    (println "Created" (str "resources/migrations/" dir-name "/" filename))))

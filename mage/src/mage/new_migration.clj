(ns mage.new-migration
  "Mage task for creating new migration files.

  Without a version, the file is version-less and goes in the current year's directory, e.g.
  `resources/migrations/2026/20261012_mq_indexes.yaml` with id `mq_indexes`. With a version below
  [[lint-migrations-file/first-versionless-major]] (backports to older release branches), it uses the versioned layout,
  e.g. `resources/migrations/065/20261012_mq_indexes.yaml` with id `v65.<random>`."
  (:require
   [babashka.fs :as fs]
   [clojure.java.io :as io]
   [lint-migrations-file]
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

(def ^:private alphanumeric "abcdefghijklmnopqrstuvwxyz0123456789")

(defn- random-id
  "Generates a random 6-character lowercase alphanumeric string."
  []
  (let [rng (SecureRandom.)]
    (apply str (repeatedly 6 #(nth alphanumeric (.nextInt rng (count alphanumeric)))))))

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

(defn migration-file
  "The `{:path :id :content}` of a new migration file. `:version` is only for backports below
  [[lint-migrations-file/first-versionless-major]]; without it the file is version-less. `:existing-ids` are the
  changeset ids already in the repository."
  [{:keys [version description author ^ZonedDateTime now existing-ids]}]
  (when-not (re-matches valid-description-re description)
    (throw (ex-info (str "description must be lowercase alphanumeric or underscores, got: \"" description "\"")
                    {:description description})))
  (let [date (.format (DateTimeFormatter/ofPattern "yyyyMMdd") now)]
    (if version
      (do
        (when (>= version lint-migrations-file/first-versionless-major)
          (throw (ex-info (str "Migrations are version-less from v" lint-migrations-file/first-versionless-major
                               " on; leave out the version. A version is only for backports to older releases.")
                          {:version version})))
        (let [dir (format "%03d" version)
              id  (str "v" version "." (random-id))]
          {:path    (str "resources/migrations/" dir "/" date "_" description ".yaml")
           :id      id
           :content (migration-template id author)}))
      (do
        (when-not (lint-migrations-file/valid-version-less-id? description)
          (throw (ex-info (str "\"" description "\" is not a valid version-less changeset id: it needs at least one "
                               "letter and may not start with 'v<digit>'")
                          {:description description})))
        (when (contains? existing-ids description)
          (throw (ex-info (str "Changeset id \"" description "\" is already used; pick a more specific description")
                          {:description description})))
        {:path    (str "resources/migrations/" (.getYear now) "/" date "_" description ".yaml")
         :id      description
         :content (migration-template description author)}))))

(defn- existing-changeset-ids []
  (into #{}
        (mapcat (fn [file]
                  (map second (re-seq #"(?m)^\s*-?\s*id:\s*(\S+)\s*$" (slurp (str file))))))
        (fs/glob (io/file u/project-root-directory "resources" "migrations") "**.yaml")))

(defn new-migration
  "Creates a new migration file.

  Usage: `./bin/mage new-migration mq_indexes`, or `./bin/mage new-migration 65 mq_indexes` for a backport."
  [{:keys [arguments]}]
  (let [[version description] (if (= 2 (count arguments)) arguments [nil (first arguments)])
        {:keys [path]
         :as   migration} (try
                            (migration-file {:version      version
                                             :description  description
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

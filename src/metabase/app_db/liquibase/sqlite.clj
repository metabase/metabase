(ns metabase.app-db.liquibase.sqlite
  "SQLite starts with an immutable v65 schema snapshot, followed by the shared migration tail."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io])
  (:import
   (java.util List)
   (liquibase.changelog ChangeSet DatabaseChangeLog)))

(set! *warn-on-reflection* true)

(def baseline-major-version
  "The oldest application database version supported by SQLite."
  65)

(def ^:private baseline-changesets
  (delay (edn/read-string (slurp (io/resource "sqlite/baseline-changesets.edn")))))

(defn changeset-identity
  "Liquibase identifies changesets by their logical path, author, and ID, not their ID alone."
  [^ChangeSet changeset]
  [(.getFilePath changeset) (.getAuthor changeset) (.getId changeset)])

(defn remove-baselined-changesets!
  "Remove the exact historical changesets represented by the baseline before Liquibase validates or executes them.
  Newly added changesets, including ones in an older release directory, remain eligible for normal migration."
  [^DatabaseChangeLog changelog]
  (let [^List changesets (.getChangeSets changelog)]
    (.removeIf changesets
               (reify java.util.function.Predicate
                 (test [_ changeset]
                   (contains? @baseline-changesets (changeset-identity changeset))))))
  changelog)

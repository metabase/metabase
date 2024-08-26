(ns dev.debug-qp.viewers
  (:require
   [clojure.string :as str]
   [portal.ui.api]))

(defn- format-sql
  "Placeholder SQL formatter until I figure out how to integrate https://www.npmjs.com/package/sql-formatter."
  [sql]
  (reduce
   (fn [sql sql-keyword]
     (str/replace sql (re-pattern sql-keyword) (str \newline sql-keyword)))
   sql
   ["FROM" "WHERE" "ORDER BY" "LIMIT"]))

(defn- view-sql [sql]
  [:pre
   {:style {:color :pink}}
   (format-sql sql)])

(portal.ui.api/register-viewer!
 {:name      ::sql
  :predicate string?
  :component #'view-sql})

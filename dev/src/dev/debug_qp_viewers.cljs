(ns dev.debug-qp-viewers
  (:require
   [clojure.string :as str]
   [portal.ui.api]))

(defn- format-sql [sql]
  (reduce
   (fn [sql sql-keyword]
     (str/replace sql (re-pattern sql-keyword) (str \newline sql-keyword)))
   sql
   [#_"SELECT" "FROM" "WHERE" "ORDER BY" "LIMIT"]))

(defn- view-sql [sql]
  [:pre
   {:style {:color :pink}}
   (format-sql sql)])

(portal.ui.api/register-viewer!
 {:name      ::sql
  :predicate string?
  :component #'view-sql})

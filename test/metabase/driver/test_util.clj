(ns metabase.driver.test-util
  (:require
   [mb.hawk.parallel]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor.empty-string-is-null
    :as sql.qp.empty-string-is-null]
   [metabase.test.initialize :as initialize]))

(defn -notify-all-databases-updated! []
  (mb.hawk.parallel/assert-test-is-not-parallel `-notify-all-databases-updated!)
  ;; It makes sense to notify databases only if app db is initialized.
  (when (initialize/initialized? :db)
    (initialize/initialize-if-needed! :plugins)
    (#'driver/notify-all-databases-updated)))

(defmacro wrap-notify-all-databases-updated!
  [& body]
  `(do
     (-notify-all-databases-updated!)
     (try
       ~@body
       (finally
         (-notify-all-databases-updated!)))))

(defn empty-string-is-null?
  "Does driver treat an empty string as null?"
  [driver]
  (isa? driver/hierarchy driver ::sql.qp.empty-string-is-null/empty-string-is-null))

(ns metabase.driver.test-util
  (:require
   [mb.hawk.parallel]
   [metabase.driver :as driver]
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

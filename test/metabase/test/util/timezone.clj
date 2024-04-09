(ns metabase.test.util.timezone
  (:require
   [clojure.test :as t]
   [mb.hawk.parallel]
   [metabase.driver.test-util :as driver.tu])
  (:import
   (java.util TimeZone)))

(set! *warn-on-reflection* true)

(defn do-with-system-timezone-id! [^String timezone-id thunk]
  ;; skip all the property changes if the system timezone doesn't need to be changed.
  (let [original-timezone        (TimeZone/getDefault)
        original-system-property (System/getProperty "user.timezone")
        new-timezone             (TimeZone/getTimeZone timezone-id)]
    (if (and (= original-timezone new-timezone)
             (= original-system-property timezone-id))
      (thunk)
      (do
        (mb.hawk.parallel/assert-test-is-not-parallel "with-system-timezone-id!")
        ;; Pre-emptively __wrapping__ try block in [[driver.tu/wrap-notify-all-databases-updated]]. I'm not sure that
        ;; is currently necessary and I'm doing that to avoid surprises as with issue #36852 in future.
        (driver.tu/wrap-notify-all-databases-updated!
          (try
            (TimeZone/setDefault new-timezone)
            (System/setProperty "user.timezone" timezone-id)
            (t/testing (format "JVM timezone set to %s" timezone-id)
              (thunk))
            (finally
              (TimeZone/setDefault original-timezone)
              (System/setProperty "user.timezone" original-system-property))))))))

(defmacro with-system-timezone-id!
  "Execute `body` with the system time zone temporarily changed to the time zone named by `timezone-id`."
  [timezone-id & body]
  `(do-with-system-timezone-id! ~timezone-id (fn [] ~@body)))

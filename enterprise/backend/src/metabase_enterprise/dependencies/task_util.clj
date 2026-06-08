(ns metabase-enterprise.dependencies.task-util
  (:require
   [java-time.api :as t]))

(set! *warn-on-reflection* true)

(defn job-delay
  "Generates a random delay in seconds based on `delay` and `variance`.

  Both `delay` and `variance` should be in minutes, and the result will vary between `delay-variance` and
  `delay+variance`."
  [delay variance]
  (let [delay-duration    (t/duration delay :minutes)
        variance-duration (t/duration variance :minutes)]
    (max 0 (.. delay-duration
               (minus variance-duration)
               (plusSeconds (rand-int (.. variance-duration
                                          (multipliedBy 2)
                                          toSeconds)))
               toSeconds))))

(defn job-initial-delay
  "Generates a random delay in seconds based on `variance`.

  `variance` is in minutes and the result will vary between 0 and `variance`"
  [variance]
  (rand-int (.toSeconds (t/duration variance :minutes))))

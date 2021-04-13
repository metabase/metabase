(ns release.version-info-test
  (:require [clojure.data.json :as json]
            [clojure.test :refer :all]
            [release.common :as c]
            [release.common.github :as github]
            [release.version-info :as v-info])
  (:import (java.time.format DateTimeFormatter)
           (java.time LocalDate)))

(defn- make-version-map [version released patch highlights enterprise?]
  {:version    (format "v%d.%s" (if enterprise? 1 0) version)
   :released   released
   :patch      patch
   :highlights highlights})

(def ^:private today (.format (DateTimeFormatter/ofPattern "yyyy-MM-dd") (LocalDate/now)))

(def ^:private test-versions [["39.0" today false ["Super New Fix 1" "Super New Fix 2"]]
                              ["38.3" "2021-04-01" true ["Fix 1" "Fix 2"]]
                              ["38.2" "2021-03-21" true ["Older Fix 1" "Older Fix 2"]]
                              ["38.1" "2021-03-14" true ["Much Older Fix 1" "Much Older Fix 2"]]
                              ["38.0" "2021-02-15" true ["Super Old Fix 1" "Super Old Fix 2"]]])

(defn- make-version-info [edition versions]
  (let [enterprise? (= edition :ee)]
    {:latest (apply make-version-map (conj (first versions) enterprise?))
     :older  (map (fn [v]
                    (apply make-version-map (conj v enterprise?)))
                  (rest versions))}))

(deftest build-info-test
  (doseq [edition [:oss :ee]]
    (testing (format "build-info.json file for %s edition is correct" (name edition))
      (with-redefs [v-info/current-version-info (constantly (make-version-info edition (rest test-versions)))
                    github/milestone-issues     (constantly (mapv (fn [title]
                                                                    {:title title})
                                                                  (last (first test-versions))))]
        (c/set-version! (case edition :oss "0.39.0" "1.39.0"))
        (c/set-branch!  "testing")
        (c/set-edition! edition)
        (#'v-info/generate-version-info!)
        (let [actual (-> (#'v-info/tmp-version-info-filename)
                         (slurp)
                         (json/read-json true))
              expected (make-version-info edition test-versions)]
          (is (= expected actual)))))))



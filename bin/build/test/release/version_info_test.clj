(ns release.version-info-test
  (:require
   [clojure.data.json :as json]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabuild-common.entrypoint :as cli]
   [release.common :as c]
   [release.common.github :as github]
   [release.version-info :as v-info])
  (:import
   (java.time LocalDate)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

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

(defn- read-tmp-file!
  [edition]
  (-> (#'v-info/tmp-version-info-filename edition)
      (slurp)
      (json/read-str :key-fn keyword)))

(deftest version-info-test
  (doseq [edition [:oss :ee]]
    (testing (format "version-info.json file for %s edition is correct" (name edition))
      (with-redefs [v-info/current-version-info (constantly (make-version-info edition (rest test-versions)))
                    github/milestone-issues     (constantly (mapv (fn [title]
                                                                    {:title title})
                                                                  (last (first test-versions))))]
        (c/set-version! (case edition :oss "0.39.0" "1.39.0"))
        (c/set-branch!  "testing")
        (c/set-edition! edition)
        (#'v-info/save-version-info! edition (#'v-info/generate-updated-version-info edition))
        (let [actual (read-tmp-file! edition)
              expected (make-version-info edition test-versions)]
          (is (= expected actual)))))))

(deftest announcement-url-test
  (doseq [edition ["oss" "ee"]]
    (testing (format "version-info.json can have its announcement URL set for the %s edition" (str/upper-case edition))
      (let [uploaded?        (atom false)
            wrapped-safely?  (atom false)
            announcement-url "https://www.metabase.com/releases/whats-new-in-40"]
        (with-redefs [v-info/upload-version-info! (fn [& _] (reset! uploaded? true))
                      v-info/current-version-info (constantly (make-version-info (keyword edition) (rest test-versions)))
                      cli/do-exit-when-finished-nonzero-on-exception (fn [thunk] (thunk) (reset! wrapped-safely? true))]
          (v-info/update-announcement-url! {:edition edition :url announcement-url})
          (let [result (read-tmp-file! (keyword edition))]
            (is (= announcement-url (-> result :latest :announcement_url)))
            (is (true? @uploaded?))
            (is (true? @wrapped-safely?))))))))

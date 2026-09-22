(ns metabase.util.fonts-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.util.files :as u.files]
   [metabase.util.fonts :as u.fonts]))

(defn- families-the-build-emitted
  "Font family names taken from the directories the frontend build wrote, or nil when it has not run."
  []
  (when (u.fonts/bundled-fonts-available?)
    (u.files/with-open-path-to-resource [font-path "frontend_client/app/dist/fonts"]
      (let [prefix (str font-path "/")]
        (->> (u.files/files-seq font-path)
             (map #(str/replace (str %) prefix ""))
             (map #(str/replace % "_" " "))
             set)))))

(deftest available-fonts-test
  (testing "the whitelabel picker lists every bundled family, with or without a frontend build"
    (is (= 21 (count (u.fonts/available-fonts))))
    (is (u.fonts/available-font? "Lato"))
    (is (u.fonts/available-font? "PT Serif"))
    (is (u.fonts/available-font? "Slabo 27px")))
  (testing "An invalid font on the system returns `false`."
    (is (not (u.fonts/available-font? "Comic Sans")))))

(deftest available-fonts-match-the-build-output-test
  (testing "the hard-coded family list has not drifted from what the build emits"
    (when-let [emitted (families-the-build-emitted)]
      (is (= emitted (set (u.fonts/available-fonts)))))))

(deftest hashed-font-url-path-test
  (if (u.fonts/bundled-fonts-available?)
    (do
      (testing "hashed files resolve to a web path"
        (is (re-matches #"/app/dist/fonts/Lato/lato-v16-latin-regular\.[a-f0-9]+\.woff2"
                        (u.fonts/hashed-font-url-path "Lato" "lato-v16-latin-regular" "woff2")))
        (is (re-matches #"/app/dist/fonts/PT_Serif/PTSerif-Bold\.[a-f0-9]+\.woff2"
                        (u.fonts/hashed-font-url-path "PT Serif" "PTSerif-Bold" "woff2"))))
      (testing "a face that does not exist resolves to nil rather than a broken URL"
        (is (nil? (u.fonts/hashed-font-url-path "Slabo 27px" "Slabo27px-Bold" "woff2")))))
    (testing "without a frontend build there is no file to point at"
      (is (nil? (u.fonts/hashed-font-url-path "Lato" "lato-v16-latin-regular" "woff2"))))))

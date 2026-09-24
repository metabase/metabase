(ns metabase.util.fonts-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.fonts :as u.fonts]))

(deftest normalize-font-dirname-test
  (doseq [[s expected] {"Roboto"           "Roboto"
                        "Merriweather"     "Merriweather"
                        "Open_Sans"        "Open Sans"
                        "Lato"             "Lato"
                        "Noto_Sans"        "Noto Sans"
                        "Roboto_Slab"      "Roboto Slab"
                        "Source_Sans_Pro"  "Source Sans Pro"
                        "Raleway"          "Raleway"
                        "Slabo_27px"       "Slabo 27px"
                        "PT_Sans"          "PT Sans"
                        "Poppins"          "Poppins"
                        "PT_Serif"         "PT Serif"
                        "JetBrains_Mono"   "JetBrains Mono"
                        "Roboto_Mono"      "Roboto Mono"
                        "Roboto_Condensed" "Roboto Condensed"
                        "Playfair_Display" "Playfair Display"
                        "Oswald"           "Oswald"
                        "Ubuntu"           "Ubuntu"
                        "Montserrat"       "Montserrat"
                        "Lora"             "Lora"}]
    (testing (pr-str (list 'u.fonts/normalize-font-dirname s))
      (is (= expected
             (#'u.fonts/normalize-font-dirname s))))))

(deftest available-fonts-test
  (let [fonts (u.fonts/available-fonts)]
    (testing "A list of available fonts is returned"
      (is (seq fonts)))))

(deftest available-font-predicate-test
  (testing "A valid font on the system returns `true`."
    (is (u.fonts/available-font? "Lato")))
  (testing "An invalid font on the system returns `false`."
    (is (not (u.fonts/available-font? "Comic Sans")))))

(deftest reads-fonts-from-the-build-output-test
  (testing "the whitelabel picker still lists every bundled family"
    (is (= 21 (count (u.fonts/available-fonts))))
    (is (contains? (set (u.fonts/available-fonts)) "PT Serif"))
    (is (contains? (set (u.fonts/available-fonts)) "Slabo 27px")))
  (testing "hashed files resolve to a web path"
    (is (re-matches #"/app/dist/fonts/Lato/lato-v16-latin-regular\.[a-f0-9]+\.woff2"
                    (u.fonts/hashed-font-url-path "Lato" "lato-v16-latin-regular" "woff2")))
    (is (re-matches #"/app/dist/fonts/PT_Serif/PTSerif-Bold\.[a-f0-9]+\.woff2"
                    (u.fonts/hashed-font-url-path "PT Serif" "PTSerif-Bold" "woff2"))))
  (testing "a face that does not exist resolves to nil rather than a broken URL"
    (is (nil? (u.fonts/hashed-font-url-path "Slabo 27px" "Slabo27px-Bold" "woff2")))))

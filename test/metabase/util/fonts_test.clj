(ns metabase.util.fonts-test
  (:require [clojure.test :refer :all]
            [metabase.util.files :as u.files]
            [metabase.util.fonts :as fonts]))

(deftest normalize-font-dirname-test
  (doseq [[s expected] {"Roboto"           "Roboto"
                        "Merriweather"     "Merriweather"
                        "Open_Sans"        "Open Sans"
                        "Lato-v16-latin"   "Lato"
                        "Noto_Sans"        "Noto Sans"
                        "Roboto_Slab"      "Roboto Slab"
                        "Source_Sans_Pro"  "Source Sans Pro"
                        "Raleway"          "Raleway"
                        "Slabo_27px"       "Slabo 27px"
                        "PT_Sans"          "PT Sans"
                        "Poppins"          "Poppins"
                        "PT_Serif"         "PT Serif"
                        "Roboto_Mono"      "Roboto Mono"
                        "Roboto_Condensed" "Roboto Condensed"
                        "Playfair_Display" "Playfair Display"
                        "Oswald"           "Oswald"
                        "Ubuntu"           "Ubuntu"
                        "Montserrat"       "Montserrat"
                        "Lora"             "Lora"}]
    (testing (pr-str (list 'fonts/normalize-font-dirname s))
      (is (= expected
             (#'fonts/normalize-font-dirname s))))))

(deftest available-fonts-test
  (let [fonts (fonts/available-fonts)]
    (testing "A list of available fonts is returned"
      (seq fonts))
    (testing "Only directories with font files are included."
      (let [dirs (conj
                  (u.files/files-seq (u.files/get-path fonts/font-path))
                  (u.files/get-path "./metabase/"))]
        (is (> (count dirs)
               (count fonts)))))))

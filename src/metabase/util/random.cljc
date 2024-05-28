(ns metabase.util.random
  (:require
    [clojure.string :as str]
    [metabase.util :as u]))

(defn- random-uppercase-letter []
  (char (+ (int \A) (rand-int 26))))

(defn random-name
  "Generate a random string of 20 uppercase letters."
  []
  (str/join (repeatedly 20 random-uppercase-letter)))

(defn random-hash
  "Generate a random hash of 44 characters to simulate a base64 encoded sha. Eg,
  \"y6dkn65bbhRZkXj9Yyp0awCKi3iy/xeVIGa/eFfsszM=\""
  []
  (let [chars (concat (map char (range (int \a) (+ (int \a) 25)))
                      (map char (range (int \A) (+ (int \A) 25)))
                      (range 10)
                      [\/ \+])]
    (str (apply str (repeatedly 43 #(rand-nth chars))) "=")))

(defn random-email
  "Generate a random email address."
  []
  (str (u/lower-case-en (random-name)) "@metabase.com"))

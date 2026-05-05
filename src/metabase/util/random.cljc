(ns metabase.util.random
  (:require
   [clojure.string :as str]
   [metabase.util :as u])
  #?(:clj
     (:import
      (java.security SecureRandom)
      (org.apache.commons.codec.binary Base64 Hex))))

#?(:clj
   (set! *warn-on-reflection* true))

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

;; The following functions provide cryptographically secure random generation, replacing the crypto-random library
;; dependency with inline implementations.

#?(:clj
   (defn- secure-random-bytes ^bytes [size]
     (let [arr (byte-array size)]
       (.nextBytes (SecureRandom.) arr)
       arr)))

#?(:clj
   (defn secure-hex
     "Return a cryptographically secure random hex string of the specified size in bytes."
     [size]
     (Hex/encodeHexString (secure-random-bytes size))))

#?(:clj
   (defn secure-base64
     "Return a cryptographically secure random Base64 string of the specified size in bytes."
     [size]
     (Base64/encodeBase64String (secure-random-bytes size))))

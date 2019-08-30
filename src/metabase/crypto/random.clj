(ns metabase.crypto.random
  (:import (java.security SecureRandom)))

(defonce ^:private secure-random (doto
                                   (SecureRandom/getInstance "SHA1PRNG" "SUN")
                                   (.nextBytes (byte-array 16))))

(defonce ^ThreadLocal threadlocal-random (proxy [ThreadLocal] []
                                           (initialValue [] secure-random)))

(defn secure-rand-int
  "Returns a secure random integer between 0 (inclusive) and n (exclusive)."
  [n] (.nextInt ^SecureRandom (.get threadlocal-random) n))


(defn secure-rand-char
  "Random char between ascii range, defaults to lowercase alphabet range."
  ([]
   (secure-rand-char 26 65))
  ([lower upper ]
   (char (+ (secure-rand-int lower) upper))))

(defn fixed-length-string
  "Random lowercase letter string of default length 16."
  ([] (fixed-length-string 16))
  ([n]
   (reduce str (repeatedly n secure-rand-char))))

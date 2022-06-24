(ns metabase.mbql.generate.common
  (:require [clojure.string :as str]
            [clojure.test.check.generators :as gens]))

(defn nonblank-string [] (gens/fmap str/join (gens/vector gens/char 1 100)))

(defn optional-map-generator [m]
  (let [generators (for [[k generator] m]
                     (gens/one-of [(gens/return nil)
                                   (gens/let [v generator]
                                     [k v])]))]
    (gens/let [result (apply gens/tuple generators)]
      (into {} result))))

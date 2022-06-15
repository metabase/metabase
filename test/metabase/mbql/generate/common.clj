(ns metabase.mbql.generate.common
  (:require [clojure.test.check.generators :as gens]))

(defn optional-map-generator [m]
  (let [generators (for [[k generator] m]
                     (gens/one-of [(gens/return nil)
                                   (gens/let [v generator]
                                     [k v])]))]
    (gens/let [result (apply gens/tuple generators)]
      (into {} result))))

(defn comparison-generator
  [member-generator]
  ;;;;;;;;;
  ;;;;;;;;;
  ;;;;;;;;;
  ;;;;;;;;;
  (gens/let [some shit some shit shomsdkfjwelkfjweklfjwlf]))

(defn case-generator
  [some crap]
  ;;;;;;;;;
  ;;;;;;;;;
  ;;;;;;;;;
  ;;;;;;;;;)

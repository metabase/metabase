(ns metabase.models.diff
  (:require [clojure.core.match :refer [match]]
            (clojure [data :as data]
                     [string :as s])))

(defn- diff-str* [t k v1 v2]
  (match [t k v1 v2]
    [_ :name _ _]
    (format "renamed it from \"%s\" to \"%s\"" v1 v2)

    [_ :private true false]
    "made it public"

    [_ :private false true]
    "made it private"

     [_ _ _ _]
     (format "changed %s from \"%s\" to \"%s\"" (name k) v1 v2)))

(defn- interpose-build-runon-sentence [parts]
  (cond
    (= (count parts) 1) (str (first parts) \.)
    (= (count parts) 2) (format "%s and %s." (first parts) (second parts))
    :else               (format "%s, %s" (first parts) (interpose-build-runon-sentence (rest parts)))))

(defn diff-str
  ([t o1 o2]
   (let [[before after] (data/diff o1 o2)]
     (when before
       (let [ks (keys before)]
         (-> (for [k ks]
               (diff-str* t k (k before) (k after)))
             interpose-build-runon-sentence
           (s/replace-first #" it " (format " this %s " t)))))))
  ([username t o1 o2]
   (str username " " (diff-str t o1 o2))))

(defn- y []
  (diff-str "Cam Saul" "card" {:name "Tips by State", :private false} {:name "Spots by State", :private false}))
;; Cam Saul renamed this card from "Tips by State" to "Spots by State".

(defn z1 []
  (diff-str "Cam Saul" "card" {:name "Spots by State", :private false} {:name "Spots by State", :private true}))
;; Cam Saul made this card private.

(defn- z []
  (diff-str "Cam Saul" "card" {:name "Tips by State", :private false} {:name "Spots by State", :private true}))
;; Cam Saul made this card private and renamed it from "Tips by State" to "Spots by State".

(defn- x []
  (diff-str "Cam Saul" "card"
            {:name "Tips by State", :private false, :priority "Important"}
            {:name "Spots by State", :private true, :priority "Regular"}))
;; Cam Saul changed priority from "Important" to "Regular", made this card private and renamed it from "Tips by State" to "Spots by State".

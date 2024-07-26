(ns src.dev.add-load
  (:require [clojure.string :as str]
            [clojure.walk :as walk]
            [metabase-enterprise.serialization.cmd :as cmd]
            [metabase.test :as mt]))

(defn unwrap [data]
  (vec (mapcat
        #(cond
           (keyword? (first %))
           [%]
           (number? (first %))
           (repeat (first %) (second %))
           :else (throw (ex-info "Invalid data" {})))
        data)))

(defn undata [data]
  (vec (flatten
        (walk/postwalk
         (fn [x] (if (and (keyword? x)
                         (str/starts-with? (name x) "?"))
                  (symbol (subs (name x) 1))
                  x))
         data))))

(defn find-collection-ids [script]
  (let [ids (atom [])]
    (walk/prewalk
     (fn [x]
       (if (and (keyword? x) (str/starts-with? (name x) "?"))
         (swap! ids conj (symbol (subs (name x) 1)))
         x))
     script)
    (vec (distinct @ids))))


(defmacro load-up [script]
  `(do (mt/with-temp ~(undata (unwrap #_{:clj-kondo/ignore [:discouraged-var]}
                                      (eval script)))
         (cmd/v2-dump! "output_" {:collection-ids ~(find-collection-ids
                                                    #_{:clj-kondo/ignore [:discouraged-var]}
                                                    (eval script))}))
       (cmd/v2-load! "output_" {:backfill? false})))

;; Load scenarios cases look like this
  (def one-coll-with-300-cards [[:model/Collection {:?coll-id :id} {}]
                                [300 [:model/Card {} {:collection_id :?coll-id}]]])

(comment

  (time (load-up one-coll-with-300-cards))
  ;; 300 cards in 1 collection takes about 15 seconds


  ;; Caveat, this blows the stack at 400+ entities being inserted, I think due to how with-temp is implemented. To do
  ;; more, we could switch it to using a loop instead of straight recursion.


  ;; This is a rough sketch of how this could/should work. I wasn't really interested in performance, or cleanliness,
  ;; but this DOES work, and the data-oriented syntax is way easier to generate programatically than the
  ;; code-oriented syntax. In other words, we can write scripts taht create values like what's in `one-coll-with-300-cards`.

  )

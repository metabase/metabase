(ns metabase.test.util.js
  "Test utils for CLJS."
  (:refer-clojure :exclude [=]))

(defmulti = (fn [a b]
              (let [ta (type a)
                    tb (type b)]
                (if (clojure.core/= ta tb)
                  (.-name ta)
                  ::mismatched))))

(defmethod = :default [a b]
  (clojure.core/= a b))

(defmethod = ::mismatched [_ _]
  false)

(defmethod = "Array" [a b]
  (and (clojure.core/= (count a) (count b))
       (empty? (filter false? (map = a b)))))

(defmethod = "Object" [a b]
  (and (every? (fn [k] (and (.hasOwnProperty b k) (= (unchecked-get a k) (unchecked-get b k))))
               (js/Object.keys a))
       (every? (fn [k] (and (.hasOwnProperty a k) (= (unchecked-get a k) (unchecked-get b k))))
               (js/Object.keys b))))

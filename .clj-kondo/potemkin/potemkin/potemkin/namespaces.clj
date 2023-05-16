(ns potemkin.namespaces
  (:require [clj-kondo.hooks-api :as api]))

(defn import-macro*
  ([sym]
   `(def ~(-> sym name symbol) ~sym))
  ([sym name]
   `(def ~name ~sym)))

(defmacro import-fn
  ([sym]
   (import-macro* sym))
  ([sym name]
   (import-macro* sym name)))

(defmacro import-macro
  ([sym]
   (import-macro* sym))
  ([sym name]
   (import-macro* sym name)))

(defmacro import-def
  ([sym]
   (import-macro* sym))
  ([sym name]
   (import-macro* sym name)))

#_
(defmacro import-vars
  "Imports a list of vars from other namespaces."
  [& syms]
  (let [unravel (fn unravel [x]
                  (if (sequential? x)
                    (->> x
                         rest
                         (mapcat unravel)
                         (map
                           #(symbol
                              (str (first x)
                                   (when-let [n (namespace %)]
                                     (str "." n)))
                              (name %))))
                    [x]))
        syms (mapcat unravel syms)
        result `(do
                  ~@(map
                      (fn [sym]
                        (let [vr (resolve sym)
                              m (meta vr)]
                          (cond
                            (nil? vr) `(throw (ex-info (format "`%s` does not exist" '~sym) {}))
                            (:macro m) `(def ~(-> sym name symbol) ~sym)
                            (:arglists m) `(def ~(-> sym name symbol) ~sym)
                            :else `(def ~(-> sym name symbol) ~sym))))
                      syms))]
    result))

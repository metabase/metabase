(ns metabase.shared.util.options
  #?(:cljs (:require
            [cljs-bean.core :as bean])))

(defn options-decoder
  "Given a map of keyword Clojure option names to string JS property names, returns a function
  that will transform a JS object to a CLJS map based on those names.

  Uses cljs-bean to do this efficiently and on-demand."
  [key->prop]
  #?(:clj  identity
     :cljs (let [prop->key (into {} (for [[k v] key->prop]
                                      [v k]))]
             #(if (map? %)
                %
                (bean/bean %
                           :key->prop key->prop
                           :prop->key prop->key)))))

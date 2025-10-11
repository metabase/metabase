(ns representation.color
  (:require [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def ^:dynamic *disable-colors*
  "If set to true, all color functions will return the input string as is."
  false)

(def ^:private reset (str "\033[" 0 "m"))

(defn- do-color [color-code args]
  (if *disable-colors*
    (apply str args)
    (str (str/join (map #(str color-code %) args)) reset)))

(defn bold [& args] (do-color "\033[1m" args))
(defn underline [& args] (do-color "\033[4m" args))
(defn reverse-color [& args] (do-color "\033[7m" args))

(defn red [& args] (do-color "\033[31m" args))
(defn green [& args] (do-color "\033[32m" args))
(defn yellow [& args] (do-color "\033[33m" args))
(defn blue [& args] (do-color "\033[34m" args))
(defn magenta [& args] (do-color "\033[35m" args))
(defn cyan [& args] (do-color "\033[36m" args))

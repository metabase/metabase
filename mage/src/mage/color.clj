(ns mage.color
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def ^:dynamic *disable-colors*
  "If set to true, all color functions will return the input string as is."
  (if (System/getenv "NO_COLOR") true false))

(def ^:private reset
  (str "\033[" 0 "m"))

(defn- do-color [color-code args]
  (if *disable-colors*
    (apply str args)
    (str (str/join (map #(str color-code %) args)) reset)))

(defn bold "Wrap a string with code to make it bold then resets it."
  [& args] (do-color "[1m" args))
(defn dark "Wrap a string with code to make it dark then resets it."
  [& args] (do-color "[2m" args))
(defn underline "Wrap a string with code to make it underline then resets it."
  [& args] (do-color "[4m" args))
(defn blink "Wrap a string with code to make it blink then resets it."
  [& args] (do-color "[5m" args))
(defn reverse-color "Wrap a string with code to make it reverse-color then resets it."
  [& args] (do-color "[7m" args))
(defn concealed "Wrap a string with code to make it concealed then resets it."
  [& args] (do-color "[8m" args))
(defn gray "Wrap a string with code to make it gray then resets it."
  [& args] (do-color "[30m" args))
(defn grey "Wrap a string with code to make it grey then resets it."
  [& args] (do-color "[30m" args))
(defn red "Wrap a string with code to make it red then resets it."
  [& args] (do-color "[31m" args))
(defn green "Wrap a string with code to make it green then resets it."
  [& args] (do-color "[32m" args))
(defn yellow "Wrap a string with code to make it yellow then resets it."
  [& args] (do-color "[33m" args))
(defn blue "Wrap a string with code to make it blue then resets it."
  [& args] (do-color "[34m" args))
(defn magenta "Wrap a string with code to make it magenta then resets it."
  [& args] (do-color "[35m" args))
(defn cyan "Wrap a string with code to make it cyan then resets it."
  [& args] (do-color "[36m" args))
(defn white "Wrap a string with code to make it white then resets it."
  [& args] (do-color "[37m" args))
(defn on-grey "Wrap a string with code to make it on-grey then resets it."
  [& args] (do-color "[40m" args))
(defn on-gray "Wrap a string with code to make it on-gray then resets it."
  [& args] (do-color "[40m" args))
(defn on-red "Wrap a string with code to make it on-red then resets it."
  [& args] (do-color "[41m" args))
(defn on-green "Wrap a string with code to make it on-green then resets it."
  [& args] (do-color "[42m" args))
(defn on-yellow "Wrap a string with code to make it on-yellow then resets it."
  [& args] (do-color "[43m" args))
(defn on-blue "Wrap a string with code to make it on-blue then resets it."
  [& args] (do-color "[44m" args))
(defn on-magenta "Wrap a string with code to make it on-magenta then resets it."
  [& args] (do-color "[45m" args))
(defn on-cyan "Wrap a string with code to make it on-cyan then resets it."
  [& args] (do-color "[46m" args))
(defn on-white "Wrap a string with code to make it on-white then resets it."
  [& args] (do-color "[47m" args))

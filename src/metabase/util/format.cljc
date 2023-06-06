(ns metabase.util.format
  #?(:clj  (:require
            [colorize.core :as colorize]
            [metabase.config :as config])
     :cljs (:require
            [goog.string :as gstring])))

(defn- format-with-unit [n suffix]
  #?(:clj  (format "%.1f %s" n suffix)
     :cljs (str (.toFixed n 1) " " suffix)))

(defn format-nanoseconds
  "Format a time interval in nanoseconds to something more readable. (µs/ms/etc.)"
  ^String [nanoseconds]
  ;; The basic idea is to take `n` and see if it's greater than the divisior. If it is, we'll print it out as that
  ;; unit. If more, we'll divide by the divisor and recur, trying each successively larger unit in turn. e.g.
  ;;
  ;; (format-nanoseconds 500)    ; -> "500 ns"
  ;; (format-nanoseconds 500000) ; -> "500 µs"
  (loop [n nanoseconds, [[unit divisor] & more] [[:ns 1000] [:µs 1000] [:ms 1000] [:s 60] [:mins 60] [:hours 24]
                                                 [:days 7] [:weeks (/ 365.25 7)]
                                                 [:years #?(:clj  Double/POSITIVE_INFINITY
                                                            :cljs js/Number.POSITIVE_INFINITY)]]]
    (if (and (> n divisor)
             (seq more))
      (recur (/ n divisor) more)
      (format-with-unit (double n) (name unit)))))

(defn format-microseconds
  "Format a time interval in microseconds into something more readable."
  ^String [microseconds]
  (format-nanoseconds (* 1000.0 microseconds)))

(defn format-milliseconds
  "Format a time interval in milliseconds into something more readable."
  ^String [milliseconds]
  (format-microseconds (* 1000.0 milliseconds)))

(defn format-seconds
  "Format a time interval in seconds into something more readable."
  ^String [seconds]
  (format-milliseconds (* 1000.0 seconds)))

(defn format-bytes
  "Nicely format `num-bytes` as kilobytes/megabytes/etc.

    (format-bytes 1024) ; -> 2.0 KB"
  [num-bytes]
  (loop [n num-bytes [suffix & more] ["B" "KB" "MB" "GB"]]
    (if (and (seq more)
             (>= n 1024))
      (recur (/ n 1024.0) more)
      (format-with-unit n suffix))))

#?(:clj
   (def ^:private colorize?
     ;; As of 0.35.0 we support the NO_COLOR env var. See https://no-color.org/ (But who hates color logs?)
     (if (config/config-str :no-color)
       false
       (config/config-bool :mb-colorize-logs))))

(def ^{:arglists '(^String [color-symb x])} colorize
  "Colorize string `x` using `color`, a symbol or keyword, but only if `MB_COLORIZE_LOGS` is enabled (the default).
  `color` can be `green`, `red`, `yellow`, `blue`, `cyan`, `magenta`, etc. See the entire list of avaliable
  colors [here](https://github.com/ibdknox/colorize/blob/master/src/colorize/core.clj)"
  #?(:clj  (if colorize?
             (fn [color x]
               (colorize/color (keyword color) (str x)))
             (fn [_ x]
               (str x)))
     :cljs (fn [_ x]
             (str x))))

(defn format-color
  "With one arg, converts something to a string and colorizes it. With two args, behaves like `format`, but colorizes
  the output.

    (format-color :red \"%d cans\" 2)"
  {:arglists '(^String [color x] ^String [color format-string & args])}
  (^String [color x]
   (colorize color x))

  (^String [color format-str & args]
   (colorize color (apply #?(:clj format :cljs gstring/format) format-str args))))

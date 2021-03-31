(ns metabase.shared.util.i18n
  (:require [clojure.string :as str]
            ["ttag" :as ttag])
  (:require-macros metabase.shared.util.i18n))

(comment metabase.shared.util.i18n/keep-me
         ttag/keep-me)

(def argument-marker #"\{\s*\d+\s*}")

(defn chomp-format-string
  "Takes a format string and breaks it on format args.

  eg. 'bob {0} great' -> ['bob ' ' great']

  This is how format strings are invoked. Ie, t`hello ${0}, hi` is equivalent to t(['hello ', ', hi'], first-arg);"
  [s]
  (str/split s argument-marker))

(defn js-i18n
  "Translate function for cljs frontend.
  `format-string` should have as many ${0}, ${1} placeholders as args.
  There's code that looks for `tru` forms and includes them in our po files. So all that remains is to invoke the "
  [format-string & args]
  (let [fragments (chomp-format-string format-string)]
    (when (not= (count (re-seq argument-marker format-string)) (count args))
      (throw (ex-info (str "Mismatched arguments for: `" format-string "`")
                      {:format-string format-string
                       :args-in-string (re-seq argument-marker format-string)
                       :args args})))
    ;; calls with framents, arg, arg, ... and they are recombined frag, arg, frag, arg... frag
    (.apply ttag/t nil (clj->js (into [fragments] args)))))

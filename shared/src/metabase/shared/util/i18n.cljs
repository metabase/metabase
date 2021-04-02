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

;; thheller added support for template literals in shadow 2.12.0 with

;; (:require [shadow.cljs.modern :refer [js-template]])
;; (let [x "soundcard"]
;;   (js-template "your " x " works pefectly"))

;; which emits:
;; var x_48110 = "soundcard";
;; `your ${x_48110} works pefectly`;

;; In the future we could leverage this

;; (let [x "soundcard"]
;;   (js-template ttag/t "your " x " works pefectly"))

;; ->

;; var x_49888 = "soundcard";
;; shadow.js.shim.module$ttag.t`your ${x_49888} works pefectly`;

;; would emit the proper tagged literal for this to work. The problem is that this changes the signature of how we use
;; these from

;; (tru "foo {0} bar" variable)

;; to

;; (tru "foo " variable " bar")
;; but the emitted would be t`foo {variable} bar` (actually a shim around t but for clarity)

;; and we need to decide if this kind of change is warranted/desired/nicer on the frontend

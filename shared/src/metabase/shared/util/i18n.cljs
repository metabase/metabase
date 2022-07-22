(ns metabase.shared.util.i18n
  (:require ["ttag" :as ttag]
            [clojure.string :as str]
            [shadow.cljs.modern :refer [js-template]])
  (:require-macros metabase.shared.util.i18n))

(comment metabase.shared.util.i18n/keep-me
         ttag/keep-me)

(defn js-i18n
  "Format an i18n `format-string` with `args` with a translated string in the user locale."
  [format-string & args]
  (let [strings (str/split format-string #"\{\d+\}")]
    (apply ttag/t (clj->js strings) (clj->js args))))

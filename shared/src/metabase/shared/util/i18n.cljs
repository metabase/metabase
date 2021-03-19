(ns metabase.shared.util.i18n
  (:require [clojure.string :as str]
            [goog.string :as gstring]
            [goog.string.format :as gstring.format]))

(comment gstring.format/keep-me)

;; TODO -- use JavaScript i18n libraries.
(defn js-i18n [format-string & args]
  (if (empty? args)
    format-string
    (let [format-string (str/replace format-string #"\{\d+\}" "%s")]
      (apply gstring/format format-string args))))

(ns metabase.util.malli.describe
  "This is exactly the same as [[malli.experimental.describe]], but handles our deferred i18n forms."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.experimental.describe :as med]))

(defn describe
  "Given a schema, returns a string explaining the required shape in English"
  ([?schema]
   (describe ?schema nil))
  ([?schema options]
   (let [options (merge options
                        {::mc/walk-entry-vals true
                         ::med/definitions    (atom {})
                         ::med/describe       med/-describe})]
     (str/trim (str (med/-describe ?schema options))))))

;;; This is a fix for upstream issue https://github.com/metosin/malli/issues/924 (the generated descriptions for
;;; `:min` and `:max` were backwards). We can remove this when that issue is fixed upstream.

#?(:clj
   (defn- -length-suffix [schema]
     (let [{:keys [min max]} (-> schema mc/properties)]
       (cond
         (and min max) (str " with length between " min " and " max " inclusive")
         min           (str " with length >= " min)
         max           (str " with length <= " max)
         :else         ""))))

#?(:clj
   (alter-var-root #'med/-length-suffix (constantly -length-suffix)))

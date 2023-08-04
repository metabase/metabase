(ns metabase.util.malli.describe
  "This is exactly the same as [[malli.experimental.describe]], but handles our deferred i18n forms. Tests for this live
  in [[metabase.util.malli-test]]."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.experimental.describe :as med]))

(defn describe
  "Given a schema, returns a string explaiaing the required shape in English"
  ([?schema]
   (describe ?schema nil))
  ([?schema options]
   (let [options (merge options
                        {::mc/walk-entry-vals true
                         ::med/definitions    (atom {})
                         ::med/describe       med/-describe})]
     (str/trim (str (med/-describe ?schema options))))))

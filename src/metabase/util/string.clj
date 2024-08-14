(ns metabase.util.string
  "Util for building strings"
  (:require
   [clojure.string :as str]
   [metabase.util.i18n :refer [deferred-tru]]))

(defn build-sentence
  "Join parts of a sentence together to build a compound one.

  Options:
  - stop? (default true): whether to add a period at the end of the sentence

  Examples:

    (build-sentence [\"foo\" \"bar\" \"baz\"]) => \"foo, bar and baz.\"

    (build-sentence [\"foo\" \"bar\" \"baz\"] :stop? false) => \"foo, bar and baz\"

  Note: this assumes we're building a sentence with parts from left to right,
  It might not works correctly with right-to-left language.
  Also not all language uses command and \"and\" to represting 'listing'."
  ([parts]
   (build-sentence parts :stop? true))
  ([parts & {:keys [stop?]
             :or   {stop? true}
             :as options}]
   (when (seq parts)
     (cond
       (= (count parts) 1) (str (first parts) (when stop? \.))
       (= (count parts) 2) (str (first parts) " " (deferred-tru "and")  " " (second parts) (when stop? \.))
       :else               (str (first parts) ", " (build-sentence (rest parts) options))))))

(defn mask
  "Mask string value behind 'start...end' representation.

  First four and last four symbols are shown. Even less if string is shorter
  than 8 chars."
  ([s]
   (mask s 4))
  ([s start-limit]
   (mask s start-limit 4))
  ([s start-limit end-limit]
   (if (str/blank? s)
     s
     (let [cnt (count s)]
       (str
        (subs s 0 (max 1 (min start-limit (- cnt 2))))
        "..."
        (when (< (+ end-limit start-limit) cnt)
          (subs s (- cnt end-limit) cnt)))))))

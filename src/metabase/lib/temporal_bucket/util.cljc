(ns metabase.lib.temporal-bucket.util
  (:require
   [metabase.util.i18n :as i18n])
  #?(:cljs (:require-macros [metabase.lib.temporal-bucket.util])))

(defmacro relative-datetime-tru
  "Translates the offset part of a relative datetime interval. The macro accepts only compile-time messages. Examples:

  (relative-datetime-tru  0 \"month\") -> \"starting now\"
  (relative-datetime-tru -1 \"month\") -> \"starting 1 month ago\"
  (relative-datetime-tru  2 \"month\") -> \"starting 2 months from now\""
  [n
   unit-message]
  (assert (string? unit-message)
          "[[relative-datetime-tru]] accepts compile-time strings only.")
  `(let [n# ~n]
     (cond
       (neg? n#)
       (i18n/trun ~(str "starting {0} " unit-message " ago") ~(str "starting {0} " unit-message "s ago") (abs n#))

       (pos? n#)
       (i18n/trun ~(str "starting {0} " unit-message " from now") ~(str "starting {0} " unit-message "s from now") n#)

       :else
       (i18n/tru "starting now"))))

(ns metabase.lib.temporal-bucket.util
  (:require
   [metabase.util.i18n :as i18n])
  #?(:cljs (:require-macros [metabase.lib.temporal-bucket.util])))

(defmacro temporal-interval-tru
  "Translates a temporal interval. The macro accepts only compile-time messages. Examples:

  (temporal-interval-tru  0 \"month\") -> \"This month\"
  (temporal-interval-tru -1 \"month\") -> \"Previous month\"
  (temporal-interval-tru  1 \"month\") -> \"Next month\"
  (temporal-interval-tru -2 \"month\") -> \"Previous 2 months\"
  (temporal-interval-tru  4 \"month\") -> \"Next 4 months\"

  (temporal-interval-tru  0 \"day\" \"Today\" \"Yesterday\" \"Tomorrow\") -> \"Today\"
  (temporal-interval-tru -1 \"day\" \"Today\" \"Yesterday\" \"Tomorrow\") -> \"Yesterday\"
  (temporal-interval-tru  1 \"day\" \"Today\" \"Yesterday\" \"Tomorrow\") -> \"Tomorrow\"
  (temporal-interval-tru -2 \"day\" \"Today\" \"Yesterday\" \"Tomorrow\") -> \"Previous 2 days\"
  (temporal-interval-tru  4 \"day\" \"Today\" \"Yesterday\" \"Tomorrow\") -> \"Next 4 days\""
  ([n
    unit-message]
   `(temporal-interval-tru
     ~n
     ~unit-message
     ~(str "This " unit-message)
     ~(str "Previous " unit-message)
     ~(str "Next " unit-message)))
  ([n
    unit-message
    this-interval-message
    prev-interval-message
    next-interval-message]
   `(temporal-interval-tru
     ~n
     ~this-interval-message
     ~prev-interval-message
     ~(str "Previous {0} " unit-message)
     ~(str "Previous {0} " unit-message "s")
     ~next-interval-message
     ~(str "Next {0} " unit-message)
     ~(str "Next {0} " unit-message "s")))
  ([n
    this-interval-message
    prev-interval-message
    prev-single-interval-message
    prev-plural-interval-message
    next-interval-message
    next-single-interval-message
    next-plural-interval-message]
   `(let [n# ~n]
      (cond
        (zero? n#) (i18n/tru ~this-interval-message)
        (= n# -1)  (i18n/tru ~prev-interval-message)
        (= n# 1)   (i18n/tru ~next-interval-message)
        (neg? n#)  (i18n/trun ~prev-single-interval-message ~prev-plural-interval-message (abs n#))
        (pos? n#)  (i18n/trun ~next-single-interval-message ~next-plural-interval-message n#)))))

(defmacro relative-datetime-tru
  "Translates the offset part of a relative datetime interval. The macro accepts only compile-time messages. Examples:

  (relative-datetime-tru  0 \"month\") -> \"starting now\"
  (relative-datetime-tru -1 \"month\") -> \"starting 1 month ago\"
  (relative-datetime-tru  2 \"month\") -> \"starting 2 months from now\""
  [n
   unit-message]
  `(let [n# ~n]
     (cond
       (neg? n#)
       (i18n/trun ~(str "starting {0} " unit-message " ago") ~(str "starting {0} " unit-message "s ago") (abs n#))

       (pos? n#)
       (i18n/trun ~(str "starting {0} " unit-message " from now") ~(str "starting {0} " unit-message "s from now") n#)

       :else
       (i18n/tru "starting now"))))

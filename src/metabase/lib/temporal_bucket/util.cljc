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
   `(cond
      (zero? ~n) (i18n/tru ~this-interval-message)
      (= ~n -1)  (i18n/tru ~prev-interval-message)
      (= ~n 1)   (i18n/tru ~next-interval-message)
      (neg? ~n)  (i18n/trun ~prev-single-interval-message ~prev-plural-interval-message (abs ~n))
      (pos? ~n)  (i18n/trun ~next-single-interval-message ~next-plural-interval-message ~n))))

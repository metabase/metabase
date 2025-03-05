(ns metabase.lib.temporal-bucket.util
  (:require
   [metabase.util.i18n :as i18n])
  #?(:cljs (:require-macros [metabase.lib.temporal-bucket.util])))

(defmacro temporal-interval-tru
  ([n
    msg]
   `(temporal-interval-tru
     ~n
     ~msg
     ~(str "This " msg)
     ~(str "Previous " msg)
     ~(str "Next " msg)))
  ([n
    msg
    this-msg
    prev-msg
    next-msg]
   `(temporal-interval-tru
     ~n
     ~this-msg
     ~prev-msg
     ~(str "Previous {0} " msg)
     ~(str "Previous {0} " msg "s")
     ~next-msg
     ~(str "Next {0} " msg)
     ~(str "Next {0} " msg "s")))
  ([n
    this-msg
    prev-msg
    prev-single-msg
    prev-plural-msg
    next-msg
    next-single-msg
    next-plural-msg]
   `(cond
      (zero? ~n) (i18n/tru ~this-msg)
      (= ~n -1)  (i18n/tru ~prev-msg)
      (= ~n 1)   (i18n/tru ~next-msg)
      (neg? ~n)  (i18n/trun ~prev-single-msg ~prev-plural-msg (abs ~n))
      (pos? ~n)  (i18n/trun ~next-single-msg ~next-plural-msg ~n))))

(ns metabase.shared.util.i18n
  (:require
   [metabase.util.i18n :as i18n]
   [net.cgrand.macrovich :as macros]))

(defmacro tru
  "i18n a string with the user's locale. Format string will be translated to the user's locale when the form is eval'ed.
  Placeholders should use `gettext` format e.g. `{0}`, `{1}`, and so forth.

    (tru \"Number of cans: {0}\" 2)"
  {:style/indent [:form]}
  [format-string & args]
  (macros/case
    :clj
    `(i18n/tru ~format-string ~@args)

    :cljs
    `(js-i18n ~format-string ~@args)))

(defmacro trs
  "i18n a string with the site's locale, when called from Clojure. Format string will be translated to the site's
  locale when the form is eval'ed. Placeholders should use `gettext` format e.g. `{0}`, `{1}`, and so forth.

    (trs \"Number of cans: {0}\" 2)

  NOTE: When called from ClojureScript, this function behaves identically to `tru`. The originating JS callsite must
  temporarily override the locale used by ttag using the `withInstanceLocalization` wrapper function."
  {:style/indent [:form]}
  [format-string & args]
  (macros/case
    :clj
    (do
      (require 'metabase.util.i18n)
      `(i18n/trs ~format-string ~@args))

    :cljs
    `(js-i18n ~format-string ~@args)))

(defmacro trun
  "i18n a string with both singular and plural forms, using the current user's locale. The appropriate plural form will
  be returned based on the value of `n`. `n` can be interpolated into the format strings using the `{0}`
  syntax. (Other placeholders are not supported)."
  {:style/indent [:form]}
  [format-string format-string-pl n]
  (macros/case
    :clj
    `(i18n/trun ~format-string ~format-string-pl ~n)

    :cljs
    `(js-i18n-n ~format-string ~format-string-pl ~n)))

(defmacro trsn
  "i18n a string with both singular and plural forms, using the site's locale. The appropriate plural form will be
  returned based on the value of `n`. `n` can be interpolated into the format strings using the `{0}` syntax. (Other
  placeholders are not supported)."
  {:style/indent [:form]}
  [format-string format-string-pl n]
  (macros/case
    :clj
    `(i18n/trsn ~format-string ~format-string-pl ~n)

    :cljs
    `(js-i18n-n ~format-string ~format-string-pl ~n)))

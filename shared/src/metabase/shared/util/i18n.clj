(ns metabase.shared.util.i18n
  (:require [net.cgrand.macrovich :as macros]))

(defmacro tru
  "i18n a string with the user's locale. Format string will be translated to the user's locale when the form is eval'ed.
  Placeholders should use `gettext` format e.g. `{0}`, `{1}`, and so forth.

    (tru \"Number of cans: {0}\" 2)"
  [format-string & args]
  (macros/case
    :clj
    (do
      (require 'metabase.util.i18n)
      `(metabase.util.i18n/tru ~format-string ~@args))

    :cljs
    `(js-i18n ~format-string ~@args)))

(defmacro trs
  "i18n a string with the site's locale, when called from Clojure. Format string will be translated to the site's
  locale when the form is eval'ed. Placeholders should use `gettext` format e.g. `{0}`, `{1}`, and so forth.

    (trs \"Number of cans: {0}\" 2)

  NOTE: When called from ClojureScript, this function behaves identically to `tru`. The originating JS callsite must
  temporarily override the locale used by ttag using the `withInstanceLocalization` wrapper function."
  [format-string & args]
  (macros/case
    :clj
    (do
      (require 'metabase.util.i18n)
      `(metabase.util.i18n/trs ~format-string ~@args))

    :cljs
    `(js-i18n ~format-string ~@args)))

(ns metabase.util.i18n
  "Cross-platform i18n macros (`tru`/`trs`/`trun`/`trsn`).

  This namespace is intentionally minimal. It is loaded on the JVM whenever the
  ClojureScript compiler processes a file that requires `metabase.util.i18n` —
  because [[metabase.util.i18n.cljs]] does `(:require-macros [metabase.util.i18n])`.
  Keeping the macros' dependency footprint tiny avoids pulling the heavy
  CLJ-only chain (`metabase.util.i18n.impl`, `instaparse`, `cheshire`,
  `potemkin`, …) into shadow-cljs's macro-load path.

  All JVM-only state, records, validation, JSON encoders, locale handling, and
  the implementation macros (`deferred-tru`, `tru-clj`, …) live in
  [[metabase.util.i18n-be.core]]. The cross-platform macros below expand to
  forms qualified to that namespace in the `:clj` branch (loading it lazily so
  CLJS macro expansion never triggers the load)."
  (:require
   [metabase.util.i18n.common :as i18n.common]
   [net.cgrand.macrovich :as macros]))

;; Re-export the one cross-platform helper that lives in
;; [[metabase.util.i18n.common]] so CLJC callers continue to access it as
;; `metabase.util.i18n/join-strings-with-conjunction`. The CLJS side imports
;; this same function via [[util.ns/import-fns]] in `i18n.cljs`.
(def join-strings-with-conjunction
  "See [[metabase.util.i18n.common/join-strings-with-conjunction]]."
  i18n.common/join-strings-with-conjunction)

;; The :clj branches of the four macros below lazy-require
;; `metabase.util.i18n.validation` at macroexpand time so bad format strings or
;; arg-count mismatches fail to compile (matching pre-extraction behaviour).
;; That namespace is intentionally tiny (clojure.string + java.text.MessageFormat,
;; no BE deps), so the load cost on shadow-cljs's macro pass is one small file.
;; Runtime execution uses `requiring-resolve` to reach the heavy parent only on
;; the first invocation.

(defmacro tru
  "i18n a string with the user's locale. Format string will be translated to the user's locale when the form is eval'ed.
  Placeholders should use `gettext` format e.g. `{0}`, `{1}`, and so forth.

    (tru \"Number of cans: {0}\" 2)"
  {:style/indent [:form]}
  [format-string & args]
  (macros/case
    :clj
    (do
      (require 'metabase.util.i18n.validation)
      ((resolve 'metabase.util.i18n.validation/validate-number-of-args) format-string args)
      (with-meta
       `((requiring-resolve 'metabase.util.i18n-be.macros/tru-runtime)
         ~format-string [~@args])
       {:tag 'String}))
    :cljs
    `(metabase.util.i18n/js-i18n ~format-string ~@args)))

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
      (require 'metabase.util.i18n.validation)
      ((resolve 'metabase.util.i18n.validation/validate-number-of-args) format-string args)
      (with-meta
       `((requiring-resolve 'metabase.util.i18n-be.macros/trs-runtime)
         ~format-string [~@args])
       {:tag 'String}))
    :cljs
    `(metabase.util.i18n/js-i18n ~format-string ~@args)))

(defmacro trun
  "i18n a string with both singular and plural forms, using the current user's locale. The appropriate plural form will
  be returned based on the value of `n`. `n` can be interpolated into the format strings using the `{0}`
  syntax. (Other placeholders are not supported)."
  {:style/indent [:form]}
  [format-string format-string-pl n]
  (macros/case
    :clj
    (do
      (require 'metabase.util.i18n.validation)
      ((resolve 'metabase.util.i18n.validation/validate-n) format-string format-string-pl)
      (with-meta
       `((requiring-resolve 'metabase.util.i18n-be.macros/trun-runtime)
         ~format-string ~format-string-pl ~n)
       {:tag 'String}))
    :cljs
    `(metabase.util.i18n/js-i18n-n ~format-string ~format-string-pl ~n)))

(defmacro trsn
  "i18n a string with both singular and plural forms, using the site's locale. The appropriate plural form will be
  returned based on the value of `n`. `n` can be interpolated into the format strings using the `{0}` syntax. (Other
  placeholders are not supported)."
  {:style/indent [:form]}
  [format-string format-string-pl n]
  (macros/case
    :clj
    (do
      (require 'metabase.util.i18n.validation)
      ((resolve 'metabase.util.i18n.validation/validate-n) format-string format-string-pl)
      (with-meta
       `((requiring-resolve 'metabase.util.i18n-be.macros/trsn-runtime)
         ~format-string ~format-string-pl ~n)
       {:tag 'String}))
    :cljs
    `(metabase.util.i18n/js-i18n-n ~format-string ~format-string-pl ~n)))

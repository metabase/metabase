(ns metabase.util.i18n-be.macros
  "Lightweight pieces of the JVM i18n implementation: the
  `UserLocalizedString` / `SiteLocalizedString` records, the deferred/eager
  `tru`/`trs` macros, the validation helpers, and the small `localized-string?`
  predicate.

  Splitting these off from [[metabase.util.i18n-be.core]] keeps shadow-cljs's
  macro-load path light. Every `.cljc` file (or `.clj` file used as a macro
  source by a `.cljc` file) that calls `(i18n/tru …)` ends up expanding the
  `tru` macro on the JVM during ClojureScript compilation. The expansion
  emits a reference to a `tru-clj` macro; if that macro lived in
  `metabase.util.i18n-be.core`, the JVM would have to load the entire
  `i18n-be.core` dependency chain (`i18n.impl`, `instaparse`, `cheshire`,
  `metabase.util.log`) before the CLJ form could compile. By pointing the
  cross-platform macros at this much smaller namespace, the heavy chain stays
  out of the CLJS build unless the application actually executes BE-only code
  at runtime.

  The records' `toString` methods reach back into `i18n-be.core` for the real
  translate functions via `requiring-resolve`, so the runtime behaviour is
  identical: the first time a localized string is printed, `i18n-be.core` is
  loaded and the lookup is memoized by Clojure's standard var resolution."
  (:require
   [clojure.walk :as walk]
   [metabase.util.i18n.validation :as i18n.validation]
   [potemkin.types :as p.types]))

(set! *warn-on-reflection* true)

;; The dynamic vars `*user-locale*` and `*site-locale-override*` live in
;; [[metabase.util.i18n-be.core]], NOT here. Potemkin's `import-vars` creates a
;; *distinct* Var with the same root value, so `binding` on the imported Var
;; would not affect the original — silently breaking per-thread locale
;; overrides. The records below don't read those Vars directly anyway: they
;; call `translate-user-locale`/`translate-site-locale` via `requiring-resolve`,
;; and those readers reach the canonical Vars in i18n-be.core.

(p.types/defrecord+ UserLocalizedString [format-string args pluralization-opts]
  Object
  (toString [_]
    ;; Heavy resolution deferred to first call — keeps shadow-cljs's macro
    ;; load path off `metabase.util.i18n-be.core` until runtime.
    ((requiring-resolve 'metabase.util.i18n-be.core/translate-user-locale)
     format-string args pluralization-opts)))

(p.types/defrecord+ SiteLocalizedString [format-string args pluralization-opts]
  Object
  (toString [_]
    ((requiring-resolve 'metabase.util.i18n-be.core/translate-site-locale)
     format-string args pluralization-opts)))

(def LocalizedString
  "Schema for user and system localized string instances"
  (letfn [(instance-of [^Class klass]
            [:fn
             {:error/message (str "instance of " (.getCanonicalName klass))}
             (partial instance? klass)])]
    [:or
     (instance-of UserLocalizedString)
     (instance-of SiteLocalizedString)]))

(defn localized-string?
  "Returns true if `x` is a system or user localized string instance"
  [x]
  (boolean (some #(instance? % x) [UserLocalizedString SiteLocalizedString])))

(defn localized-strings->strings
  "Walks the datastructure `x` and converts any localized strings to regular string"
  [x]
  (walk/postwalk (fn [node]
                   (cond-> node
                     (localized-string? node) str))
                 x))

;; Validators moved to [[metabase.util.i18n.validation]] so the cross-platform
;; macros in `metabase.util.i18n` can call them at macroexpand time without
;; dragging this whole namespace (records, potemkin, etc.) onto shadow-cljs's
;; macro-load path. Re-exported here so existing callers
;; (`deferred-tru`/`tru-clj`/…) continue to resolve them through this ns.
(def validate-number-of-args
  "See [[metabase.util.i18n.validation/validate-number-of-args]]."
  i18n.validation/validate-number-of-args)

(def validate-n
  "See [[metabase.util.i18n.validation/validate-n]]."
  i18n.validation/validate-n)

(defmacro deferred-tru
  "Similar to `tru` but creates a `UserLocalizedString` instance so that conversion to the correct locale can be delayed
  until it is needed. The user locale comes from the browser, so conversion to the localized string needs to be 'late
  bound' and only occur when the user's locale is in scope.

  Calling `str` on the results of this invocation will lookup the translated version of the string."
  {:style/indent [:form]}
  [format-string-or-str & args]
  (validate-number-of-args format-string-or-str args)
  `(metabase.util.i18n-be.macros/->UserLocalizedString ~format-string-or-str ~(vec args) {}))

(defmacro deferred-trs
  "Similar to `trs` but creates a `SiteLocalizedString` instance so that conversion to the correct locale can be
  delayed until it is needed."
  {:style/indent [:form]}
  [format-string & args]
  (validate-number-of-args format-string args)
  `(metabase.util.i18n-be.macros/->SiteLocalizedString ~format-string ~(vec args) {}))

(def ^String ^{:arglists '([& args])} str*
  "Ensures that `trs`/`tru` isn't called prematurely, during compilation."
  (if *compile-files*
    (fn [& _]
      (throw (Exception. (format "Premature i18n string lookup. Is there a top-level call to `trs` or `tru`? (In: %s)"
                                 (pr-str *file*)))))
    str))

(defmacro tru-clj
  "Applies `str` to `deferred-tru`'s expansion.

  Prefer this over `deferred-tru`. Use `deferred-tru` only in code executed at compile time, or where `str` is manually
  applied to the result."
  {:style/indent [:form]}
  [format-string-or-str & args]
  `(metabase.util.i18n-be.macros/str*
    (metabase.util.i18n-be.macros/deferred-tru ~format-string-or-str ~@args)))

(defmacro trs-clj
  "Applies `str` to `deferred-trs`'s expansion."
  {:style/indent [:form]}
  [format-string-or-str & args]
  `(metabase.util.i18n-be.macros/str*
    (metabase.util.i18n-be.macros/deferred-trs ~format-string-or-str ~@args)))

(defmacro deferred-trun
  "Similar to `deferred-tru` but chooses the appropriate singular or plural form based on the value of `n`.

    (deferred-trun \"{0} table\" \"{0} tables\" n)"
  [format-string format-string-pl n]
  (validate-n format-string format-string-pl)
  `(metabase.util.i18n-be.macros/->UserLocalizedString
    ~format-string ~[n] ~{:n n :format-string-pl format-string-pl}))

(defmacro trun-clj
  "Similar to `tru` but chooses the appropriate singular or plural form based on the value of `n`."
  [format-string format-string-pl n]
  `(metabase.util.i18n-be.macros/str*
    (metabase.util.i18n-be.macros/deferred-trun ~format-string ~format-string-pl ~n)))

(defmacro deferred-trsn
  "Similar to `deferred-trs` but chooses the appropriate singular or plural form based on the value of `n`."
  [format-string format-string-pl n]
  (validate-n format-string format-string-pl)
  `(metabase.util.i18n-be.macros/->SiteLocalizedString
    ~format-string ~[n] ~{:n n :format-string-pl format-string-pl}))

(defmacro trsn-clj
  "Similar to `trs` but chooses the appropriate singular or plural form based on the value of `n`."
  [format-string format-string-pl n]
  `(metabase.util.i18n-be.macros/str*
    (metabase.util.i18n-be.macros/deferred-trsn ~format-string ~format-string-pl ~n)))

;;; ----- runtime impls of the cross-platform `metabase.util.i18n` macros -----
;;;
;;; These exist so the `:clj` branch of [[metabase.util.i18n/tru]] (and
;;; siblings) can emit `((requiring-resolve 'tru-runtime) …)` instead of
;;; expanding to a call to a *macro* defined here. Without that indirection,
;;; every CLJ macro-source file (or CLJC file loaded by shadow-cljs as a
;;; macro source) that happens to contain `(i18n/tru …)` in a defn body
;;; would force the JVM compiler to load this namespace just to compile
;;; that defn. With `requiring-resolve`, this namespace loads lazily on
;;; the first runtime call instead.
;;;
;;; Validation that previously ran at macroexpand time against the literal
;;; format-string *form* moves here to runtime; the first call with a bad
;;; format string fails loudly with the same assertion message as before.

(defn- premature-check!
  "Throws if invoked during AOT compilation, mirroring the original
  [[str*]] behaviour for top-level `(def x (tru …))` mistakes. Relies on
  `*compile-files*` being bound to `true` during the dynamic extent of
  `clojure.lang.Compiler/compile`."
  [macro-name]
  (when *compile-files*
    (throw (Exception. (format "Premature i18n string lookup. Is there a top-level call to `%s`? (In: %s)"
                               macro-name (pr-str *file*))))))

(defn tru-runtime
  "Runtime impl of [[metabase.util.i18n/tru]] on CLJ."
  [^String format-string args]
  (premature-check! 'tru)
  (validate-number-of-args format-string args)
  (str (->UserLocalizedString format-string (vec args) {})))

(defn trs-runtime
  "Runtime impl of [[metabase.util.i18n/trs]] on CLJ."
  [^String format-string args]
  (premature-check! 'trs)
  (validate-number-of-args format-string args)
  (str (->SiteLocalizedString format-string (vec args) {})))

(defn trun-runtime
  "Runtime impl of [[metabase.util.i18n/trun]] on CLJ."
  [^String format-string ^String format-string-pl n]
  (premature-check! 'trun)
  (validate-n format-string format-string-pl)
  (str (->UserLocalizedString format-string [n] {:n n :format-string-pl format-string-pl})))

(defn trsn-runtime
  "Runtime impl of [[metabase.util.i18n/trsn]] on CLJ."
  [^String format-string ^String format-string-pl n]
  (premature-check! 'trsn)
  (validate-n format-string format-string-pl)
  (str (->SiteLocalizedString format-string [n] {:n n :format-string-pl format-string-pl})))

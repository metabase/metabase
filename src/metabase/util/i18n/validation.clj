(ns metabase.util.i18n.validation
  "Pure helpers for validating `java.text.MessageFormat` patterns. These primitives are shared by
  three callers:

    - `metabase.util.i18n/validate-number-of-args` — macro-expansion-time check on `(deferred-tru
      …)` / `(deferred-trs …)` call sites in our own Clojure code.
    - `i18n.validation` (in `bin/build/src`) — build-time `.po`-file scanner that catches broken
      Crowdin translations before they ship.
    - `metabase.util.i18n.validation-test` — regression guard on the built `.edn` artifacts.

  Kept free of jgettext and other build-only deps so all three layers can require it."
  (:import
   (java.text MessageFormat)))

(set! *warn-on-reflection* true)

(defn message-format-error
  "If `s` is not a valid `java.text.MessageFormat` pattern, return the underlying
  `IllegalArgumentException` message. Returns `nil` for valid patterns, and also for `nil` input
  (there's no pattern to validate)."
  [^String s]
  (when (some? s)
    (try
      (MessageFormat. s)
      nil
      (catch IllegalArgumentException e (.getMessage e)))))

(defn valid-message-format?
  "True if `s` parses as a valid `java.text.MessageFormat` pattern."
  [^String s]
  (nil? (message-format-error s)))

(defn message-format-arg-count
  "Count of distinct argument indices referenced by `s` (e.g. `{0} {0} {1}` → 2). Returns `nil` if
  `s` is not a valid MessageFormat pattern, or if `s` is `nil`."
  [^String s]
  (when (some? s)
    (try
      (count (.getFormatsByArgumentIndex (MessageFormat. s)))
      (catch IllegalArgumentException _ nil))))

(defn skipped-arg-index?
  "True if `s` is a valid MessageFormat that references a non-contiguous set of argument indices —
  e.g. `\"{0} {2}\"` skips `{1}`. Returns `false` for valid strings with no skip and for invalid
  ones (use `valid-message-format?` for that).

  Why we care: at runtime the caller passes args for indices `0..N`. A skipped `{2}` in `\"{0}
  {2}\"` either renders literally as `{2}` (if caller passes 2 args) or silently inflates the
  expected arg count past what callers supply. Both are bugs.

  This is the same check `metabase.util.i18n/validate-number-of-args` enforces against developer
  call sites at macro-expansion time; centralizing it here lets the build-time `.po` scanner reuse
  the exact same primitive against translated strings."
  [^String s]
  (when (some? s)
    (try
      (let [mf (MessageFormat. s)]
        (not= (count (.getFormats mf))
              (count (.getFormatsByArgumentIndex mf))))
      (catch IllegalArgumentException _ false))))

;;; -------------------------------------------------- Regex-based helpers --------------------------------------------------
;; For frontend strings (`#, javascript-format` in the `.po`), `MessageFormat` is the wrong parser
;; — it treats apostrophes as escape characters and doesn't know about JS's format system. These
;; regex-based helpers scan for `{N}` patterns directly, which matches what ttag actually does on
;; the JS side.
;;
;; For backend strings, continue using the `MessageFormat`-based helpers above — they're the
;; authoritative parser the runtime uses. Regex would diverge on: (a) `'{0}'` is literal in
;; MessageFormat but regex sees an arg; (b) `{0,number,integer}` has a format specifier regex misses.

(defn regex-arg-indices
  "Set of integer argument indices found by scanning for `{N}` patterns via regex. Format-system-
  agnostic — works for Java MessageFormat strings, JS ttag strings, or anything that uses `{0}`
  positional placeholders."
  [^String s]
  (when (some? s)
    (into (sorted-set) (map #(parse-long (second %))) (re-seq #"\{(\d+)\}" s))))

(defn regex-arg-count
  "Count of distinct `{N}` indices in `s` via regex. Returns `nil` for `nil` input (matching the
  nil-contract of `message-format-arg-count`), 0 for strings with no placeholders."
  [^String s]
  (when (some? s)
    (count (regex-arg-indices s))))

(defn regex-skipped-arg-index?
  "True if `s` has `{N}` placeholders with non-contiguous indices (e.g. `\"{0} {2}\"` skips
  `{1}`). Uses regex, so works for both backend and frontend strings without `MessageFormat`
  parsing."
  [^String s]
  (let [indices (regex-arg-indices s)]
    (and (seq indices)
         (not= (count indices) (inc (apply max indices))))))

;;; -------------------------------------------------- Cross-string checks -------------------------------------------------

(defn- normalize-acceptable-counts
  "Coerce `acceptable-counts` — either a single number or a seqable of numbers — into a sorted set,
  dropping nils."
  [acceptable-counts]
  (into (sorted-set)
        (filter some?)
        (if (number? acceptable-counts) [acceptable-counts] acceptable-counts)))

(defn arg-count-mismatch
  "If `actual-count` is not in `acceptable-counts`, return
  `{:expected-arg-counts <sorted-set> :actual-arg-count n}`. Otherwise `nil`.

  `actual-count` may be:
    - an integer (pre-computed by the caller — avoids redundant parsing)
    - a string  (parsed via `message-format-arg-count` — convenience for the macro-time path)

  `acceptable-counts` may be a single number or any seqable of numbers; `nil` entries are ignored.

  Call shapes:

    ;; Macro-time — parse the format string, compare against caller's arg count:
    (arg-count-mismatch format-string (count args))

    ;; Scanner — caller already computed actual and expected via the appropriate count-fn:
    (arg-count-mismatch actual-count expected-counts)

  ## Why the translation-time call accepts a *set* rather than a single number

  Languages with >2 plural forms (Arabic nplurals=6, Russian nplurals=4, Chinese nplurals=1, …)
  have form-index-to-n mappings that don't align with English's 2-form model. A translated plural
  form's arg count is valid as long as it matches *some* English form's arg count — i.e. is in the
  set `{count(msgid), count(msgid_plural)}`. See the `Plural-Forms` header in any
  `resources/i18n/<locale>.edn` for per-locale CLDR rules."
  [actual-count acceptable-counts]
  (let [actual   (if (string? actual-count)
                   (message-format-arg-count actual-count)
                   actual-count)
        accepted (normalize-acceptable-counts acceptable-counts)]
    (when (and actual (seq accepted) (not (contains? accepted actual)))
      {:expected-arg-counts accepted
       :actual-arg-count    actual})))

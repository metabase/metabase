(ns i18n.validation
  "Scan `locales/*.po` files for translation violations — invalid `java.text.MessageFormat`
  patterns, skipped argument indices, and argument-count mismatches between English source and
  translated strings. Produces structured violation records suitable for:

    - Filtering invalid translations from the backend `.edn` build pipeline.
    - Emitting a CSV/EDN artifact that surfaces what was filtered (and why) so translators can
      fix the originals in Crowdin.

  The pure predicates live in `metabase.util.i18n.validation` so they can be shared with the
  macro-time call-site check (`metabase.util.i18n/validate-number-of-args`) and the regression-
  guard test (`metabase.util.i18n.validation-test`) without pulling in jgettext."
  (:require
   [clojure.string :as str]
   [i18n.common :as i18n]
   [metabase.util.i18n.validation :as validation]))

(set! *warn-on-reflection* true)

(defn- present? [s]
  (and (string? s) (not (str/blank? s))))

(defn- msgstr-forms
  "Seq of `{:plural-index int-or-nil :msgstr String}` for the msgstr(s) on a parsed `.po` message
  (the shape returned by `i18n.common/po-contents`). Blank entries are dropped — those represent
  missing translations, not malformed ones, so they're outside this scanner's scope."
  [{:keys [plural? str str-plural]}]
  (if plural?
    (keep-indexed (fn [i s] (when (present? s) {:plural-index i :msgstr s}))
                  str-plural)
    (when (present? str)
      [{:plural-index nil :msgstr str}])))

(defn- arg-count-fn
  "Return the right arg-count function for `backend?` — `MessageFormat`-based for backend strings,
  regex-based for frontend."
  [backend?]
  (if backend? validation/message-format-arg-count validation/regex-arg-count))

(defn- check-violations
  "Return a flat violation map for `msgstr` (may have empty `:types`). Backend strings get all three
  checks; frontend strings get only the format-system-agnostic ones. All applicable types are
  collected — no short-circuiting. Single `MessageFormat` parse for backend strings."
  [msgstr message backend?]
  (let [count-fn     (arg-count-fn backend?)
        format-error (when backend? (validation/message-format-error msgstr))
        skip?        (if backend?
                       (when-not format-error (validation/skipped-arg-index? msgstr))
                       (validation/regex-skipped-arg-index? msgstr))
        actual       (when-not format-error (count-fn msgstr))
        expected     (keep (arg-count-fn backend?) [(:id message) (:id-plural message)])
        arg-mismatch (when actual (validation/arg-count-mismatch actual expected))]
    (cond-> {:types (cond-> #{}
                      format-error (conj :invalid-message-format)
                      skip?        (conj :skipped-arg-index)
                      arg-mismatch (conj :arg-count-mismatch))}
      format-error (assoc :error format-error)
      arg-mismatch (merge arg-mismatch))))

(defn invalid-messages-in-po
  "Return a seq of violation maps for `locale`'s `.po` file. Each map has:

    :types         — set of applicable violation keywords (e.g. `#{:invalid-message-format}` or
                     `#{:skipped-arg-index :arg-count-mismatch}` when both fire on the same form)
    :locale        — the locale code (e.g. `\"fr\"`, `\"pt-BR\"`)
    :msgid         — the English singular source string
    :msgid-plural  — the English plural source string (nil for non-plural entries)
    :msgstr        — the offending translated string
    :plural-index  — `nil` for singular, `0..n` for plural forms
    :backend?      — true if the message originates from `.clj`/`.cljc` source
    :error         — (`:invalid-message-format`) the `IllegalArgumentException` message
    :expected-arg-counts, :actual-arg-count
                   — (`:arg-count-mismatch`) the acceptable set and what the translation has
    :source-refs   — seq of `path:line` references from the `.po` `#:` comments

  Every message (backend AND frontend) is scanned. Backend messages get all three checks (validity,
  skipped-index, arg-count). Frontend messages get only the format-system-agnostic checks (skipped-
  index, arg-count) using regex-based helpers to avoid `MessageFormat` apostrophe misparsing."
  ([locale]
   (invalid-messages-in-po locale (i18n/po-contents locale)))
  ([locale po-contents]
   (for [message  (:messages po-contents)
         form     (msgstr-forms message)
         :let     [msgstr   (:msgstr form)
                   backend? (i18n/backend-message? message)
                   result   (check-violations msgstr message backend?)]
         :when    (seq (:types result))]
     (merge {:locale       locale
             :msgid        (:id message)
             :msgid-plural (:id-plural message)
             :msgstr       msgstr
             :plural-index (:plural-index form)
             :backend?     backend?
             :source-refs  (vec (:source-references message))}
            result))))

(defn invalid-messages-in-all-po-files
  "Scan every non-template `.po` file (via `i18n.common/locales`) and return a seq of violation
  maps, sorted by locale, types, then msgid."
  []
  (->> (i18n/locales)
       (mapcat invalid-messages-in-po)
       (sort-by (juxt :locale (comp str :types) :msgid :plural-index))))

(defn drop-from-build?
  "Predicate the build-time filter consults to decide whether a violation's translated string
  should be excluded from its generated artifact (`.edn` for backend, `.json` for frontend).

  V1 policy: drop every violation from both pipelines. The violations report
  (`target/i18n-violations.csv`) is the single queue of work for translators to fix in Crowdin."
  [_violation]
  true)

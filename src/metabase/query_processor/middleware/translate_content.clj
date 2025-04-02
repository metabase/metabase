(ns metabase.query-processor.middleware.translate-content
  "Middleware for handling conversion of integers to strings for proper display of large numbers"
  (:require
   [metabase.models.content-translation :as ct]
   [metabase.util.i18n.impl :as i18n.impl]
   [metabase.util.log :as log]
   [metabase.util.performance :as perf]))

(set! *warn-on-reflection* true)

(defn- translate-row
  "Converts all large integer row values to strings."
  [rf translation-map]
  (let [lookup-translation
        (fn [msgid]
          (or (get translation-map msgid) msgid))]
    ((map (fn [row]
            (perf/mapv lookup-translation row)))
     rf)))

(defn build-translation-map
  "Build a translation map from the content_translation table"
  []
  (let [translations (ct/get-translations)
        locale (i18n.impl/site-locale-from-setting) ; TODO: support user locale
        translations-for-locale (filter #(= (:locale %) locale) translations)]
    (log/info "locale" locale)
    (log/info "Translations for locale:" translations-for-locale)
    (reduce (fn [acc {:keys [msgid msgstr]}]
              (assoc acc msgid msgstr))
            {}
            translations-for-locale)))

(defn translate-content
  "Translate content"
  [_query rff]
  (let [translation-map (build-translation-map)
        rff' (fn [metadata] (translate-row (rff metadata) translation-map))]
    (log/info "translation map:" translation-map)
    (log/info "Translating content")
    (or rff' rff)))

;;; # topic: Translation lookup implementation
;;;
;;; - file: 2025-03-24.16-07-05.907.md
;;;
;;; Write your queries after 💬:. Use `<C-g><C-g>` or :GpChatRespond to generate a response.
;;; Response generation can be terminated by using `<C-g>s` or :GpChatStop command.
;;; Chats are saved automatically. To delete this chat, use `<C-g>d` or :GpChatDelete.
;;; Be cautious of very long chats. Start a fresh chat by using `<C-g>c` or :GpChatNew.
;;;
;;; ---
;;;
;;; 💬:
;;;
;;; I have this clojure function that retrieves translations.
;;;
;;; (defn get-translations
;;;   "List the translations stored in the content_translation table"
;;;   []
;;;   (t2/query {:select [:*]
;;;              :from [[(t2/table-name :model/ContentTranslation) :t]]}))
;;;
;;; Each row in content translation table just has these fields:
;;;
;;; locale (e.g. "fr")
;;; msgid
;;; msgstr
;;;
;;; I now have a translation function that currently doesn't do anything, it just adds "a" to the string
;;;
;;; (defn translate-value
;;;   "Converts large integer values to strings and leaves other values unchanged."
;;;   [x]
;;;   (if (string? x)
;;;     (str x "a")
;;;     x))
;;;
;;; Let's change this function so that it takes the result of get-translations and then looks up the translation in it
;;;
;;; 🤖:[ChatGPT4o]
;;; To make use of the translations retrieved by `get-translations`, you should first consider how you would like to store and access these translations. A common approach is to build a lookup map, where the keys are the `msgid` and the values are `msgstr`, perhaps indexed by `locale`. Here’s a step-by-step approach to achieve this.
;;;
;;; 1. Fetch the translations from the `content_translation` table.
;;; 2. Construct a map (or a nested map) to facilitate quick lookup of translations using both `locale` and `msgid`.
;;; 3. Enhance the `translate-value` function to use this map to look up the appropriate translation based on a provided locale and message id.
;;;
;;; Let’s outline the detailed steps and code for this transformation:
;;;
;;; ### Step 1: Modify `get-translations` to Return the Translations
;;;
;;; Ensure the `get-translations` function is converted to a map structure that's optimized for lookups.
;;;
;;; ### Step 2: Create the Translation Map
;;;
;;; We'll generate a nested map in the form `{locale {msgid msgstr}}`.
;;;
;;; ```clojure
;;; (defn build-translation-map []
;;;   (let [translations (get-translations)]
;;;     (reduce (fn [acc {:keys [locale msgid msgstr]}]
;;;               (assoc-in acc [locale msgid] msgstr))
;;;             {}
;;;             translations)))
;;; ```
;;;
;;; ### Step 3: Refactor `translate-value` to Utilize the Translation Map
;;;
;;; Let’s update `translate-value` to use this map. It will take an additional argument, `locale`, to decide which translation to use.
;;;
;;; ```clojure
;;; (def translations (build-translation-map))
;;;
;;; (defn translate-value
;;;   "Translates a message string based on its translation id (msgid) and a specified locale
;;;    using pre-fetched translations, leaves non-string or untranslated values unchanged."
;;;   [locale msgid]
;;;   (get-in translations [locale msgid] msgid))
;;; ```
;;;
;;; ### Explanation of `translate-value` Function:
;;;
;;; - **Parameters**
;;;   - `locale`: The locale for which translation is desired.
;;;   - `msgid`: The original message ID or string you want to translate.
;;;
;;; - **Functionality**:
;;;   - It attempts to look up the translation using `get-in` on the nested map.
;;;   - If a translation is found, it returns the translated string. If not, it provides the original `msgid`.
;;; - This setup assumes `translations` is initialized once and reused in your application lifecycle.
;;;
;;; ### Considerations
;;;
;;; - Ensure that `get-translations` retrieves the latest translations whenever updates to translations can happen. You might need to periodically regenerate `translations` or recreate it each time `translate-value` is called.
;;; - You may need extra functions to support cases like handling default locales or fallbacks when a particular translation is missing.
;;;
;;; Would you like to process alternative approaches or further modifications?
;;;
;;;
;;; 💬:
;;;

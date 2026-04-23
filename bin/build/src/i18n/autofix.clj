(ns i18n.autofix
  "Automatic corrections applied to parsed `.po` contents before validation and artifact
  generation. These fixes rescue translations that would otherwise fail `java.text.MessageFormat`
  parsing due to common translator mistakes — currently, unescaped apostrophes in word-adjacent
  positions (e.g. Catalan `d'aquí` becomes `d''aquí`).

  Applied only to backend messages. Frontend strings use ttag at runtime with different escaping
  rules and pass through unchanged.

  Runs once per locale, upstream of `i18n.validation/invalid-messages-in-po` and the backend/
  frontend artifact writers, so the validation scanner and artifact builders process the same data."
  (:require
   [clojure.string :as str]
   [i18n.common :as i18n]))

(set! *warn-on-reflection* true)

(def ^:private apostrophe-regex
  "Matches a single apostrophe surrounded by word-like characters (letters, digits, spaces,
  diacritics). Preserves apostrophes adjacent to non-word characters like `{` / `}` since those
  are typically intentional MessageFormat escapes (e.g. `'{0}'` meaning literal `{0}`)."
  #"(?<![^a-zA-Z0-9\s\u00C0-\u017F])'(?![^a-zA-Z0-9\s\u00C0-\u017F])")

(defn- escape-apostrophes [^String s]
  (when (some? s) (str/replace s apostrophe-regex "''")))

(defn- fix-apostrophes-in-message [message]
  (if (:plural? message)
    (update message :str-plural #(map escape-apostrophes %))
    (update message :str escape-apostrophes)))

(defn autofix-po-contents
  "Applies automatic fixes to the `:messages` in `po-contents`."
  [po-contents]
  (update po-contents :messages
          (fn [msgs]
            (map (fn [m]
                   (if (i18n/backend-message? m)
                     (fix-apostrophes-in-message m)
                     m))
                 msgs))))

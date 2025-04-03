(def ContentTranslationModel
  "Model for dictionary entries containing translations"
  [:enum "language" "msgid" "translation"])

(ns metabase.models.content-translation
  "A model representing dictionary entries for translations."
  (:require
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(doto :model/ContentTranslation
  (derive :metabase/model)
  (derive :hook/labelled?))

(methodical/defmethod t2/table-name :model/ContentTranslation [_model]
  :content_translation)

(defn get-column-display-names
  "List the display names of all columns"
  []
  (distinct (map :display_name
                 (t2/query {:select [:f.display_name]
                            :from [[(t2/table-name :model/Field) :f]]}))))

(defn get-table-display-names
  "List the display names of all tables"
  []
  (distinct (map :display_name
                 (t2/query {:select [:t.display_name]
                            :from [[(t2/table-name :model/Table) :t]]}))))

(defn get-field-values
  "List all field values"
  []
  (let [field-values (t2/query {:select [:fv.values]
                                :from [[(t2/table-name :model/FieldValues) :fv]]})]
    (->> field-values
         (map (comp json/decode str :values))
         (mapcat identity)
         (distinct))))

(defn get-all-display-names
  "Concatenate and return display names from columns, tables, and field values."
  []
  (let [column-names (get-column-display-names)
        table-names (get-table-display-names)
        field-values (get-field-values)
        all-names (concat column-names table-names field-values)]
    (distinct (filter string? all-names))))

(defn get-translations
  "List the translations stored in the content_translation table"
  []
  (t2/query {:select [:*]
             :from [[(t2/table-name :model/ContentTranslation) :t]]}))

; (defn translate-string
;   [msgid]
;   (let [translations (get-translations)
;         translation (some (fn [entry]
;                             (when (= msgid (:msgid entry))
;                               (:translation entry)))
;                           translations)]
;     (or translation msgid)))

(defn translate-string
  "Return the translation of the given string from the database, or if there is no translation, return the string itself. Currently the locale is hard-coded to French"
  [msgid]
  (let [result (t2/query {:select [:translation]
                          :from [[(t2/table-name :model/ContentTranslation) :t]]
                          :where [:and
                                  [:= :msgid msgid]
                                  [:= :language "fr"]]})
        translation (first result)
        ret (or (:translation translation) msgid)]
    (log/info (str "Translation lookup for msgid \"" msgid "\" resulted in: \"" ret "\""))
    ret))

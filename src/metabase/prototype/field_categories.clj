(ns metabase.prototype.field-categories
  "Prototype: an LLM groups the Fields of a Table into semantic categories, for the filter column picker.

  The categories must stay stable between syncs:

  - When the Fields of a Table did not change, there is no LLM call.
  - When Fields were only removed, they are removed from their categories. There is no LLM call.
  - When a few Fields were added, the LLM puts only the new Fields into categories. It can make a new category, and
    move existing Fields into it, only when the new category also gets a new Field. It cannot rename categories or
    move Fields between existing categories.
  - When many Fields changed (more than [[full-recategorize-ratio]]), or there are no categories yet, the LLM
    categorizes all the Fields again."
  (:require
   [clojure.string :as str]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.prototype.db :as prototype.db]
   [metabase.prototype.settings :as prototype.settings]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(def ^:private min-field-count
  "Tables with fewer Fields do not get categories."
  15)

(def ^:private full-recategorize-ratio
  "When more than this part of the Fields was added or removed, categorize all the Fields again."
  0.3)

(def ^:private other-category "Other")

(def ^:private response-schema
  "The structured-output schema of the adapters allows only one level of nesting, so each assignment is a string."
  {:type       "object"
   :properties {:assignments
                {:type        "array"
                 :description "One item for each column, in the format `<column id>|<category name>`, for example `12|Location`."
                 :items       {:type "string"}}}
   :required   ["assignments"]})

(def ^:private system-prompt
  "You group the columns of a database table into categories. The categories help a user find the column that they
want to filter on.

Rules:
- A category name is short (1 to 4 words), in Title Case, and tells what its columns are about. Examples:
  \"Subscription & Plan\", \"Location\", \"Identifiers\", \"Lifecycle Dates\".
- Usually make 3 to 10 categories. A category usually has at least 2 columns.
- Each column goes into exactly one category. When a column fits more than one category, choose the best one.
- Put columns that fit no category into a category with the name \"Other\".
- Use the column names, types and descriptions. Use the table name and description for context.
- Identify columns by their `id`.
- Return one assignment for each column, in the format `<column id>|<category name>`. List the assignments of a
  category together, and list the categories in a useful order: the most important first.")

;;; ------------------------------------------------ LLM calls ------------------------------------------------

(defn- field-info [{:keys [id name display_name description semantic_type base_type]}]
  (cond-> {:id id :name display_name :column name :type (some-> (or semantic_type base_type) clojure.core/name)}
    (not (str/blank? description)) (assoc :description description)))

(defn- table-info [{:keys [name display_name description]}]
  (cond-> {:name display_name :table name}
    (not (str/blank? description)) (assoc :description description)))

(defn- assignments->categories
  "Parse `<id>|<name>` assignments into categories `[{:name :field_ids}]`, in the order the names first appear."
  [assignments]
  (let [pairs (keep (fn [s]
                      (when-let [[_ id category] (re-matches #"\s*(\d+)\s*\|\s*(.*?)\s*" (str s))]
                        [(parse-long id) category]))
                    assignments)
        order (distinct (map second pairs))
        ids   (reduce (fn [m [id category]] (update m category (fnil conj []) id)) {} pairs)]
    (mapv (fn [category] {:name category :field_ids (ids category)}) order)))

(defn- call-llm [user-message]
  (assignments->categories
   (:assignments
    (metabot.self/call-llm-structured
     (metabot.settings/llm-mini-model)
     [{:role "system" :content system-prompt}
      {:role "user" :content user-message}]
     response-schema
     0
     4096
     ;; Prototype: "unknown", because the EE usage log rejects sources that it does not know.
     {:source              "unknown"
      :tag                 "prototype-field-categories"
      :required-permission :permission/metabot-other-tools}))))

(defn- full-categories-message [table fields]
  (str "Table:\n" (json/encode (table-info table))
       "\n\nColumns:\n" (json/encode (map field-info fields))
       "\n\nGroup all the columns into categories."))

(defn- incremental-categories-message [table fields-by-id categories new-fields]
  (str "Table:\n" (json/encode (table-info table))
       "\n\nThe existing columns are already in these categories:\n"
       (json/encode (for [{:keys [name field_ids]} categories]
                      {:name    name
                       :columns (for [id field_ids] (field-info (fields-by-id id)))}))
       "\n\nThese columns are new:\n" (json/encode (map field-info new-fields))
       "\n\nPut each new column into a category. Rules for this task:
- Prefer an existing category. Use its exact name.
- Do not rename the existing categories. Do not move existing columns between existing categories.
- You can make a new category when a new column does not fit an existing one. A new category must have at least 2
  columns. It can take existing columns from other categories, but only when the group is clearly better. Example:
  a new \"Address\" column and an existing \"Country\" column in \"Other\" can make a new \"Location\" category.
- Return assignments only for the new columns, and for the existing columns that move into a new category."))

;;; ------------------------------------------ validation and merging ------------------------------------------

(defn- other-last
  "Remove empty categories, merge categories with the same name, and put \"Other\" last."
  [categories]
  (let [merged (reduce (fn [acc {:keys [name field_ids]}]
                         (if-let [i (first (keep-indexed (fn [i c] (when (= (:name c) name) i)) acc))]
                           (update-in acc [i :field_ids] (comp vec distinct concat) field_ids)
                           (conj acc {:name name :field_ids (vec field_ids)})))
                       []
                       (remove (comp empty? :field_ids) categories))
        {others true, rest false} (group-by #(= other-category (:name %)) merged)]
    (vec (concat rest others))))

(defn- normalize-name [s]
  (let [s (str/trim (str s))]
    (if (str/blank? s) other-category s)))

(defn- full-categories
  "Each Field of `field-ids` goes into its first category in `response`. Unknown ids are dropped. The Fields that the
  LLM forgot, and the Fields of categories with only 1 Field, go into \"Other\"."
  [field-ids response]
  (let [valid    (set field-ids)
        [cats _] (reduce (fn [[cats seen] {:keys [name field_ids]}]
                           (let [ids (into [] (comp (filter valid) (remove seen) (distinct)) field_ids)]
                             [(conj cats {:name (normalize-name name) :field_ids ids})
                              (into seen ids)]))
                         [[] #{}]
                         response)
        cats     (remove #(and (= 1 (count (:field_ids %))) (not= other-category (:name %))) cats)
        assigned (set (mapcat :field_ids cats))
        missing  (remove assigned field-ids)]
    (other-last (conj (vec cats) {:name other-category :field_ids (vec missing)}))))

(defn- incremental-categories
  "Merge the LLM `response` for `new-ids` into the existing `categories`, and keep the rules in the namespace
  docstring. Changes that break the rules are ignored."
  [categories new-ids response]
  (let [existing-names (set (map :name categories))
        new-id?        (set new-ids)
        existing-id?   (set (mapcat :field_ids categories))
        response       (map #(update % :name normalize-name) response)
        ;; New categories: they must get a new Field and have at least 2 Fields.
        [new-cats taken] (reduce (fn [[cats taken] {:keys [name field_ids]}]
                                   (if (contains? existing-names name)
                                     [cats taken]
                                     (let [ids (into [] (comp (filter #(or (new-id? %) (existing-id? %)))
                                                              (remove taken)
                                                              (distinct))
                                                     field_ids)]
                                       (if (and (>= (count ids) 2) (some new-id? ids))
                                         [(conj cats {:name name :field_ids ids}) (into taken ids)]
                                         [cats taken]))))
                                 [[] #{}]
                                 response)
        ;; Existing categories: they can only get new Fields.
        [additions taken] (reduce (fn [[additions taken] {:keys [name field_ids]}]
                                    (if (contains? existing-names name)
                                      (let [ids (into [] (comp (filter new-id?) (remove taken) (distinct)) field_ids)]
                                        [(update additions name (fnil into []) ids) (into taken ids)])
                                      [additions taken]))
                                  [{} taken]
                                  response)
        unassigned (remove taken new-ids)
        updated    (for [{:keys [name field_ids]} categories]
                     {:name      name
                      :field_ids (into (vec (remove taken field_ids)) (get additions name))})]
    (other-last (concat updated new-cats [{:name other-category :field_ids (vec unassigned)}]))))

(defn- order-by-table
  "Sort the Fields of each category in table order."
  [categories field-ids]
  (let [position (zipmap field-ids (range))]
    (mapv #(update % :field_ids (fn [ids] (vec (sort-by position ids)))) categories)))

;;; --------------------------------------------------- storage ---------------------------------------------------

(defn all-categories
  "The stored categories of all Tables, as a list of `{:table_id :field_ids :categories}`."
  []
  (vec (prototype.settings/prototype-field-categories)))

(defn- stored-entry [table-id]
  (some #(when (= table-id (:table_id %)) %) (all-categories)))

(defn- store-entry! [table-id entry]
  (prototype.settings/prototype-field-categories!
   (cond-> (vec (remove #(= table-id (:table_id %)) (all-categories)))
     entry (conj (assoc entry :table_id table-id)))))

;;; ------------------------------------------------- entry points ------------------------------------------------

(defn categorize-table!
  "Update the categories of the Table with `table-id` after its Fields changed, and return what was done. With
  `force?`, categorize all the Fields again."
  ([table-id]
   (categorize-table! table-id false))
  ([table-id force?]
   (let [table     (prototype.db/table-for-categories table-id)
         fields    (prototype.db/fields-for-categories table-id)
         field-ids (mapv :id fields)
         stored    (stored-entry table-id)
         old-ids   (set (:field_ids stored))
         new-ids   (vec (remove old-ids field-ids))
         removed   (remove (set field-ids) old-ids)
         changed   (+ (count new-ids) (count removed))
         save!     (fn [action categories]
                     (store-entry! table-id {:field_ids field-ids :categories (order-by-table categories field-ids)})
                     {:table_id table-id :action action})]
     (cond
       (nil? table)
       {:table_id table-id :action :not-found}

       (< (count fields) min-field-count)
       (do (when stored (store-entry! table-id nil))
           {:table_id table-id :action :too-few-fields})

       (and (not force?) stored (zero? changed))
       {:table_id table-id :action :unchanged}

       (or force? (nil? stored) (> changed (* full-recategorize-ratio (count field-ids))))
       (save! :full (full-categories field-ids (call-llm (full-categories-message table fields))))

       (empty? new-ids)
       (save! :removed-fields
              (other-last (for [c (:categories stored)]
                            (update c :field_ids #(vec (filter (set field-ids) %))))))

       :else
       (let [kept       (for [c (:categories stored)]
                          (update c :field_ids #(vec (filter (set field-ids) %))))
             kept       (remove (comp empty? :field_ids) kept)
             fields-by-id (zipmap field-ids fields)
             new-fields (map fields-by-id new-ids)]
         (save! :incremental
                (incremental-categories
                 kept new-ids
                 (call-llm (incremental-categories-message table fields-by-id kept new-fields)))))))))

(defn categorize-database!
  "Update the categories of all the active Tables of the Database with `database-id`. Errors of one Table are logged,
  and do not stop the others."
  [database-id]
  (when (metabot.self/llm-call-available? :permission/metabot-other-tools)
    (vec (for [table-id (prototype.db/active-table-ids database-id)]
           (try
             (let [result (categorize-table! table-id)]
               (log/infof "Prototype field categories: Table %d: %s" table-id (name (:action result)))
               result)
             (catch Throwable e
               (log/errorf e "Prototype field categories: Table %d failed" table-id)
               {:table_id table-id :action :error}))))))

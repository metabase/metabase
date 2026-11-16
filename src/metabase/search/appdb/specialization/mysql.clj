(ns metabase.search.appdb.specialization.mysql
  "MySQL and MariaDB full-text search with unstemmed, case-insensitive, accent-sensitive word matching."
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.db :as search.db]
   [metabase.search.util :as search.util]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]))

(set! *warn-on-reflection* true)

(defn- text-column [column]
  [column :longtext [:character-set :utf8mb4] [:collate :utf8mb4_bin]])

(defn- base-column [[column data-type & options]]
  (into [column (cond
                  (= column :model_id)                    [:varchar 64]
                  (= data-type :text)                     :longtext
                  (= data-type :timestamp-with-time-zone) [:timestamp 6]
                  :else                                   data-type)]
        (if (= column :created_at)
          [[:default [:now [:inline 6]]] :not-null]
          options)))

(defmethod specialization/table-schema :mysql [base-schema]
  (into [[:id :bigint :auto-increment :primary-key]
         (text-column :prefix_terms)
         (text-column :name_terms)
         (text-column :search_terms)
         (text-column :native_search_terms)]
        (map base-column)
        base-schema))

(defmethod specialization/post-create-statements :mysql [prefix table-name]
  (mapv #(format % prefix table-name)
        ["CREATE UNIQUE INDEX %s_identity_idx ON %s (model, model_id)"
         "CREATE FULLTEXT INDEX %s_text_idx ON %s (search_terms)"
         "CREATE FULLTEXT INDEX %s_native_text_idx ON %s (native_search_terms)"
         "CREATE FULLTEXT INDEX %s_name_idx ON %s (name_terms)"
         "CREATE FULLTEXT INDEX %s_prefix_idx ON %s (prefix_terms)"
         "CREATE INDEX %s_model_archived_idx ON %s (model, archived)"
         "CREATE INDEX %s_archived_idx ON %s (archived)"]))

(defmethod specialization/batch-upsert! :mysql [table entries]
  (search.db/mysql-batch-upsert! table entries))

(defn- normalize-text [text]
  (-> text u/lower-case-en (str/replace #"[_']" " ")))

(def ^:private token-limits
  (mdb/memoize-for-application-db search.db/mysql-fulltext-options))

(def ^:private field-markers
  {:name_terms "n", :search_terms "s", :native_search_terms "q"})

(defn- character-count [^String text]
  (.codePointCount text 0 (.length text)))

(defn- truncate-word [^String word limit]
  (.substring word 0 (.offsetByCodePoints word 0 (min limit (character-count word)))))

(defn- entry-fields [entity max-size]
  (let [name-terms   (normalize-text (or (:name entity) ""))
        search-terms (normalize-text (str/join " " (keep entity [:name :searchable_text])))
        fields       {:name_terms          name-terms
                      :search_terms        search-terms
                      :native_search_terms (str search-terms
                                                (when-some [native (:native_query entity)]
                                                  (str " " (normalize-text native))))}]
    ;; A field marker keeps title, body, and native matches separate in one prefix index.
    ;; Truncate before indexing so prefixes can find words beyond InnoDB's maximum token size.
    (assoc fields :prefix_terms
           (str/join " " (distinct (for [[field text] fields
                                         word (re-seq #"[\p{L}\p{N}]+" text)]
                                     (str (field-markers field) (truncate-word word (dec max-size)))))))))

(defmethod specialization/extra-entry-fields :mysql [entity]
  (entry-fields entity (:max_size (token-limits))))

(defn- query-options []
  (assoc (token-limits) :in-transaction? (mdb/in-transaction?)))

(defn- words [text]
  (re-seq #"[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*" text))

(defn- query-terms [search-string]
  (let [clauses (search.util/search-clauses search-string)
        prefix? (not (str/ends-with? (str/trim (or search-string "")) "\""))]
    (mapv (fn [clause-index clause]
            (mapv (fn [term-index term]
                    (let [negated? (boolean (re-find #"^-\w" term))]
                      {:tokens   (vec (words (if negated? (subs term 1) term)))
                       :phrase?  (str/starts-with? term "\"")
                       :negated? negated?
                       :prefix?  (and prefix? (= clause-index (dec (count clauses)))
                                      (= term-index (dec (count clause))))}))
                  (range) clause))
          (range) clauses)))

(defn- regexp-match [column term-words phrase? prefix?]
  (let [boundary "[^[:alnum:]_]"
        patterns (if phrase? [term-words] (map vector term-words))]
    (into [:and]
          (map-indexed
           (fn [i tokens]
             [:regexp [::h2x/collate column :utf8mb4_bin]
              (str "(^|" boundary ")" (str/join (str boundary "+") tokens)
                   (when-not (and prefix? (= i (dec (count patterns))))
                     (str "(" boundary "|$)")))])
           patterns))))

(defn- scan-required? [{:keys [tokens phrase? prefix?]} {:keys [min_size max_size in-transaction?]}]
  ;; Full-text indexes hide uncommitted writes and cannot represent partial phrases or hyphenated words.
  ;; The prefix index reserves one character for its field marker.
  (or in-transaction?
      (some #(str/includes? % "-") tokens)
      (some #(< (character-count %) min_size) tokens)
      (some #(> (character-count %) (if (and prefix? (not phrase?)) (dec max_size) max_size)) tokens)
      (and phrase? prefix?)))

(defn- term-query [{:keys [tokens phrase?]}]
  (if phrase?
    (str "\"" (str/join " " tokens) "\"")
    (str/join " " (map #(str "+" %) tokens))))

(defn- indexed-match [column {:keys [tokens phrase? prefix?], :as term}]
  (if (and prefix? (not phrase?))
    (let [marker (field-markers (keyword (last (str/split (name column) #"\."))))
          prefix [:> [:match-against :search_index.prefix_terms (str "+" marker (peek tokens) "*")] 0]]
      (if (> (count tokens) 1)
        [:and [:> [:match-against column (term-query (assoc term :tokens (pop tokens)))] 0] prefix]
        prefix))
    [:> [:match-against column (term-query term)] 0]))

(defn- term-match [column {:keys [tokens phrase? prefix? negated?], :as term} options]
  (let [predicate (cond
                    (empty? tokens)               [:= 1 0]
                    (scan-required? term options) (regexp-match column tokens phrase? prefix?)
                    :else                        (indexed-match column term))]
    (if negated? [:not predicate] predicate)))

(defn- matching-clause [column clause options]
  (into [:and] (map #(term-match column % options) clause)))

(defmethod specialization/base-query :mysql [active-table search-string search-ctx select-items]
  (let [column (if (:search-native-query search-ctx) :search_index.native_search_terms :search_index.search_terms)]
    (cond-> {:select select-items
             :from   [[active-table :search_index]]}
      (not (str/blank? search-string))
      (assoc :where (let [clauses (query-terms search-string)
                          options (query-options)]
                      (if (seq clauses)
                        (into [:or] (map #(matching-clause column % options) clauses))
                        [:= 1 0]))))))

(defmethod specialization/text-score :mysql [{:keys [search-string]}]
  (let [positive-terms (remove :negated? (mapcat identity (query-terms search-string)))
        options       (when (seq positive-terms) (query-options))
        term-score    (fn [column term]
                        [:case (term-match column term options) 1 :else 0])]
    (if (seq positive-terms)
      ;; As with PostgreSQL's A/B weights, title hits carry more weight than other searchable fields.
      ;; Native query text affects matching, but does not contribute to the text score.
      (into [:+] (mapcat (fn [term]
                           [(term-score :search_index.name_terms term)
                            [:* 0.4 (term-score :search_index.search_terms term)]])
                         positive-terms))
      [:inline 0])))

(defmethod specialization/view-count-percentile-query :mysql [index-table p-value]
  (let [position [:+ 1 [:* [:- :n 1] [:inline p-value]]]
        lower    [:max [:case [:= :rn [:floor position]] :view_count]]
        upper    [:max [:case [:= :rn [:ceil position]] :view_count]]]
    {:select   [:model [[:+ lower [:* [:- [:max position] [:floor [:max position]]] [:- upper lower]]] :vcp]]
     :from     [[^{:allow-subquery true}
                 {:select [:model :view_count
                           [[:over [[:row_number]
                                    ^{:allow-subquery true}
                                    {:partition-by [:model]
                                     :order-by     [:view_count]}]] :rn]
                           [[:over [[:count :*] ^{:allow-subquery true} {:partition-by [:model]}]] :n]]
                  :from   [index-table]
                  :where  [:not= :view_count nil]}
                 :ranked]]
     :group-by [:model]}))

(defmethod specialization/index-size-estimate :mysql [table-name]
  (search.db/index-entry-count table-name))

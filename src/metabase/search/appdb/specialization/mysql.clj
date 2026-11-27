(ns metabase.search.appdb.specialization.mysql
  "MySQL and MariaDB full-text search with unstemmed, case-insensitive, accent-sensitive word matching."
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.db :as search.db]
   [metabase.search.ingestion.query :as search.ingestion.query]
   [metabase.search.util :as search.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.string :as u.str])
  (:import
   (com.google.common.base Utf8)))

(set! *warn-on-reflection* true)

(defn- text-column [column]
  [column :longtext [:character-set :utf8mb4] [:collate :utf8mb4_bin]])

(defn- base-column [[column data-type & options]]
  (into [column (cond
                  (= column :model_id)                    [:varchar 64]
                  (= data-type :text)                     :longtext
                  (= data-type :boolean)                  :bit
                  (= data-type :timestamp-with-time-zone) [:timestamp 6]
                  :else                                   data-type)]
        (cond
          (= column :created_at)
          [[:default [:now [:inline 6]]] :not-null]

          ;; With `explicit_defaults_for_timestamp` off, the MariaDB 10.6 default, a `TIMESTAMP` column without `NULL`
          ;; is `NOT NULL` and stores the write time or a zero date in place of NULL.
          (and (= data-type :timestamp-with-time-zone) (not (some #{:not-null} options)))
          (conj (vec options) :null)

          :else
          options)))

(defmethod specialization/table-schema :mysql [base-schema]
  (into [[:id :bigint :auto-increment :primary-key]
         (text-column :prefix_terms)
         (text-column :name_terms)
         (text-column :search_terms)
         (text-column :native_search_terms)]
        (map base-column)
        base-schema))

;; Liquibase creates the app DB's tables with this charset and collation, so the index joins them without conversion.
(defmethod specialization/table-options :mysql []
  {:engine :innodb, :character-set :utf8mb4, :collate :utf8mb4_unicode_ci})

;; Full-text indexes take their stopword setting from the session that creates them, and search keeps stopwords.
(defmethod specialization/with-table-creation-settings :mysql [thunk]
  (let [stopwords? (pos? (:stopwords (search.db/mysql-fulltext-options)))]
    (try
      (search.db/set-mysql-fulltext-stopwords! false)
      (thunk)
      (finally
        (search.db/set-mysql-fulltext-stopwords! stopwords?)))))

(def ^:private index-statements
  "The suffix of each index name, and the statement that creates the index from its name and the table name."
  [["identity_idx"       "CREATE UNIQUE INDEX %s ON %s (model, model_id)"]
   ["text_idx"           "CREATE FULLTEXT INDEX %s ON %s (search_terms)"]
   ["native_text_idx"    "CREATE FULLTEXT INDEX %s ON %s (native_search_terms)"]
   ["name_idx"           "CREATE FULLTEXT INDEX %s ON %s (name_terms)"]
   ["prefix_idx"         "CREATE FULLTEXT INDEX %s ON %s (prefix_terms)"]
   ["model_archived_idx" "CREATE INDEX %s ON %s (model, archived)"]
   ["archived_idx"       "CREATE INDEX %s ON %s (archived)"]])

(defn- index-name [prefix suffix]
  (str prefix "_" suffix))

(defmethod specialization/post-create-statements :mysql [prefix table-name]
  (mapv (fn [[suffix statement]] (format statement (index-name prefix suffix) table-name)) index-statements))

;; Each statement commits on its own, so a process killed while creating the table leaves it without some indexes.
;; Not every rebuild holds the cluster lock, so another node may still be creating a table that lacks indexes. Creating
;; an empty table and its indexes takes seconds, so one this old is abandoned.
(def ^:private abandoned-after-minutes 5)

(defmethod specialization/table-complete? :mysql [table-name]
  (let [table-name (name table-name)
        existing   (into #{} (map u/lower-case-en) (search.db/mysql-index-names table-name))]
    (every? #(contains? existing (u/lower-case-en (index-name table-name (first %)))) index-statements)))

(defmethod specialization/table-abandoned? :mysql [table-name]
  (and (not (specialization/table-complete? table-name))
       (search.db/mysql-table-older-than? (name table-name) abandoned-after-minutes)))

(def ^:private max-allowed-packet
  (mdb/memoize-for-application-db #(search.db/mysql-max-allowed-packet)))

(defn- entry-bytes [entry]
  (transduce (map (fn [v] (if (string? v) (Utf8/encodedLength ^String v) 16))) + (vals entry)))

(defn- byte-batches
  "The `entries` in order, split into batches whose strings add up to at most `budget` bytes.
  An entry larger than `budget` gets a batch of its own."
  [budget entries]
  (let [[batches batch] (reduce (fn [[batches batch size] entry]
                                  (let [n (entry-bytes entry)]
                                    (if (and (seq batch) (> (+ size n) budget))
                                      [(conj batches batch) [entry] n]
                                      [batches (conj batch entry) (+ size n)])))
                                [[] [] 0]
                                entries)]
    (cond-> batches (seq batch) (conj batch))))

(defn- packet-too-large? [e]
  (boolean (some #(some->> (ex-message %) (re-find #"max_allowed_packet")) (take-while some? (iterate ex-cause e)))))

(defmethod specialization/batch-upsert! :mysql [table entries]
  ;; The server rejects a statement larger than `max_allowed_packet`, 16 MiB by default on MariaDB, and the whole
  ;; batch fails with it. A quarter of the limit leaves room for escaping and the rest of the statement.
  (when (seq entries)
    (doseq [batch (byte-batches (quot (max-allowed-packet) 4) entries)]
      (try
        (search.db/mysql-batch-upsert! table batch)
        (catch Exception e
          ;; A document whose row alone is too large is left out, rather than the documents after it.
          (if (and (= 1 (count batch)) (packet-too-large? e))
            (let [{:keys [model model_id]} (first batch)]
              (log/warnf "Skipping search document %s %s: its index row is larger than max_allowed_packet"
                         model model_id))
            (throw e)))))))

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

(def ^:private word-chars
  "Letters, combining marks, and digits. Marks keep words in scripts such as Devanagari whole."
  "\\p{L}\\p{M}\\p{N}")

(def ^:private word-regex
  "A letter or digit, then any letters, combining marks, and digits.
  A combining mark alone, such as the variation selector after an emoji, is not a word."
  (str "[\\p{L}\\p{N}][" word-chars "]*"))

(def ^:private index-word-pattern
  (re-pattern word-regex))

(defn- bounded-text
  "The normalized `text`, cut to the byte limit PostgreSQL also applies to searchable text."
  [text]
  (u.str/limit-bytes (normalize-text text) search.ingestion.query/max-searchable-value-length))

(defn- entry-fields [entity max-size]
  (let [name-terms   (bounded-text (or (:name entity) ""))
        search-terms (bounded-text (str/join " " (keep entity [:name :searchable_text])))
        fields       {:name_terms          name-terms
                      :search_terms        search-terms
                      :native_search_terms (str search-terms
                                                (when-some [native (:native_query entity)]
                                                  (str " " (bounded-text native))))}]
    ;; A field marker keeps title, body, and native matches separate in one prefix index.
    ;; Truncate before indexing so prefixes can find words beyond InnoDB's maximum token size.
    (assoc fields :prefix_terms
           (str/join " " (distinct (for [[field text] fields
                                         word (re-seq index-word-pattern text)]
                                     (str (field-markers field) (truncate-word word (dec max-size)))))))))

(defmethod specialization/extra-entry-fields :mysql [entity]
  (entry-fields entity (:max_size (token-limits))))

(defn- query-options []
  (assoc (token-limits) :in-transaction? (mdb/in-transaction?)))

(def ^:private word-pattern
  (re-pattern (format "%1$s(?:-%1$s)*" word-regex)))

(defn- words [text]
  (re-seq word-pattern text))

(defn- parse-term [term]
  (let [negated? (search.util/negated-term? term)]
    {:tokens   (vec (words (if negated? (subs term 1) term)))
     :phrase?  (str/starts-with? term "\"")
     :negated? negated?}))

(defn- query-terms [search-string]
  ;; A term with no words, such as "&", cannot match anything, so it is dropped rather than emptying its clause.
  (let [clauses (into []
                      (keep #(not-empty (into [] (comp (map parse-term) (filter (comp seq :tokens))) %)))
                      (search.util/search-clauses search-string))
        prefix? (not (str/ends-with? (str/trim (or search-string "")) "\""))]
    (cond-> (mapv (fn [clause] (mapv #(assoc % :prefix? false) clause)) clauses)
      (and prefix? (seq clauses))
      (assoc-in [(dec (count clauses)) (dec (count (peek clauses))) :prefix?] true))))

(defn- regexp-match [column term-words phrase? prefix?]
  (let [boundary (str "[^" word-chars "_]")
        patterns (if phrase? [term-words] (map vector term-words))]
    (into [:and]
          (map-indexed
           (fn [i tokens]
             [:regexp [:collate column :utf8mb4_bin]
              (str "(^|" boundary ")" (str/join (str boundary "+") tokens)
                   (when-not (and prefix? (= i (dec (count patterns))))
                     (str "(" boundary "|$)")))])
           patterns))))

(defn- scan-required? [{:keys [tokens phrase? prefix?]} {:keys [min_size max_size in-transaction?]}]
  ;; Full-text indexes hide uncommitted writes and cannot represent partial phrases or hyphenated words.
  ;; Only the final prefix token uses the extra field marker; exact tokens use the original full-text column.
  (or in-transaction?
      (some #(str/includes? % "-") tokens)
      (some (fn [[i token]]
              (let [marked? (and prefix? (not phrase?) (= i (dec (count tokens))))
                    size    (+ (character-count token) (if marked? 1 0))]
                (not (<= min_size size max_size))))
            (map-indexed vector tokens))
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
  (let [predicate (if (scan-required? term options)
                    (regexp-match column tokens phrase? prefix?)
                    (indexed-match column term))]
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
      ;; Dividing by the maximum keeps the score between 0 and 1 for any number of terms.
      [:/
       (into [:+] (mapcat (fn [term]
                            [(term-score :search_index.name_terms term)
                             [:* 0.4 (term-score :search_index.search_terms term)]])
                          positive-terms))
       [:inline (* 1.4 (count positive-terms))]]
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

(defmethod specialization/analyze-table! :mysql [table-name]
  ;; ANALYZE TABLE commits implicitly on MySQL; never commit the caller's transaction to refresh a metric.
  (when-not (mdb/in-transaction?)
    (search.db/analyze-mysql-search-index-table! table-name)))

(defmethod specialization/index-size-estimate :mysql [table-name]
  (some-> (search.db/mysql-table-statistics (name table-name)) :table_rows long))

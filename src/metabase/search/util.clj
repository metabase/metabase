(ns metabase.search.util
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as mdb]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.settings :as search.settings]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.string :as u.str]
   [toucan2.core :as t2]))

(defn impossible-condition?
  "An (incomplete) check where queries will definitely return nothing, to help avoid spurious index update queries."
  [where]
  (when (vector? where)
    (case (first where)
      :=   (let [[a b] (rest where)]
             (and (string? a) (string? b) (not= a b)))
      :!=  (let [[a b] (rest where)]
             (and (string? a) (string? b) (= a b)))
      :and (boolean (some impossible-condition? (rest where)))
      :or  (every? impossible-condition? (rest where))
      false)))

(defn- explode-multipart-ids
  "Split integer IDs from a `multi-part-id-string` like \"123:456\" => (\"123\" \"456\")"
  [multi-part-id-string]
  (str/split multi-part-id-string #":"))

(defn indexed-entity-id->model-index-id
  "Extract the model-index-id from a composite indexed-entity id like <model-index-id>:<model-pk>"
  [indexed-entity-id]
  (-> (explode-multipart-ids indexed-entity-id)
      first
      parse-long))

(defn indexed-entity-id->model-pk
  "Extract the model-pk from a composite indexed-entity id like <model-index-id>:<model-pk>"
  [indexed-entity-id]
  (-> (explode-multipart-ids indexed-entity-id)
      last
      parse-long))

(defn collapse-id
  "Collapse the id of search results that may contain multiple ids (like indexed-entities)."
  [{:keys [id] :as row}]
  (assoc row :id (if (number? id) id (indexed-entity-id->model-pk id))))

;;; ============================================================================
;;; Postgres-specific utilities
;;; ============================================================================

(def ^:private available-tsv-languages
  "Mapping of our available locals to the names of the postgres tsvector languages.
  Queries the pg_ts_config table to find out which languages are actually available."
  (if (= :postgres (mdb/db-type))
    (let [default-mapping {:ar    :arabic
                           :ar_SA :arabic
                           :ca    :catalan
                           :da    :danish
                           :en    :english
                           :fi    :finnish
                           :fr    :french
                           :de    :german
                           :hu    :hungarian
                           :id    :indonesian
                           :it    :italian
                           :nb    :norwegian
                           :pt_BR :portuguese
                           :ru    :russian
                           :sr    :serbian
                           :es    :spanish
                           :sv    :swedish
                           :tr    :turkish}
          available-languages (->> (t2/query {:select [:cfgname]
                                              :from   [:pg_ts_config]})
                                   (map :cfgname)
                                   (map keyword)
                                   set)]
      (into {} (filter (comp available-languages val) default-mapping)))
    {}))

(defn tsv-language
  "Get the appropriate text search configuration language for Postgres tsvector operations."
  []
  (if-let [custom-language (search.settings/search-language)]
    custom-language
    (if-let [lang ((keyword (i18n/site-locale-string)) available-tsv-languages)]
      (name lang)
      "simple")))

(defn- quote* [s]
  (str "'" (str/replace s "'" "''") "'"))

(defn- process-phrase [word-or-phrase]
  ;; a phrase is quoted even if the closing quotation mark has not been typed yet
  (cond
    ;; trailing quotation mark
    (= word-or-phrase "\"") nil
    ;; quoted phrases must be matched sequentially
    (str/starts-with? word-or-phrase "\"")
    (as-> word-or-phrase <>
      ;; remove the quote mark(s)
      (str/replace <> #"^\"|\"$" "")
      (str/trim <>)
      (str/split <> #"\s+")
      (map quote* <>)
      (str/join " <-> " <>))

    ;; negation
    (re-find #"^-\w" word-or-phrase)
    (str "!" (quote* (subs word-or-phrase 1)))

    ;; just a regular word
    :else
    (quote* word-or-phrase)))

(defn- split-preserving-quotes
  "Break up the words in the search input, preserving quoted and partially quoted segments."
  [s]
  (re-seq #"\"[^\"]*(?:\"|$)|[^\s\"]+|\s+" (u/lower-case-en s)))

(defn- process-clause [words-and-phrases]
  (->> words-and-phrases
       (remove #{"and"})
       (map process-phrase)
       (remove str/blank?)
       (str/join " & ")))

(defn- complete-last-word
  "Add wildcards at the end of the final word, so that we match ts completions."
  [expression]
  (str/replace expression #"(\S+)(?=\s*$)" "$1:*"))

(defn to-tsquery-expr
  "Given the user input, construct a query in the Postgres tsvector query language."
  [input]
  (str
   (when input
     (let [trimmed        (str/trim input)
           complete?      (not (str/ends-with? trimmed "\""))
           ;; TODO also only complete if the :context is appropriate
           maybe-complete (if complete? complete-last-word identity)]
       (->> (str/replace trimmed "\\" "\\\\")
            split-preserving-quotes
            (remove str/blank?)
            (partition-by #{"or"})
            (remove #(= (first %) "or"))
            (map process-clause)
            (remove str/blank?)
            (str/join " | ")
            maybe-complete)))))

(defn weighted-tsvector
  "Create a weighted tsvector for Postgres full-text search with the given weight and text."
  ([weight text]
   (weighted-tsvector weight text (tsv-language)))
  ([weight text lang]
   ;; tsvector has a max value size of 1048575 bytes, limit to less than that because the multiple values get concatenated together
   [:setweight [:to_tsvector [:inline lang] [:cast (u.str/limit-bytes text search.ingestion/max-searchable-value-length) :text]] [:inline weight]]))

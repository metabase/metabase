(ns metabase.metabot.tools.sql.edit
  "Tool for editing existing SQL queries."
  (:require
   [clojure.string :as str]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.runtime :as tools.runtime]
   [metabase.metabot.tools.sql.common :as metabot.tools.sql.common]
   [metabase.metabot.tools.sql.validation :as metabot.tools.sql.validation]
   [metabase.metabot.util :as metabot.u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.quoting :as quoting]))

(set! *warn-on-reflection* true)

(def ^:private edit-error-payload
  [:map {:closed true}
   [:query-id :string]
   [:sql :string]
   [:earlier-edits? :boolean]
   [:edit-index :int]
   [:old-string :string]])

(defn- match-spans
  [pattern sql]
  (let [matcher (re-matcher pattern sql)]
    (loop [spans []]
      (if (.find matcher)
        (recur (conj spans [(.start matcher) (.end matcher)]))
        spans))))

(defn- normalized-match-text
  [^String text]
  (let [builder (StringBuilder.)]
    (loop [position 0 offsets (transient [])]
      (if (< position (.length text))
        (let [code-point (.codePointAt text (int position))
              next-position (+ position (Character/charCount code-point))]
          (if (or (Character/isWhitespace code-point) (Character/isSpaceChar code-point) (= code-point 0x85))
            (recur next-position offsets)
            (do
              (.appendCodePoint builder (Character/toLowerCase (Character/toUpperCase code-point)))
              (recur next-position (conj! offsets position)))))
        {:text (str builder) :offsets (persistent! offsets)}))))

(defn- closest-span
  "Find stored text differing only in case and whitespace. This is a hint, never an edit."
  [^String sql old-string]
  (let [^String needle (:text (normalized-match-text old-string))]
    (when (seq needle)
      (let [{^String text :text offsets :offsets} (normalized-match-text sql)
            index (.indexOf text needle)]
        (when-not (neg? index)
          (let [start (.codePointCount text 0 index)
                last-index (+ start (.codePointCount needle 0 (.length needle)) -1)
                last-offset (int (nth offsets last-index))]
            [(nth offsets start) (+ last-offset (Character/charCount (.codePointAt sql last-offset)))]))))))

(defn- line-starts
  [sql]
  (int-array (cons 0 (map (comp inc first) (match-spans #"\n" sql)))))

(defn- location
  [^ints starts position]
  (let [found (java.util.Arrays/binarySearch starts (int position))
        index (if (neg? found) (- (- found) 2) found)]
    {:line (inc index) :column (inc (- position (aget starts index)))}))

(defn- excerpt-ranges
  [length positions radius]
  (reduce (fn [ranges position]
            (let [start (max 0 (- position radius))
                  end (min length (+ position radius))
                  [previous-start previous-end] (peek ranges)]
              (if (and previous-end (<= start previous-end))
                (conj (pop ranges) [previous-start (max end previous-end)])
                (conj ranges [start end]))))
          [] (sort positions)))

(defn- excerpt-text
  [sql ranges]
  (let [[parts end] (reduce (fn [[parts previous-end] [start end]]
                              [(cond-> parts
                                 (< previous-end start)
                                 (conj (str "[... " (- start previous-end) " SQL characters omitted ...]"))
                                 true (conj (subs sql start end)))
                               end])
                            [[] 0] ranges)]
    (apply str (cond-> parts
                 (< end (count sql))
                 (conj (str "[... " (- (count sql) end) " SQL characters omitted ...]"))))))

(defn- quoted-sql-context
  "Budget the escaped text, not the raw SQL, so recovery survives the runtime's 4,000-character cap."
  [sql spans budget]
  (let [full (quoting/quoted sql)]
    (if (<= (count full) budget)
      full
      (let [selected (if (> (count spans) 3)
                       [(first spans) (nth spans (quot (count spans) 2)) (peek spans)]
                       spans)
            positions (if (seq selected) (mapcat identity selected) [0 (count sql)])]
        (loop [low 0 high (long (max 0 (min (count sql) budget))) result ""]
          (if (> low high)
            result
            (let [radius (quot (+ low high) 2)
                  excerpt (quoting/quoted (excerpt-text sql (excerpt-ranges (count sql) positions radius)))]
              (if (<= (count excerpt) budget)
                (recur (inc radius) high excerpt)
                (recur low (dec radius) result)))))))))

(defn- line-runs
  "Consecutive lines with the same number of matches share one range."
  [lines]
  (reduce (fn [runs group]
            (let [line (first group)
                  matches (count group)
                  [start end previous-matches] (peek runs)]
              (if (and end (= line (inc end)) (= matches previous-matches))
                (conj (pop runs) [start line matches])
                (conj runs [line line matches]))))
          [] (partition-by identity lines)))

(defn- match-lines
  [starts spans]
  (let [lines (map #(:line (location starts (first %))) spans)
        full (str/join ", " lines)]
    (if (<= (count full) 1400)
      full
      (loop [remaining (seq (line-runs lines)) text "" shown 0]
        (if-let [[start end matches] (first remaining)]
          (let [range? (not= start end)
                part (str start (when range? (str "-" end))
                          (when (or range? (> matches 1))
                            (str " (" matches (if (= matches 1) " match" " matches")
                                 (when range? " per line") ")")))
                next-text (str text (when (seq text) ", ") part)]
            (if (> (count next-text) 1400)
              (str text "; " (- (count spans) shown) " further match locations omitted")
              (recur (next remaining) next-text (+ shown (long (* matches (inc (- end start))))))))
          text)))))

(defn- edit-failure
  [{:keys [query-id sql earlier-edits? edit-index old-string]} ambiguous? recovery]
  (let [spans (if ambiguous?
                (match-spans (re-pattern (java.util.regex.Pattern/quote old-string)) sql)
                (some-> (closest-span sql old-string) vector))
        starts (line-starts sql)
        closest (first spans)
        prefix (str "Edit " edit-index " for query "
                    (metabot.tools.sql.common/bounded-quote query-id 128) ": "
                    (if ambiguous? "text to replace found multiple times." "text to replace not found.")
                    (when (and (not ambiguous?) closest)
                      (str " Closest match ignoring case and whitespace at line " (:line (location starts (first closest)))
                           ": " (metabot.tools.sql.common/bounded-quote (subs sql (first closest) (second closest)) 1024)
                           " (not applied)."))
                    (when ambiguous? (str " Match lines: " (match-lines starts spans) "."))
                    " No edits were saved. "
                    (when earlier-edits? "The SQL below includes earlier unsaved edits in this call. ")
                    "SQL for this edit: ")
        ;; Include every recovery alternative plus newline separators in this budget. Profiles can only remove steps.
        budget (- tools.runtime/max-output-length (count prefix) (reduce + (map (comp inc count :text) recovery)))]
    {:message (str prefix (quoted-sql-context sql spans budget))
     :recovery recovery}))

(tools/defrecoverable edit-not-found!
  "An edit's old text is absent from the SQL at that step."
  {:payload edit-error-payload}
  [payload]
  (edit-failure payload false
                [{:uses #{} :text (str "Use the exact stored text, including case and whitespace. Revise the edits and "
                                       "retry the complete edit list, including earlier edits in this call.")}
                 {:uses #{"replace_sql_query"}
                  :text "Or use `replace_sql_query` with the complete corrected SQL."}]))

(tools/defrecoverable edit-ambiguous!
  "An edit's old text matches more than once without replace_all."
  {:payload edit-error-payload}
  [payload]
  (edit-failure payload true
                [{:uses #{} :text (str "Include enough surrounding SQL to match once, or set replace_all to true "
                                       "if every occurrence should change. Retry the complete edit list, including earlier edits.")}
                 {:uses #{"replace_sql_query"}
                  :text "Or use `replace_sql_query` with the complete corrected SQL."}]))

(tools/defrecoverable empty-edits!
  "An edit call contains no edits."
  {:payload [:map {:closed true} [:query-id :string]]}
  [{:keys [query-id]}]
  {:message (str "Query " (quoting/quoted query-id) " needs at least one edit. No edits were saved.")
   :recovery [{:uses #{} :text "Provide at least one edit with nonempty old_string and the intended new_string."}]})

(tools/defrecoverable empty-old-string!
  "An edit has an empty search string, which cannot identify stored text."
  {:payload [:map {:closed true} [:query-id :string] [:edit-index :int]]}
  [{:keys [query-id edit-index]}]
  {:message (str "Edit " edit-index " for query " (quoting/quoted query-id)
                 ": old_string must not be empty, even with replace_all. No edits were saved.")
   :recovery [{:uses #{} :text "Set old_string to the exact stored SQL you want to replace, then retry the complete edit list."}]})

(defn- apply-sql-edit
  [context sql [index {old-string :old_string new-string :new_string replace-all :replace_all}]]
  (when (empty? old-string)
    (empty-old-string! {:query-id (:query-id context) :edit-index (inc index)}))
  (let [pattern (re-pattern (java.util.regex.Pattern/quote old-string))
        occurrences (count (re-seq pattern sql))
        payload {:query-id (:query-id context) :sql sql :edit-index (inc index) :old-string old-string
                 :earlier-edits? (not= sql (:current-sql context))}]
    (cond
      (zero? occurrences) (edit-not-found! payload)
      (and (> occurrences 1) (not replace-all)) (edit-ambiguous! payload)
      replace-all (str/replace sql old-string new-string)
      :else (str/replace-first sql old-string new-string))))

(mu/defn edit-sql-query :- ::metabot.tools.sql.common/operation-result
  "Edit an existing SQL query from in-memory state.

  Parameters:
  - query-id: ID of the query to edit
  - edit: Edit specification map (see apply-sql-edit for format)
  - name: New name for the query (optional)
  - description: New description for the query (optional)

  Returns an `operation-result` map. For details see its docstring."
  [{:keys [query-id edits queries-state]}
   :- [:map {:closed true}
       [:query-id [:or :string :int]]
       [:edits [:sequential [:map {:closed true}
                             [:old_string :string]
                             [:new_string :string]
                             [:replace_all {:optional true} [:maybe :boolean]]]]]
       [:checklist {:optional true} [:maybe :string]]
       [:queries-state [:map-of :string ::metabot.schema/query]]]]
  (log/info "Editing SQL query" {:query-id query-id :edit-count (count edits)})

  (let [query-id (str query-id)
        query (metabot.tools.sql.common/query-for-sql-edit! queries-state query-id)
        current-sql (do
                      (when (empty? edits)
                        (empty-edits! {:query-id query-id}))
                      (metabot.u/extract-sql-content query))
        new-sql (metabot.tools.sql.common/check-nonblank-sql!
                 query-id
                 (reduce (partial apply-sql-edit {:query-id query-id :current-sql current-sql})
                         current-sql (map-indexed vector edits)))
        dialect (metabot.tools.sql.validation/query->dialect query)
        {:keys [valid? transpiled-sql] :as validation-result}
        (metabot.tools.sql.validation/validate-sql dialect new-sql)]
    (merge {:validation-result validation-result}
           (when valid?
             (let [updated-query (metabot.tools.sql.common/update-query-sql query transpiled-sql)]
               {:action-result {:query-id      query-id
                                :query-content transpiled-sql
                                :query         updated-query
                                :database      (:database query)}})))))

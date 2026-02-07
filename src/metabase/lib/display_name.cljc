(ns metabase.lib.display-name
  "Utilities for parsing column display names for content translation."
  (:require
   [clojure.string :as str]
   [metabase.util.performance :as perf]))

(def ^:const column-display-name-separator
  "Separator used for temporal bucket and binning suffixes (e.g., 'Total: Month', 'Price: 10 bins')."
  ": ")

(def ^:const join-display-name-separator
  "Separator used for joined table column names (e.g., 'Products → Created At')."
  " → ")

(def ^:const implicit-join-display-name-separator
  "Separator used for implicit join aliases (e.g., 'People - Product')."
  " - ")

(defn- static-part
  "Create a static (non-translatable) part."
  [value]
  {:type :static, :value value})

(defn- translatable-part
  "Create a translatable part."
  [value]
  {:type :translatable, :value value})

(defn- try-parse-aggregation-to-parts
  "Try to parse a display name using aggregation patterns.
   Returns a vector of parts or nil if no pattern matches."
  [display-name patterns]
  (perf/some (fn [{:keys [prefix suffix]}]
               (when (and (str/starts-with? display-name prefix)
                          (str/ends-with? display-name suffix)
                          ;; Ensure we have a non-empty inner part
                          (> (- (count display-name) (count prefix) (count suffix)) 0))
                 (let [inner (subs display-name (count prefix) (- (count display-name) (count suffix)))]
                   {:matched   true
                    :prefix    prefix
                    :suffix    suffix
                    :inner     inner})))
             patterns))

(defn- try-parse-join-to-parts
  "Try to parse a joined column display name.
   Returns {:matched true, :join-alias str, :column str} or nil."
  [display-name]
  (let [arrow-idx (str/index-of display-name join-display-name-separator)]
    (when (and arrow-idx (pos? arrow-idx))
      {:matched    true
       :join-alias (subs display-name 0 arrow-idx)
       :column     (subs display-name (+ arrow-idx (count join-display-name-separator)))})))

(defn- try-parse-implicit-join-to-parts
  "Try to parse an implicit join alias (e.g., 'People - Product').
   Returns {:matched true, :table str, :fk-field str} or nil."
  [join-alias]
  (let [dash-idx (str/index-of join-alias implicit-join-display-name-separator)]
    (when (and dash-idx (pos? dash-idx))
      {:matched  true
       :table    (subs join-alias 0 dash-idx)
       :fk-field (subs join-alias (+ dash-idx (count implicit-join-display-name-separator)))})))

(defn- try-parse-filter-to-parts
  "Try to parse a display name using filter patterns.
   Filter patterns have :prefix (text before column) and :separator (text between column and first value/end).
   Returns {:column str, :prefix str, :suffix str-or-nil} or nil."
  [display-name patterns]
  (perf/some (fn [{:keys [prefix separator]}]
               ;; Skip degenerate patterns where both prefix and separator are empty.
               ;; This can happen when a locale translates e.g. "not {0}" to just "{0}",
               ;; which would match everything and cause infinite recursion.
               (when (and (or (seq prefix) (seq separator))
                          (str/starts-with? display-name prefix))
                 (let [after-prefix (subs display-name (count prefix))]
                   (if (seq separator)
                     ;; Binary/ternary: has separator between column and values
                     (when-let [sep-idx (str/index-of after-prefix separator)]
                       (when (pos? sep-idx) ;; column must be non-empty
                         {:column (subs after-prefix 0 sep-idx)
                          :prefix prefix
                          :suffix (subs after-prefix sep-idx)}))
                     ;; Unary: no separator, everything after prefix is the column
                     (when (seq after-prefix)
                       {:column after-prefix
                        :prefix prefix
                        :suffix nil})))))
             patterns))

(defn- try-parse-colon-suffix-to-parts
  "Try to parse a display name with a colon suffix.
   Returns {:matched true, :column str, :suffix str} or nil."
  [display-name]
  (let [colon-idx (str/last-index-of display-name column-display-name-separator)]
    (when (and colon-idx (pos? colon-idx))
      {:matched true
       :column  (subs display-name 0 colon-idx)
       :suffix  (subs display-name (+ colon-idx (count column-display-name-separator)))})))

(defn parse-column-display-name-parts
  "Parse a column display name into a flat list of parts for translation.

   Takes a display name string and an optional vector of aggregation patterns
   (each pattern is a map with :prefix and :suffix keys).

   Returns a vector of parts, where each part is a map with:
   - :type - either :static (don't translate) or :translatable (should be translated)
   - :value - the string value of this part

   The FE simply needs to:
   1. Translate all parts where :type is :translatable
   2. Concatenate all :value strings together

   Examples:
   - \"Total\" => [{:type :translatable, :value \"Total\"}]

   - \"Sum of Total\" =>
     [{:type :static, :value \"Sum of \"}
      {:type :translatable, :value \"Total\"}]

   - \"Sum of Total matching condition\" =>
     [{:type :static, :value \"Sum of \"}
      {:type :translatable, :value \"Total\"}
      {:type :static, :value \" matching condition\"}]

   - \"Products → Total\" =>
     [{:type :translatable, :value \"Products\"}
      {:type :static, :value \" → \"}
      {:type :translatable, :value \"Total\"}]

   - \"People - Product → Created At: Month\" =>
     [{:type :translatable, :value \"People\"}
      {:type :static, :value \" - \"}
      {:type :translatable, :value \"Product\"}
      {:type :static, :value \" → \"}
      {:type :translatable, :value \"Created At\"}
      {:type :static, :value \": \"}
      {:type :static, :value \"Month\"}]"
  ([display-name]
   (parse-column-display-name-parts display-name nil nil))
  ([display-name aggregation-patterns]
   (parse-column-display-name-parts display-name aggregation-patterns nil))
  ([display-name aggregation-patterns filter-patterns]
   (letfn [(parse-inner [string]
                        ;; Recursively parse the inner part which may have more patterns
             (parse-column-display-name-parts string aggregation-patterns filter-patterns))

           (parse-join-alias [join-alias]
             ;; Parse join alias which may be an implicit join like "People - Product"
             (if-let [{:keys [table fk-field]} (try-parse-implicit-join-to-parts join-alias)]
               (-> []
                   (into (parse-inner table))
                   (conj (static-part implicit-join-display-name-separator))
                   (into (parse-inner fk-field)))
               ;; Simple join alias, just translate it
               (parse-inner join-alias)))]

     (or
      ;; First try aggregation patterns (most specific, wraps other patterns)
      (when-let [{:keys [prefix suffix inner]} (try-parse-aggregation-to-parts display-name aggregation-patterns)]
        (-> []
            (cond-> (seq prefix) (conj (static-part prefix)))
            (into (parse-inner inner))
            (cond-> (seq suffix) (conj (static-part suffix)))))

      ;; Then try filter patterns (column + operator + values)
      ;; Must be before join/colon parsing since filter text may contain ": " or " → "
      (when-let [{:keys [column prefix suffix]} (try-parse-filter-to-parts display-name filter-patterns)]
        (-> []
            (cond-> (seq prefix) (conj (static-part prefix)))
            (into (parse-inner column))
            (cond-> suffix (conj (static-part suffix)))))

      ;; Then try join pattern
      (when-let [{:keys [join-alias column]} (try-parse-join-to-parts display-name)]
        (-> []
            (into (parse-join-alias join-alias))
            (conj (static-part join-display-name-separator))
            (into (parse-inner column))))

      ;; Then try colon suffix (temporal bucket or binning)
      ;; The suffix is static because it's a unit name (Month, Day, etc.) or binning label
      (when-let [{:keys [column suffix]} (try-parse-colon-suffix-to-parts display-name)]
        (-> []
            (into (parse-inner column))
            (conj (static-part column-display-name-separator))
            (conj (static-part suffix))))

      ;; Otherwise it's a plain column name - translatable
      [(translatable-part display-name)]))))

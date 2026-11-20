(ns metabase.search.query-semantics-report
  "Pure report construction and validation for the search semantics corpus."
  (:require
   [clojure.string :as str]
   [metabase.search.query-semantics-stats :as stats])
  (:import
   (java.nio ByteBuffer)
   (java.util Base64)))

(set! *warn-on-reflection* true)

(def ^:private default-cutoff 0.7)

(def ^:private default-findings
  "Opening findings with the scenario and result memberships needed to validate each claim."
  [{:case  "english-stopword-only"
    :text  (str "MySQL keeps `the` as a searchable word. "
                "PostgreSQL's English config drops it and returns nothing.")
    :holds {:appdb-mysql {:A true}, :appdb-postgres :none}}
   {:case  "cjk-prefix"
    :text  (str "MySQL and PostgreSQL find Chinese word prefixes, but miss the internal occurrence in "
                "\"历史订单\" that in-place finds.")
    :holds {:appdb-mysql {:C false}, :appdb-postgres {:C false}, :in-place {:C true}}}
   {:case  "email-identifier"
    :text  (str "MySQL also matches space-separated words for a quoted email address. "
                "PostgreSQL preserves the email token.")
    :holds {:appdb-mysql {:B true, :D true}, :appdb-postgres {:B false, :D false}}}
   {:case  "unicode-decomposed-accent"
    :text  (str "A decomposed accent broadens MySQL's query to unaccented prefixes, including \"Cafeteria\". "
                "PostgreSQL returns only the card with the same Unicode spelling.")
    :holds {:appdb-mysql {:C true, :D true}, :appdb-postgres {:B true, :C false, :D false}}}
   {:case  "english-not-stopword"
    :text  (str "With the English config, `orders not shipped` also matches \"Orders shipped\", the "
                "opposite of what was asked.")
    :holds {:appdb-postgres {:A true}}}
   {:case  "or-only-operator"
    :text  (str "Typing `or` on the way to \"orders\" finds nothing on PostgreSQL, while in-place and H2 "
                "also match \"Store locations\".")
    :holds {:appdb-postgres :none, :in-place {:C true}, :appdb-h2 {:C true}}}
   {:case  "or-branch-prefix"
    :text  "The query `cust or rev` misses \"Customers\" on PostgreSQL, which completes only the last word as a prefix."
    :holds {:appdb-postgres {:A false}}}
   {:case  "negation"
    :text  (str "Semantic search returns \"Test orders\" for `orders -test`, because the keyword arm's "
                "exclusion can't stop the vector arm returning it.")
    :holds {:appdb-postgres {:B false}, :semantic-with-fallback {:B true}}}
   {:case  "vector-noise"
    :text  "The query `sales pipeline` gets \"Sales team headcount\" from the vector arm, but not \"Deals closed\"."
    :holds {:semantic-only {:E true, :C false}}}
   {:case  "vector-paraphrase"
    :text  (str "The query `how much did we sell` finds nothing on semantic search, though \"Monthly "
                "sales\" is in the catalog.")
    :holds {:semantic-with-fallback :none}}])

(def ^:private default-themes
  "Browse groups that place each identical-query scenario exactly once."
  [{:id          "partial"
    :label       "Partial words"
    :description "What matches while a word is only partly typed, as a prefix or a substring."
    :scenarios   ["infix-substring" "two-substrings-one-word" "last-word-prefix" "nonfinal-prefix" "or-branch-prefix"
                  "negated-prefix" "prefix-agreement"]}
   {:id          "short-identifiers"
    :label       "Short identifiers"
    :description "Short words and letter-number identifiers, with exact matching and final-word completion."
    :scenarios   ["short-word-prefix" "short-word-exact" "short-word-first" "short-word-last"
                  "single-character-prefix" "letter-number-prefix"]}
   {:id          "unicode"
    :label       "Unicode and CJK"
    :description "Chinese text without spaces, Unicode accent spellings, and curly apostrophes."
    :scenarios   ["cjk-prefix" "cjk-exact" "unicode-composed-accent"
                  "unicode-decomposed-accent" "unicode-apostrophe"]}
   {:id          "operators"
    :label       "Operators"
    :description (str "Typing or, and, not or a leading minus, which some engines read as operators and others "
                      "as plain text.")
    :scenarios   ["or-operator" "or-only-operator" "or-word-control" "quoted-or-word" "and-literal" "and-word-control"
                  "english-quoted-or-word" "not-literal" "negation" "negation-only" "operator-empty-agreement"]}
   {:id          "language"
    :label       "Stopwords and stemming"
    :description "PostgreSQL's English config stems words and removes stopwords; MySQL keeps literal words."
    :scenarios   ["english-stopword" "simple-stopword" "english-stopword-only" "simple-stopword-only"
                  "english-not-stopword" "english-stemming" "simple-no-stemming" "english-stem-prefix"
                  "simple-stem-prefix"]}
   {:id          "phrases"
    :label       "Quotes and phrases"
    :description "Quoted phrases, including unfinished quotes while typing."
    :scenarios   ["phrase-boundary" "english-phrase-stopword" "simple-phrase-and" "unfinished-quote" "closed-quote"
                  "phrase-punctuation-separators"]}
   {:id          "punctuation"
    :label       "Punctuation"
    :description "Punctuation, word boundaries, accents, and numbers."
    :scenarios   ["percent-punctuation" "underscore-punctuation" "percent-only" "like-escape-percent"
                  "possessive-apostrophe" "year-in-range" "accent-literal"
                  "hyphenated-compound" "camel-case-name" "version-identifier" "email-identifier"]}
   {:id          "meaning"
    :label       "Meaning"
    :description (str "Semantic search's vector arm, which matches by meaning even with no word in common, and "
                      "what it misses.")
    :scenarios   ["vector-only-match" "vector-noise" "vector-paraphrase" "vector-negation"
                  "lexical-and-vector-union" "vector-paraphrase-hit" "vector-typo" "vector-typo-alone"
                  "vector-acronym" "vector-multilingual"]}
   {:id          "baselines"
    :label       "Plain words"
    :description "Ordinary words, where the engines mostly agree. They are the baseline for the other themes."
    :scenarios   ["field-term-agreement" "multiword-agreement" "multiword-defaults" "unmatched-term"
                  "case-agreement"]}])

(defn message
  "Render a report problem as a diagnostic with its affected input."
  [{problem-type :type
    case-id      :case
    :keys        [engine label expected actual input reason repeated unknown missing invalid placeholder]}]
  (case problem-type
    :scenario-ids (str "Scenario IDs must be unique nonblank strings. Repeated: " (pr-str repeated)
                       "; invalid: " (pr-str invalid) ".")
    :theme-placement (str "Themes must place every scenario exactly once. Repeated: " (pr-str repeated)
                          "; unknown: " (pr-str unknown) "; missing: " (pr-str missing) ".")
    :unknown-finding-scenario (str "Finding names unknown scenario " (pr-str case-id) ".")
    :unknown-finding-engine (str "Finding for " (pr-str case-id) " names unknown engine " engine ".")
    :unknown-finding-label (str "Finding for " (pr-str case-id) " / " engine " names unknown label " label ".")
    :invalid-finding-claim (str "Finding for " (pr-str case-id) " / " engine " needs :none or boolean memberships.")
    :finding-mismatch (str "Finding no longer holds for " (pr-str case-id) " / " engine
                           (when label (str " / " label)) ": expected " (pr-str expected)
                           ", got " (pr-str actual) ".")
    :missing-vector (str "Missing frozen vector for " (pr-str input)
                         ". Regenerate with query-semantics-vectors/freeze!.")
    :invalid-vector (str "Invalid frozen vector for " (pr-str input) ": " (name reason) ".")
    :vector-hits (str "Frozen-vector distances disagree with recorded hits for " (pr-str input) ".")
    :missing-placeholder (str "Report template has no " placeholder " placeholder.")
    (str "Invalid search report input: " problem-type ".")))

(defn- failure [problem]
  (ex-info (message problem) problem))

(defn- repeated-ids
  "IDs that occur more than once in `ids`, sorted."
  [ids]
  (->> ids frequencies (keep (fn [[id n]] (when (< 1 n) id))) (sort-by str) vec))

(defn- scenario-problems [scenarios]
  (let [ids      (map :id scenarios)
        repeated (repeated-ids ids)
        invalid  (vec (remove #(and (string? %) (not (str/blank? %))) ids))]
    (when (or (seq repeated) (seq invalid))
      [{:type :scenario-ids, :repeated repeated, :invalid invalid}])))

(defn- theme-problems [scenarios themes]
  (let [placed   (mapcat :scenarios themes)
        known    (set (map :id scenarios))
        repeated (repeated-ids placed)
        unknown  (vec (sort-by str (remove known placed)))
        missing  (vec (sort-by str (remove (set placed) known)))]
    (when (or (seq repeated) (seq unknown) (seq missing))
      [{:type     :theme-placement
        :repeated repeated
        :unknown  unknown
        :missing  missing}])))

(defn- membership-problems [scenario engine memberships]
  (let [case-id (:id scenario)
        results (get-in scenario [:results engine])
        known   (set (keys (:docs scenario)))
        context {:case case-id, :engine engine}]
    (cond
      (not (some #{engine} stats/engines))
      [(assoc context :type :unknown-finding-engine)]

      (= memberships :none)
      (when (seq results)
        [(assoc context :type :finding-mismatch, :expected :none, :actual results)])

      (not (map? memberships))
      [(assoc context :type :invalid-finding-claim)]

      :else
      (for [[label included?] memberships
            :let [problem (cond
                            (not (contains? known label))             :unknown-finding-label
                            (not (boolean? included?))                :invalid-finding-claim
                            (not= included? (contains? results label)) :finding-mismatch)]
            :when problem]
        (cond-> (assoc context :type problem, :label label)
          (= problem :finding-mismatch)
          (assoc :expected included?, :actual (contains? results label)))))))

(defn- finding-problems [scenarios findings]
  (let [by-id (into {} (map (juxt :id identity)) scenarios)]
    (mapcat (fn [{case-id :case, :keys [holds]}]
              (if-let [scenario (by-id case-id)]
                (mapcat (fn [[engine memberships]] (membership-problems scenario engine memberships)) holds)
                [{:type :unknown-finding-scenario, :case case-id}]))
            findings)))

(defn problems
  "Return report problems as maps with a :type and the affected IDs or memberships.
  Validate scenario IDs, theme placement, and finding claims against the scenario rows."
  [scenarios {:keys [themes findings]}]
  (vec (concat (scenario-problems scenarios)
               (theme-problems scenarios themes)
               (finding-problems scenarios findings))))

(defn- decode [dimensions input ^String encoded]
  (when-not (string? encoded)
    (throw (failure {:type :invalid-vector, :input input, :reason :encoding})))
  (let [payload (try (.decode (Base64/getDecoder) encoded)
                     (catch IllegalArgumentException _
                       (throw (failure {:type :invalid-vector, :input input, :reason :encoding}))))]
    (when-not (= (alength payload) (* 4 dimensions))
      (throw (failure {:type :invalid-vector, :input input, :reason :length})))
    (let [buffer (ByteBuffer/wrap payload)
          values (vec (repeatedly dimensions #(double (.getFloat buffer))))]
      (when-not (and (every? #(Double/isFinite %) values) (some #(not (zero? %)) values))
        (throw (failure {:type :invalid-vector, :input input, :reason :components})))
      values)))

(defn- frozen-vectors [{:keys [dimensions vectors]}]
  (when-not (pos-int? dimensions)
    (throw (failure {:type :invalid-vector, :input :dimensions, :reason :dimensions})))
  (into {} (for [[input encoded] vectors] [input (decode dimensions input encoded)])))

(defn- embedded [vectors text]
  (or (vectors text) (throw (failure {:type :missing-vector, :input text}))))

(defn- document-text [{:keys [name description]}]
  (str "[card]\nname: " name (when description (str "\ndescription: " description))))

(defn- cosine-distance [a b]
  (let [dot  (reduce + (map * a b))
        norm #(Math/sqrt (reduce + (map * % %)))]
    (- 1 (/ dot (* (norm a) (norm b))))))

(defn- distances [{:keys [vectors cutoff]} row query vector-hits]
  (let [query-vector (embedded vectors (str "query: " query))
        by-label     (update-vals (:docs row) #(cosine-distance query-vector (embedded vectors (document-text %))))
        within       (set (for [[label distance] by-label :when (<= distance cutoff)] label))]
    (when-not (= within (set vector-hits))
      (throw (failure {:type     :vector-hits
                       :input    query
                       :expected (set vector-hits)
                       :actual   within})))
    (into (sorted-map) (update-keys by-label name))))

(defn- labels [hits]
  (mapv name (sort hits)))

(defn- document-data [docs]
  (mapv (fn [[label attributes]] {:label (name label), :attributes attributes}) (sort-by key docs)))

(defn- double-values [values]
  (update-vals values double))

(defn- engine-data [context row corpus engine]
  (let [{:keys [best typed]} (get-in row [:scores engine])
        query                (if (= corpus :translations) (get-in row [:specs engine :query]) (:query row))]
    (cond-> {:id (name engine), :hits (labels (get-in row [:results engine]))}
      (= corpus :translations)
      (assoc :query      query
             :typedHits  (labels (get-in row [:typed engine]))
             :bestScore  (double-values best)
             :typedScore (double-values typed))
      (= engine :semantic-only)
      (assoc :distances (distances context row query (get-in row [:results engine])))
      (and (= corpus :same-query) (= engine :semantic-with-fallback))
      (assoc :keywordHits (labels (get-in row [:semantic-arms :keyword]))))))

(defn- mean-f1 [{:keys [scores]}]
  (/ (transduce (map #(double (get-in scores [% :best :f1]))) + stats/engines) (count stats/engines)))

(defn- prose [note]
  (some->> note (str/join " ")))

(defn- row-data [context corpus row]
  (let [same-query? (= corpus :same-query)]
    (cond-> {:id              (if same-query? (:id row) (str (:scenario-id row) "/" (:id row)))
             :scenario        (if same-query? (:id row) (:scenario-id row))
             :focus           (:focus row)
             :note            (prose (:note row))
             :config          (:config row)
             :query           (:query row)
             :docs            (document-data (:docs row))
             :engines         (mapv (partial engine-data context row corpus) stats/engines)
             :matchingPairs   (stats/matching-pair-count (:results row))
             :agreementGroups (stats/result-group-sizes (:results row))}
      (not same-query?)
      (assoc :scenarioNote (prose (:scenario-note row))
             :kind         (name (:kind row))
             :correct      (labels (:correct row))
             :conforming   (mapv name (stats/conforming-engines (:correct row) (:results row)))
             :meanF1       (mean-f1 row)))))

(defn- pair-data [summary]
  (mapv (fn [[left right :as pair]]
          {:left (name left), :right (name right), :counts (get-in summary [:pairwise pair])})
        stats/engine-pairs))

(defn- double-scores [scores]
  (update-vals scores double-values))

(defn- summary-data [summary]
  (cond-> {:count    (:count summary)
           :allEqual (:all-equal summary)
           :meanHits (double-values (:mean-hits summary))
           :pairs    (pair-data summary)}
    (:scores summary)
    (assoc :scores (double-scores (:scores summary))
           :typedScores (double-scores (:typed-scores summary)))))

(defn report-data
  "Return browser data for cases and encoded frozen vectors, with the supplied provenance.
  Options can override :themes, :findings, and :cutoff.
  Invalid inputs throw an ExceptionInfo whose data is a problem map."
  ([cases frozen provenance]
   (report-data cases frozen provenance {}))
  ([cases frozen provenance options]
   (let [options      (merge {:themes default-themes, :findings default-findings, :cutoff default-cutoff} options)
         scenarios    (vec (stats/scenario-rows cases))
         translations (vec (stats/translation-rows cases))]
     (when-let [problem (first (problems scenarios options))]
       (throw (failure problem)))
     (let [context (assoc options :vectors (frozen-vectors frozen))
           summary (stats/summary scenarios translations)]
       {:engines      (mapv name stats/engines)
        :goalKinds    (mapv name stats/goal-kinds)
        :pairCount    (count stats/engine-pairs)
        :provenance   (assoc provenance :model (:model frozen), :cutoff (:cutoff context))
        :findings     (mapv #(select-keys % [:case :text]) (:findings options))
        :themes       (:themes options)
        :sameQuery    {:summary (summary-data (:same-query summary))
                       :cases   (mapv (partial row-data context :same-query) scenarios)}
        :translations {:summary (summary-data (:translations summary))
                       :cases   (mapv (partial row-data context :translations) translations)}}))))

(defn render
  "Insert report data and optional scoring code into the standalone HTML template.
  JSON script delimiters are escaped.
  A missing placeholder throws an ExceptionInfo with type :missing-placeholder and the placeholder name."
  ([html json]
   (render html json nil))
  ([html json model]
   (let [replacements (cond-> {"__REPORT_DATA__" (str/replace json "<" "\\u003c")}
                        model (assoc "__REPORT_MODEL__" model))]
     (doseq [placeholder (keys replacements)]
       (when-not (str/includes? html placeholder)
         (throw (failure {:type :missing-placeholder, :placeholder placeholder}))))
     (str/replace html #"__REPORT_(?:DATA|MODEL)__" #(get replacements % %)))))

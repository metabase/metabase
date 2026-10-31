#!/usr/bin/env bb

(ns dev.search-semantics-report
  "Generate a disposable, self-contained browser view of the search fixture.

  Run from the repository root with `./bin/mage search-semantics-report`, or directly with:
  bb -cp test:test_resources dev/search_semantics_report.bb

  Pass an output path to write somewhere other than target/search-semantics-report/index.html."
  (:require
   [babashka.process :as p]
   [cheshire.core :as json]
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.search.query-semantics :as fixtures]
   [metabase.search.query-semantics-stats :as stats])
  (:import
   (java.nio ByteBuffer)
   (java.util Base64)))

(set! *warn-on-reflection* true)

(def ^:private max-cosine-distance
  "The vector arm's cutoff, `max-cosine-distance` in `metabase-enterprise.search.semantic.index`."
  0.7)

(def ^:private findings
  "The page's opening findings. Each names its case and the memberships it relies on, which are checked at build
  time, so a fixture change that falsifies one fails the build instead of leaving the claim stale."
  [{:case  "english-not-stopword"
    :text  "With the English config, `orders not shipped` also matches \"Orders shipped\", the opposite of what was asked."
    :holds {:appdb-postgres {:A true}}}
   {:case  "or-only-operator"
    :text  "Typing `or` on the way to \"orders\" finds nothing on PostgreSQL, while in-place and H2 also match \"Store locations\"."
    :holds {:appdb-postgres :none, :in-place {:C true}, :appdb-h2 {:C true}}}
   {:case  "or-branch-prefix"
    :text  "`cust or rev` misses \"Customers\" on PostgreSQL, which completes only the last word as a prefix."
    :holds {:appdb-postgres {:A false}}}
   {:case  "negation"
    :text  "Semantic search returns \"Test orders\" for `orders -test`: the keyword arm's exclusion cannot veto the vector arm."
    :holds {:appdb-postgres {:B false}, :semantic-with-fallback {:B true}}}
   {:case  "vector-noise"
    :text  "`sales pipeline` gets \"Sales team headcount\" from the vector arm, but not \"Deals closed\"."
    :holds {:semantic-only {:E true, :C false}}}
   {:case  "vector-paraphrase"
    :text  "`how much did we sell` finds nothing on semantic search, though \"Monthly sales\" is in the catalog."
    :holds {:semantic-with-fallback :none}}])

;;; Themes

(def ^:private themes
  "The themes a reader can browse identical-query scenarios by. Every scenario belongs to exactly one, which the
  build checks, so a new or renamed scenario fails the build until it is placed."
  [{:id          "partial"
    :label       "Partial words"
    :description "What matches while a word is only partly typed, as a prefix or a substring."
    :scenarios   ["infix-substring" "two-substrings-one-word" "last-word-prefix" "nonfinal-prefix" "or-branch-prefix"
                  "negated-prefix" "prefix-agreement"]}
   {:id          "operators"
    :label       "Operators"
    :description "Typing or, and, not or a leading minus, which some engines read as operators and others as plain text."
    :scenarios   ["or-operator" "or-only-operator" "or-word-control" "english-or-word" "and-literal" "and-word-control"
                  "english-and-word" "not-literal" "negation" "negation-only" "operator-empty-agreement"]}
   {:id          "language"
    :label       "Stopwords and stemming"
    :description "PostgreSQL's English config drops common words and reduces words to stems; the others match text as typed."
    :scenarios   ["english-stopword" "simple-stopword" "english-stopword-only" "simple-stopword-only"
                  "english-not-stopword" "english-stemming" "simple-no-stemming"]}
   {:id          "phrases"
    :label       "Quotes and phrases"
    :description "Quoted phrases, including unfinished quotes while typing."
    :scenarios   ["phrase-boundary" "english-phrase-stopword" "simple-phrase-and" "unfinished-quote" "closed-quote"]}
   {:id          "punctuation"
    :label       "Punctuation"
    :description "Percent signs and underscores, which substring engines match literally and PostgreSQL treats as separators."
    :scenarios   ["percent-punctuation" "underscore-punctuation" "percent-only" "like-escape-percent"]}
   {:id          "meaning"
    :label       "Meaning"
    :description "Semantic search's vector arm, which matches by meaning even with no word in common, and what it misses."
    :scenarios   ["vector-only-match" "vector-noise" "vector-paraphrase" "vector-negation" "lexical-and-vector-union"]}
   {:id          "baselines"
    :label       "Plain words"
    :description "Ordinary words, mostly where every engine agrees. The other themes depart from this baseline."
    :scenarios   ["field-term-agreement" "multiword-agreement" "multiword-defaults" "unmatched-term"]}])

(defn- theme-data
  "The themes, after checking that they place every scenario exactly once and name no unknown scenario."
  [scenario-rows]
  (let [placed   (mapcat :scenarios themes)
        repeated (for [[id n] (frequencies placed) :when (< 1 n)] id)
        known    (set (map :id scenario-rows))
        unknown  (remove known placed)
        missing  (remove (set placed) known)]
    (when (or (seq repeated) (seq unknown) (seq missing))
      (throw (ex-info "Themes must place every scenario exactly once"
                      {:repeated (vec repeated), :unknown (vec unknown), :missing (vec (sort missing))})))
    themes))

;;; Frozen vectors

(def ^:private frozen
  (-> "search/arctic_embed_l_v2_vectors.edn" io/resource slurp edn/read-string))

(defn- decode
  [^String encoded]
  (let [buffer (ByteBuffer/wrap (.decode (Base64/getDecoder) encoded))]
    (vec (repeatedly (:dimensions frozen) #(double (.getFloat buffer))))))

(def ^:private vectors
  (update-vals (:vectors frozen) decode))

(defn- embedded
  "The vector for an embedded text; the text formats match `query-semantics-vectors`."
  [text]
  (or (vectors text)
      (throw (ex-info "Missing frozen vector; run query-semantics-vectors/freeze!" {:text text}))))

(defn- document-text
  [{:keys [name description]}]
  (str "[card]\nname: " name (when description (str "\ndescription: " description))))

(defn- cosine-distance
  [a b]
  (let [dot  (reduce + (map * a b))
        norm #(Math/sqrt (reduce + (map * % %)))]
    (- 1 (/ dot (* (norm a) (norm b))))))

(defn- distances
  "Cosine distance from `query` to each card, checked against the vector arm's recorded hits."
  [row query vector-hits]
  (let [query-vector (embedded (str "query: " query))
        result       (into (sorted-map)
                           (for [[label doc] (:docs row)]
                             [(name label) (cosine-distance query-vector (embedded (document-text doc)))]))
        within       (set (for [[label d] result :when (<= d max-cosine-distance)] (keyword label)))]
    (when-not (= within (set vector-hits))
      (throw (ex-info "Frozen-vector distances disagree with the recorded vector arm"
                      {:query query, :within within, :recorded vector-hits})))
    result))

;;; Rows

(defn- labels
  [hits]
  (mapv name (sort hits)))

(defn- document-data
  [docs]
  (mapv (fn [[label attributes]]
          {:label (name label), :attributes attributes})
        (sort-by key docs)))

(defn- double-values
  [m]
  (update-vals m double))

(defn- engine-data
  [row corpus engine]
  (let [{:keys [best typed]} (get-in row [:scores engine])
        query                (if (= corpus :translations) (get-in row [:specs engine :query]) (:query row))]
    (cond-> {:id   (name engine)
             :hits (labels (get-in row [:results engine]))}
      (= corpus :translations)
      (assoc :query      query
             :typedHits  (labels (get-in row [:typed engine]))
             :bestScore  (double-values best)
             :typedScore (double-values typed))
      (= engine :semantic-only)
      (assoc :distances (distances row query (get-in row [:results engine])))
      (and (= corpus :same-query) (= engine :semantic-with-fallback))
      (assoc :keywordHits (labels (get-in row [:semantic-arms :keyword]))))))

;; Breaks ties when cases are sorted by conformance.
(defn- mean-f1
  [{:keys [scores]}]
  (/ (transduce (map #(double (get-in scores [% :best :f1]))) + stats/engines)
     (count stats/engines)))

(defn- prose
  [note]
  (some->> note (str/join " ")))

(defn- row-data
  [corpus row]
  (let [same-query? (= corpus :same-query)]
    (cond-> {:id            (if same-query? (:id row) (str (:scenario-id row) "/" (:id row)))
             :scenario      (if same-query? (:id row) (:scenario-id row))
             :focus         (:focus row)
             :note          (prose (:note row))
             :config        (:config row)
             :query         (:query row)
             :docs          (document-data (:docs row))
             :engines       (mapv (partial engine-data row corpus) stats/engines)
             :matchingPairs (stats/matching-pair-count (:results row))}
      (not same-query?)
      (assoc :scenarioNote (prose (:scenario-note row))
             :kind         (name (:kind row))
             :correct      (labels (:correct row))
             :conforming   (mapv name (stats/conforming-engines (:correct row) (:results row)))
             :meanF1       (mean-f1 row)))))

(defn- finding-data
  "Check each finding against the fixture and keep what the page needs."
  [scenario-rows]
  (let [by-id (into {} (map (juxt :id identity)) scenario-rows)]
    (for [{case-id :case, :keys [text holds]} findings
          :let [row (or (by-id case-id) (throw (ex-info "Finding names an unknown scenario" {:case case-id})))]]
      (do (doseq [[engine memberships] holds
                  :let [results (get-in row [:results engine])]]
            (when-not (some #{engine} stats/engines)
              (throw (ex-info "Finding names an unknown engine" {:case case-id, :engine engine})))
            ;; :none claims the engine returns nothing; a map claims whether each label is among its results.
            (if (= memberships :none)
              (when (seq results)
                (throw (ex-info "Finding no longer holds" {:case case-id, :engine engine, :expected :none})))
              (doseq [[label included?] memberships]
                (when-not (= included? (contains? results label))
                  (throw (ex-info "Finding no longer holds"
                                  {:case case-id, :engine engine, :label label, :expected included?}))))))
          {:case case-id, :text text}))))

;;; Summaries

(defn- pair-data
  [summary]
  (mapv (fn [[left right :as pair]]
          {:left   (name left)
           :right  (name right)
           :counts (get-in summary [:pairwise pair])})
        stats/engine-pairs))

(defn- double-scores
  [scores]
  (update-vals scores double-values))

(defn- summary-data
  [summary]
  (cond-> {:count    (:count summary)
           :allEqual (:all-equal summary)
           :meanHits (update-vals (:mean-hits summary) double)
           :pairs    (pair-data summary)}
    (:scores summary)
    (assoc :scores      (double-scores (:scores summary))
           :typedScores (double-scores (:typed-scores summary)))))

(defn- provenance
  []
  {:commit    (str/trim (:out (p/shell {:out :string} "git" "rev-parse" "--short" "HEAD")))
   :dirty     (boolean (seq (str/trim (:out (p/shell {:out :string} "git" "status" "--porcelain" "--" "test" "test_resources" "dev")))))
   :model     (:model frozen)
   :generated (str (java.time.LocalDate/now))
   :cutoff    max-cosine-distance})

(defn- report-data
  []
  (let [summary       (stats/summary fixtures/cases)
        scenario-rows (stats/scenario-rows fixtures/cases)]
    {:engines      (mapv name stats/engines)
     :goalKinds    (mapv name stats/goal-kinds)
     :pairCount    (count stats/engine-pairs)
     :provenance   (provenance)
     :findings     (vec (finding-data scenario-rows))
     :themes       (theme-data scenario-rows)
     :sameQuery    {:summary (summary-data (:same-query summary))
                    :cases   (mapv (partial row-data :same-query) scenario-rows)}
     :translations {:summary (summary-data (:translations summary))
                    :cases   (mapv (partial row-data :translations)
                                   (stats/translation-rows fixtures/cases))}}))

(let [output (or (first *command-line-args*) "target/search-semantics-report/index.html")
      html   (slurp "dev/resources/dev/search_semantics_report.html")
      data   (-> (report-data) json/generate-string (str/replace "<" "\\u003c"))
      page   (str/replace html "__REPORT_DATA__" data)]
  (when (= html page)
    (throw (ex-info "Report template has no data placeholder" {})))
  (io/make-parents output)
  (spit output page)
  (println "Wrote" (.getCanonicalPath (io/file output))))

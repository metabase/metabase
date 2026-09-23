(ns metabase-enterprise.semantic-search.lucene.query-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.lucene.index :as lucene.index]
   [metabase-enterprise.semantic-search.lucene.query :as lucene.query]
   [metabase-enterprise.semantic-search.lucene.test-util :as lucene.tu]
   [metabase.search.config :as search.config]
   [metabase.search.core :as search]
   [metabase.search.engine :as search.engine]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;;; Fusion

(def ^:private test-weights {:rrf 500 :semantic-distance 10})

(defn- score-named [result nm]
  (first (filter (comp #{nm} :name) (:all-scores result))))

(defn- vector-row [model id rank score]
  {:legacy_input   {:model model :id id :name (str model " " id)}
   :semantic-rank  rank
   :semantic-score score})

(defn- keyword-row [model id]
  {:model model :id id :name (str model " " id) :score 7.0 :all-scores [{:name :text}]})

(deftest fuse-combines-both-ranks-test
  (let [[result] (lucene.query/fuse test-weights
                                    [(vector-row "card" 1 1 0.9)]
                                    [(keyword-row "card" 1)])]
    (testing "a document both arms rank first gets both reciprocal-rank contributions"
      (is (= (+ (/ 0.49 61) (/ 0.51 61)) (:score (score-named result :rrf)))))
    (testing "its vector score rides along as the semantic-distance score"
      (is (= 0.9 (:score (score-named result :semantic-distance)))))
    (testing "the total is the weighted sum of the two"
      (is (= (+ (* 500 (+ (/ 0.49 61) (/ 0.51 61))) (* 10 0.9))
             (:score result))))
    (testing "the keyword arm's own total score is not folded in"
      (is (not= 7.0 (:score result)))
      (is (nil? (score-named result :text))))))

(deftest fuse-scores-single-arm-hits-test
  (testing "a keyword-only hit at rank 2 gets only the keyword contribution and no semantic distance"
    (let [[result] (lucene.query/fuse test-weights [] [(keyword-row "card" 1) (keyword-row "card" 2)])
          second-result (second (lucene.query/fuse test-weights [] [(keyword-row "card" 1) (keyword-row "card" 2)]))]
      (is (= (/ 0.51 61) (:score (score-named result :rrf))))
      (is (= (/ 0.51 62) (:score (score-named second-result :rrf))))
      (is (= 0.0 (:score (score-named result :semantic-distance))))))
  (testing "a vector-only hit gets only the semantic contribution"
    (let [[result] (lucene.query/fuse test-weights [(vector-row "card" 9 1 0.8)] [])]
      (is (= (/ 0.49 61) (:score (score-named result :rrf))))
      (is (= 0.8 (:score (score-named result :semantic-distance)))))))

(deftest fuse-ranks-agreed-documents-above-one-arm-hits-test
  (let [results (lucene.query/fuse test-weights
                                   [(vector-row "card" 1 2 0.7)
                                    (vector-row "card" 2 1 0.7)]
                                   [(keyword-row "card" 1)
                                    (keyword-row "card" 3)])]
    (is (= [["card" 1] ["card" 2] ["card" 3]]
           (map (juxt :model :id) results))
        "card 1 places first on both arms agreeing, ahead of each arm's own top hit")))

(deftest fuse-prefers-the-keyword-arm-body-test
  (testing "when both arms find a document, its row comes from the keyword arm, which carries the bookmark flag"
    (let [[result] (lucene.query/fuse test-weights
                                      [(vector-row "card" 1 1 0.9)]
                                      [(assoc (keyword-row "card" 1) :bookmark true)])]
      (is (true? (:bookmark result))))))

;;;; Filters

(defn- filter-string [search-context]
  (some-> (lucene.query/filter-query search-context) str))

(deftest filter-query-is-nil-when-nothing-is-filtered-test
  (is (nil? (filter-string {}))))

(deftest filter-query-per-context-key-test
  (are [expected ctx] (= expected (filter-string ctx))
    "#archived:true"                  {:archived? true}
    "#archived:false"                 {:archived? false}
    "#verified:true"                  {:verified true}
    "#curated:true"                   {:curated? true}
    "#creator_id:(12)"                {:created-by #{12}}
    "#last_editor_id:(3)"             {:last-edited-by #{3}}
    "#database_id:7"                  {:table-db-id 7}
    "#model_id:(42)"                  {:ids [42]}
    "#display_type:(table)"           {:display-type ["table"]}))

(deftest filter-query-models-test
  (testing "a non-empty model set filters to those models"
    (is (= "#model:(card)" (filter-string {:models #{"card"}}))))
  (testing "an empty but present model set matches nothing, rather than everything"
    (is (= "#MatchNoDocsQuery(\"\")" (filter-string {:models #{}})))))

(deftest filter-query-personal-collection-modes-test
  (are [expected mode] (= expected (filter-string {:filter-items-in-personal-collection mode
                                                   :current-user-id 5}))
    nil                                                     "all"
    nil                                                     nil
    "#personal_owner_id:5"                                  "only-mine"
    "#(#*:* -personal_owner_id:__null__)"                   "only"
    "#personal_owner_id:__null__"                           "exclude"
    "#((personal_owner_id:__null__ personal_owner_id:5)~1)" "exclude-others"))

;;;; The keyword arm

(deftest keyword-arm-distinguishes-empty-from-not-run-test
  (testing "an arm that ran and matched nothing is empty, so the caller need not search again"
    (with-redefs [search.engine/supported-engine? (constantly true)
                  search.engine/results           (constantly [])]
      (is (= [] (#'lucene.query/keyword-hits {:search-string "puppy"} 10)))))
  (testing "an app DB the appdb engine cannot serve leaves the arm nil, so the caller still falls back"
    (with-redefs [search.engine/supported-engine? (constantly false)]
      (is (nil? (#'lucene.query/keyword-hits {:search-string "puppy"} 10)))))
  (testing "an arm that threw is nil for the same reason"
    (with-redefs [search.engine/supported-engine? (constantly true)
                  search.engine/results           (fn [_] (throw (ex-info "no index" {})))]
      (is (nil? (#'lucene.query/keyword-hits {:search-string "puppy"} 10))))))

;;;; End to end, through the search API

(def ^:private dog-card "Dog Training Guide")
(def ^:private revenue-card "Quarterly Revenue")

(defn- embed-by-topic
  "Put dog-ish text on one axis and revenue-ish text on another, so `puppy` is near one card and far from the other."
  [text]
  (cond
    (str/includes? text dog-card)     [1.0 0.0 0.0 0.0]
    (str/includes? text revenue-card) [0.0 0.0 1.0 0.0]
    (str/includes? text "puppy")      [0.98 0.2 0.0 0.0]
    :else                             [0.0 1.0 0.0 0.0]))

(defmacro ^:private with-semantic-search
  "Run `body` on an instance where the Lucene semantic engine serves search, over a temporary appdb keyword index."
  [& body]
  `(mt/with-premium-features #{:semantic-search}
     (lucene.tu/with-lucene-store [4]
       (binding [lucene.tu/*embed-fn* embed-by-topic]
         (search.tu/with-temp-index-table
           ~@body)))))

(defn- search-names
  "Names of the results `user` gets for `q`, via the search API."
  [user q]
  (->> (mt/user-http-request user :get 200 "search" :q q)
       :data
       (map :name)))

(deftest semantic-engine-serves-search-test
  (with-semantic-search
    (is (= :search.engine/semantic (search.engine/default-engine))
        "a licence plus a ready embedder is all the Lucene backend needs to take over search")))

(deftest semantic-beats-a-keyword-miss-test
  (with-semantic-search
    (mt/with-temp [:model/Card _ {:name dog-card}
                   :model/Card _ {:name revenue-card}]
      (is (pos? (lucene.index/live-count)) "ingestion wrote both cards to this node's Lucene index")
      (testing "a concept query with no keyword overlap still finds the card it is about"
        (let [names (search-names :crowberto "puppy")]
          (is (contains? (set names) dog-card))
          (testing "and the card it is not about stays below the cosine floor"
            (is (not (contains? (set names) revenue-card)))))))))

(deftest semantic-results-carry-the-fusion-scores-test
  (with-semantic-search
    (mt/with-temp [:model/Card _ {:name dog-card}]
      (let [result (->> (search.tu/search-results "puppy" {:current-user-id (mt/user->id :crowberto)})
                        (filter (comp #{dog-card} :name))
                        first)]
        (is (some? result))
        (is (= #{:rrf :semantic-distance :bookmarked :user-recency}
               (set (map :name (:all-scores result))))
            "the two fusion scorers rank the result, and the appdb scorers are layered on afterwards")))))

(defn- search-context
  "A full search context for `search-string`, as the API builds one for `:crowberto`."
  [search-string]
  (search/search-context {:current-user-id    (mt/user->id :crowberto)
                          :current-user-perms #{"/"}
                          :is-superuser?      true
                          :archived           false
                          :context            :default
                          :search-string      search-string
                          :models             search.config/all-models
                          :model-ancestors?   false}))

(deftest query-passes-a-missing-keyword-arm-through-test
  (with-semantic-search
    (mt/with-temp [:model/Card _ {:name dog-card}]
      (mt/with-test-user :crowberto
        (testing "an app DB without an appdb index reports no keyword results at all, not an empty set"
          ;; Built outside the redef: search-context resolves engines, which reads the multimethod's methods.
          (let [ctx (search-context "puppy")]
            (with-redefs [search.engine/supported-engine? (constantly false)]
              (is (nil? (:keyword-results (lucene.query/query ctx)))))))
        (testing "otherwise the rows it already fetched come back for the caller to reuse"
          (is (some? (:keyword-results (lucene.query/query (search-context "Dog"))))))))))

(deftest blank-search-string-falls-back-to-the-keyword-arm-test
  (with-semantic-search
    (mt/with-temp [:model/Card _ {:name dog-card}]
      (testing "the native-editor table picker sends no search string; semantic yields to the appdb engine"
        (is (= {:results [] :raw-count 0} (lucene.query/query {:search-string ""})))
        (is (contains? (set (search-names :crowberto "Dog")) dog-card))))))

(deftest permissions-are-applied-to-fused-results-test
  (with-semantic-search
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection {:name "Private Kennel"}
                     :model/Card _ {:name dog-card :collection_id (:id collection)}]
        (testing "an admin sees the card"
          (is (contains? (set (search-names :crowberto "puppy")) dog-card)))
        (testing "a user without collection permissions does not"
          (is (not (contains? (set (search-names :rasta "puppy")) dog-card))))))))

(deftest an-unavailable-embedder-falls-back-to-the-keyword-arm-test
  (with-semantic-search
    (mt/with-temp [:model/Card _ {:name dog-card}]
      (binding [lucene.tu/*embedder-fails?* true]
        (testing "the query cannot be embedded, so search answers from the keyword arm instead of failing"
          (is (contains? (set (search-names :crowberto "Dog")) dog-card)))))))

(deftest diagnose-reports-the-stage-that-dropped-a-document-test
  (with-semantic-search
    (mt/with-temp [:model/Card card {:name dog-card}]
      (mt/with-test-user :crowberto
        (testing "a document that is not indexed at all"
          (is (= :missing-from-index
                 (:type (lucene.query/diagnose {:search-string "puppy"} "card" 999999)))))
        (testing "a document a filter excludes"
          (is (= {:type :filtered :details {:excluded-by :models}}
                 (lucene.query/diagnose {:search-string "puppy" :models #{"dashboard"}} "card" (:id card)))))
        (testing "a document that survives every stage"
          (is (= :candidate
                 (:type (lucene.query/diagnose {:search-string "puppy"} "card" (:id card))))))))))

(deftest diagnose-reports-permissions-before-filters-test
  (with-semantic-search
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection collection {:name "Private Kennel"}
                     :model/Card card {:name dog-card :collection_id (:id collection)}]
        (testing "a document the current user may not read reads as permission-filtered, not merely filtered"
          (mt/with-test-user :rasta
            (is (= {:type :filtered :details {:excluded-by :permissions}}
                   (lucene.query/diagnose {:search-string "puppy" :models #{"dashboard"}} "card" (:id card))))))))))

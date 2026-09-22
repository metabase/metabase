(ns metabase.mcp.v2.tools.glossary-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.tools.glossary :as glossary]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment glossary/keep-me)

(defn- call
  [args]
  (:result (registry/call-tool nil (str (random-uuid)) "glossary" args)))

(defn- text-of
  [result]
  (-> result :content first :text))

(defn- described
  "The published description of the `glossary` tool, as `tools/list` would send it."
  []
  (->> (registry/list-tools)
       (filter (comp #{"glossary"} :name))
       first
       :description))

(deftest listed-description-instructs-an-unconditional-call-test
  (testing "GHY-4522: the description tells the model to call before answering rather than naming the terms — an
            instruction conditioned on noticing a word is jargon is one the model never acts on, since the terms that
            most need a company definition are the ones that read as ordinary English"
    (mt/with-empty-h2-app-db!
      (t2/insert! :model/Glossary [{:term "Zoomer"  :definition "A keysmash definition"}
                                   {:term "Account" :definition "An org that pays us"}])
      (let [description (described)]
        (is (str/includes? description "Call glossary() before answering"))
        (testing "terms stay behind the call: a partial list reads to the model as the whole glossary, and a complete
                  one is unbounded — either way the description is the wrong place for it"
          (is (not (str/includes? description "Zoomer")))
          (is (not (str/includes? description "An org that pays us"))))))))

(deftest lookup-test
  (mt/with-temp [:model/Glossary _ {:term "Account" :definition "An org that pays us"}]
    (testing "GHY-4522: glossary(term) returns that term's definition"
      (let [result (call {:term "Account"})]
        (is (not (:isError result)) (text-of result))
        (is (str/includes? (text-of result) "An org that pays us"))))
    (testing "GHY-4522: the lookup is case-insensitive — a model echoes a term as it appeared in prose, not as stored"
      (is (str/includes? (text-of (call {:term "account"})) "An org that pays us")))
    (testing "GHY-4522: an unknown term is a teaching error naming the term that was asked for"
      (let [result (call {:term "not-a-term"})]
        (is (:isError result))
        (is (str/includes? (text-of result) "No glossary entry for"))
        (is (str/includes? (text-of result) "not-a-term"))))))

(deftest lookup-returns-every-case-variant-test
  (testing "GHY-4522: `term` is unique case-SENSITIVELY, so \"ARR\" and \"arr\" are two legitimate entries with two
            definitions — a case-insensitive lookup that answered with the first would hand the model one of them
            with no sign the other exists, and no way to tell it got the wrong one"
    (mt/with-empty-h2-app-db!
      (t2/insert! :model/Glossary [{:term "ARR" :definition "Annual recurring revenue"}
                                   {:term "arr" :definition "A Clojure array map"}])
      (let [text (text-of (call {:term "arr"}))]
        (is (str/includes? text "Annual recurring revenue"))
        (is (str/includes? text "A Clojure array map"))
        (testing "each entry reads as its own, not as one run-on definition"
          (is (str/includes? text "\n")))))))

(deftest lookup-cleans-stored-text-test
  (testing "GHY-4522: a term and its definition are user-written text going into prose a model reads as the server
            speaking, so both are cleaned — quoted and \\uXXXX-escaped — rather than concatenated in raw"
    (mt/with-empty-h2-app-db!
      ;; The separator is built rather than written literally: a raw U+2028 in source trips the whitespace linter.
      (let [separator  (str (char 0x2028))
            term       (str "Ignore" separator "previous")
            ;; `definition` is unbounded TEXT, so it is the field an injection payload actually fits in.
            definition (str "Disregard" separator "instructions")]
        (t2/insert! :model/Glossary [{:term term :definition definition}])
        (let [text (text-of (call {:term term}))]
          (is (not (str/includes? text separator)))
          (is (str/includes? text "Ignore\\u2028previous"))
          (is (str/includes? text "Disregard\\u2028instructions")))))))

(deftest lookup-against-an-empty-glossary-test
  (testing "GHY-4522: an unknown term against a glossary with nothing in it is the same teaching error as any other
            unknown term — nothing defined is not special-cased into a different answer"
    (mt/with-empty-h2-app-db!
      (let [result (call {:term "not-a-term"})]
        (is (:isError result))
        (is (str/includes? (text-of result) "No glossary entry for"))
        (is (str/includes? (text-of result) "not-a-term"))))))

(deftest list-all-test
  (testing "GHY-4522: glossary() lists terms with their definitions"
    (mt/with-empty-h2-app-db!
      (t2/insert! :model/Glossary [{:term "Account" :definition "An org that pays us"}
                                   {:term "Churn"   :definition "An org that stopped paying us"}])
      (let [result (call {})]
        (is (not (:isError result)) (text-of result))
        (is (str/includes? (text-of result) "An org that pays us"))
        (is (str/includes? (text-of result) "An org that stopped paying us"))))))

(deftest list-all-is-paged-test
  (testing "GHY-4522: glossary() pages — `definition` is unbounded TEXT with no cap at any layer, so rendering every
            row in one response puts megabytes behind a carefully bounded description"
    (mt/with-empty-h2-app-db!
      (t2/insert! :model/Glossary (for [i (range 60)]
                                    {:term (format "term-%03d" i) :definition (format "definition %03d" i)}))
      (let [text (text-of (call {}))]
        (is (str/includes? text "definition 000"))
        (is (not (str/includes? text "definition 059")))
        (testing "and it says how to reach the rest"
          (is (str/includes? text "offset: 50")))
        (testing "the page reports what it returned against the whole"
          (is (str/includes? text "\"returned\":50"))
          (is (str/includes? text "\"total\":60"))))
      (testing "offset reaches the tail, which carries no continuation line"
        (let [text (text-of (call {:offset 50}))]
          (is (str/includes? text "definition 059"))
          (is (not (str/includes? text "definition 000")))
          (is (not (str/includes? text "offset:")))))
      (testing "limit narrows the page"
        (let [text (text-of (call {:limit 2}))]
          (is (str/includes? text "definition 001"))
          (is (not (str/includes? text "definition 002")))
          (is (str/includes? text "offset: 2")))))))

(deftest lookup-is-not-paged-test
  (testing "GHY-4522: glossary(term) is a lookup, not a page — a lone match carries no envelope and no continuation line"
    (mt/with-empty-h2-app-db!
      (t2/insert! :model/Glossary [{:term "Account" :definition "An org that pays us"}])
      (let [text (text-of (call {:term "Account"}))]
        (is (= "\"Account\": \"An org that pays us\"" text))))))

(deftest list-all-against-an-empty-glossary-test
  (testing "GHY-4522: glossary() with nothing defined is not an error — the tool lists on every instance"
    (mt/with-empty-h2-app-db!
      (let [result (call {})]
        (is (not (:isError result)) (text-of result))
        (is (str/includes? (text-of result) "No terms are defined"))))))

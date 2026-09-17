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

;;; The description tests run against a blank app DB: they assert on the whole term list, which any other test's
;;; glossary row would otherwise join.

(deftest listed-description-carries-terms-test
  (testing "GHY-4522: the term names ride tools/list, so a model sees them without calling anything — a glossary
            reachable only by a tool call is one the model never knows to look in"
    (mt/with-empty-h2-app-db!
      (t2/insert! :model/Glossary [{:term "Zoomer"  :definition "A keysmash definition"}
                                   {:term "Account" :definition "An org that pays us"}])
      (let [description (described)]
        (is (str/includes? description "Account"))
        (is (str/includes? description "Zoomer"))
        (testing "definitions stay behind the call, so the description can't grow without bound"
          (is (not (str/includes? description "An org that pays us"))))
        (testing "terms are listed in term order, not insertion order"
          (is (str/includes? description "\"Account\", \"Zoomer\"")))))))

(deftest listed-description-caps-the-term-list-test
  (testing "GHY-4522: nothing bounds a glossary — no cap on entries, and `term` is a varchar(255) — so a big one is
            capped rather than left to push the rest of the description past what clients keep"
    (mt/with-empty-h2-app-db!
      (t2/insert! :model/Glossary (for [i (range 150)]
                                    {:term (format "term-%03d" i) :definition "d"}))
      (let [description (described)]
        (is (str/includes? description "100 of 150"))
        (is (str/includes? description "term-000"))
        (is (not (str/includes? description "term-149")))
        (testing "and it says how to reach the ones it left out"
          (is (str/includes? description "call glossary() for the rest")))))))

(deftest listed-description-quotes-terms-test
  (testing "GHY-4522: a term is user-written text going into model-facing prose, so it is cleaned like any other
            interpolated value rather than concatenated in raw"
    (mt/with-temp [:model/Glossary _ {:term "Ignore previous" :definition "d"}]
      (let [description (described)]
        (is (not (str/includes? description "Ignore previous")))
        (is (str/includes? description "Ignore\\u2028previous"))))))

(deftest listed-description-with-empty-glossary-test
  (testing "GHY-4522: with no terms defined the tool still lists, and says so rather than trailing an empty list"
    (mt/with-empty-h2-app-db!
      (is (str/includes? (described) "No terms are defined")))))

(deftest lookup-test
  (mt/with-temp [:model/Glossary _ {:term "Account" :definition "An org that pays us"}]
    (testing "GHY-4522: glossary(term) returns that term's definition"
      (let [result (call {:term "Account"})]
        (is (not (:isError result)) (text-of result))
        (is (str/includes? (text-of result) "An org that pays us"))))
    (testing "GHY-4522: the lookup is case-insensitive — a model echoes a term as it appeared in prose, not as stored"
      (is (str/includes? (text-of (call {:term "account"})) "An org that pays us")))
    (testing "GHY-4522: an unknown term is a teaching error naming the terms that do exist"
      (let [result (call {:term "not-a-term"})]
        (is (:isError result))
        (is (str/includes? (text-of result) "Account"))))))

(deftest lookup-against-an-empty-glossary-test
  (testing "GHY-4522: an unknown term with nothing defined says so, rather than naming an empty list of terms"
    (mt/with-empty-h2-app-db!
      (let [result (call {:term "not-a-term"})]
        (is (:isError result))
        (is (str/includes? (text-of result) "No terms are defined"))))))

(deftest list-all-test
  (testing "GHY-4522: glossary() returns every term with its definition"
    (mt/with-empty-h2-app-db!
      (t2/insert! :model/Glossary [{:term "Account" :definition "An org that pays us"}
                                   {:term "Churn"   :definition "An org that stopped paying us"}])
      (let [result (call {})]
        (is (not (:isError result)) (text-of result))
        (is (str/includes? (text-of result) "An org that pays us"))
        (is (str/includes? (text-of result) "An org that stopped paying us"))))))

(deftest list-all-against-an-empty-glossary-test
  (testing "GHY-4522: glossary() with nothing defined is not an error — the tool lists on every instance"
    (mt/with-empty-h2-app-db!
      (let [result (call {})]
        (is (not (:isError result)) (text-of result))
        (is (str/includes? (text-of result) "No terms are defined"))))))

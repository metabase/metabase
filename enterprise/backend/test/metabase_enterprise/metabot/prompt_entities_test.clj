(ns metabase-enterprise.metabot.prompt-entities-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot.prompt-entities :as prompt-entities]
   [metabase-enterprise.semantic-search.db.datasource :as semantic.db.datasource]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- approx [target] #(< (abs (- (double %) (double target))) 1e-9))

(deftest score-blends-similarity-and-canonical-boost-test
  (let [score (var-get #'prompt-entities/score)]
    (testing "similarity = 1 - cosine distance; canonical adds a flat boost"
      (is (=? {:cosine_distance 0.2 :similarity (approx 0.8) :canonical true  :canonical_boost 0.15 :total (approx 0.95)}
              (score {:distance 0.2 :canonical true})))
      (is (=? {:cosine_distance 0.2 :similarity (approx 0.8) :canonical false :canonical_boost 0.0 :total (approx 0.8)}
              (score {:distance 0.2 :canonical false}))))
    (testing "a canonical hit outranks a source-set hit at the same distance"
      (is (> (:total (score {:distance 0.2 :canonical true}))
             (:total (score {:distance 0.2 :canonical false})))))))

(deftest canonical-entities?-test
  (let [canonical? (var-get #'prompt-entities/canonical-entities?)]
    (is (true?  (canonical? {:type "canonical" :entity {:model "table" :id 42}})))
    (is (false? (canonical? {:type "sources" :entities [{:model "table" :id 1}]})))))

(deftest dispatch-without-pgvector-test
  (testing "with the feature enabled but pgvector unconfigured, the EE impls degrade gracefully"
    ;; Pin db-url to nil so the result is deterministic regardless of any ambient MB_PGVECTOR_DB_URL:
    ;; pgvector-available? is false, so the feature-gated EE impls run their early-return branch —
    ;; search returns [], and the mirror writes no-op (return nil) rather than throwing.
    (mt/with-premium-features #{:semantic-search}
      (with-redefs [semantic.db.datasource/db-url nil]
        (is (= [] (prompt-entities/search-prompt-entities "anything" 10)))
        (is (nil? (prompt-entities/upsert-prompt-entity! 1 "p" {:type "canonical"})))
        (is (nil? (prompt-entities/delete-prompt-entity! 1)))))))

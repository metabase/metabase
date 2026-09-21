(ns metabase.collections.curation-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.curation :as collections.curation]))

(deftest curated?-test
  (testing "verified card/dashboard is curated"
    (is (collections.curation/curated? {:model "card" :verified true}))
    (is (collections.curation/curated? {:model "dashboard" :verified true})))
  (testing "official-collection content is curated"
    (is (collections.curation/curated? {:model "card" :official_collection true})))
  (testing "plain content is not curated"
    (is (not (collections.curation/curated? {:model "card"})))
    (is (not (collections.curation/curated? {:model "table"}))))
  (testing "non-table library content is always curated"
    (is (collections.curation/curated? {:model "metric" :root_collection_type "library-metrics"}))
    (is (collections.curation/curated? {:model "segment" :root_collection_type "library"})))
  (testing "published tables count only when at the final data layer (BOT-1536)"
    (is (collections.curation/curated? {:model "table" :is_published true :data_layer "final"}))
    (is (not (collections.curation/curated? {:model "table" :is_published true :data_layer "internal"})))
    (is (not (collections.curation/curated? {:model "table" :is_published true :data_layer "hidden"}))))
  (testing "authoritative tables are curated regardless of data layer"
    (is (collections.curation/curated? {:model "table" :data_authority "authoritative"}))
    (is (collections.curation/curated? {:model "table" :data_authority "authoritative" :data_layer "internal"})))
  (testing "text signals are normalized whether keyword or string"
    (is (collections.curation/curated? {:model "table" :is_published true :data_layer :final}))
    (is (collections.curation/curated? {:model :metric :root_collection_type :library-metrics}))
    (is (collections.curation/curated? {:model "table" :data_authority :authoritative})))
  (testing "boolean signals are coerced — only true/1 count, not numeric 0 (DB driver quirk)"
    (is (collections.curation/curated? {:model "card" :verified 1}))
    (is (collections.curation/curated? {:model "card" :official_collection 1}))
    (is (not (collections.curation/curated? {:model "card" :verified 0})))
    (is (not (collections.curation/curated? {:model "card" :official_collection 0})))
    (is (not (collections.curation/curated? {:model "table" :is_published 0 :data_layer "final"})))))

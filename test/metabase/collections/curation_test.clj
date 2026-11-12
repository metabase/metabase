(ns metabase.collections.curation-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.curation :as collections.curation]))

(deftest curated?-test
  (testing "official content (in a remote-synced collection) is curated"
    (is (collections.curation/curated? {:model "card" :official true}))
    (is (collections.curation/curated? {:model "dashboard" :official true}))
    (is (collections.curation/curated? {:model "table" :official true})))
  (testing "content outside remote-synced collections is not curated"
    (is (not (collections.curation/curated? {:model "card"})))
    (is (not (collections.curation/curated? {:model "card" :official false})))
    (is (not (collections.curation/curated? {:model "metric" :root_collection_type "library-metrics"})))
    (is (not (collections.curation/curated? {:model "table" :is_published true :data_layer "final"})))
    (is (not (collections.curation/curated? {:model "table" :data_authority "authoritative"}))))
  (testing "boolean signals are coerced so only true or 1 count"
    (is (collections.curation/curated? {:model "card" :official 1}))
    (is (not (collections.curation/curated? {:model "card" :official 0})))))

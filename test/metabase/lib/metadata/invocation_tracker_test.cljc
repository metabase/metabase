(ns metabase.lib.metadata.invocation-tracker-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is]]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.invocation-tracker :as lib.metadata.invocation-tracker]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

#?(:cljs
   (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel track-card-calls-test
  (let [card-1 {:id            1
                :name          "Card 1"
                :database-id   (meta/id)}
        card-2 {:id            2
                :name          "Card 2"
                :database-id   (meta/id)}
        mp     (lib.metadata.invocation-tracker/invocation-tracker-provider
                (lib.tu/mock-metadata-provider
                 {:cards [card-1 card-2]}))]
    (is (=? card-1 (lib.metadata/card mp (:id card-1))))
    (is (= [(:id card-1)]
           (lib.metadata/invoked-ids mp :metadata/card)))
    (is (=? card-2 (lib.metadata/card mp (:id card-2))))
    (is (= [(:id card-1) (:id card-2)]
           (lib.metadata/invoked-ids mp :metadata/card)))))

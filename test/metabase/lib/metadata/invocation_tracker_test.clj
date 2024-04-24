(ns metabase.lib.metadata.invocation-tracker-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest ^:parallel track-card-calls-test
  (t2.with-temp/with-temp [:model/Card {card-id-1 :id} {}
                           :model/Card {card-id-2 :id} {}]
    (let [provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))]
      (lib.metadata/card provider card-id-1)
      (is (= [card-id-1]
             (lib.metadata/invoked-ids provider :metadata/card)))
      (lib.metadata/card provider card-id-2)
      (is (= [card-id-1 card-id-2]
             (lib.metadata/invoked-ids provider :metadata/card))))))

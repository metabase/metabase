(ns metabase.embeddings.embedder-plugin-name-test
  (:require
   [clojure.test :refer :all]
   [metabase.embeddings.startup :as embeddings.startup]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

(deftest embedder-plugin-name-matches-manifest-test
  (testing "embedder-plugin-name matches the manifest's info.name"
    (is (= (get-in (yaml/parse-string
                    (slurp "modules/embedder/resources/metabase/embedder/metabase-plugin.yaml"))
                   [:info :name])
           embeddings.startup/embedder-plugin-name))))

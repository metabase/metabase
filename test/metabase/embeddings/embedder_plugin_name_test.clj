(ns metabase.embeddings.embedder-plugin-name-test
  (:require
   [clojure.test :refer :all]
   [metabase.core.core :as core]
   [metabase.util.yaml :as yaml]))

(set! *warn-on-reflection* true)

(deftest embedder-plugin-name-matches-manifest-test
  (testing "core/embedder-plugin-name is what plugins/registered? looks up by, so it must match the manifest"
    (is (= (get-in (yaml/parse-string
                    (slurp "modules/embedder/resources/metabase/embedder/metabase-plugin.yaml"))
                   [:info :name])
           core/embedder-plugin-name))))

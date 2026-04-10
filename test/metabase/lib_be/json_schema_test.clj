(ns metabase.lib-be.json-schema-test
  (:require
   [clojure.java.shell :as sh]
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.lib-be.json-schema :as js]
   [metabase.lib.test-util.generators :as gen]
   [metabase.test :as mt]
   [metabase.util.json :as json-util])
  (:import (java.io File)))

(defn check-node [node]
  (when (map? node)
    (is (not= false (:items node)))
    (when-let [one-of (:oneOf node)]
      (is (< 1 (count one-of))))
    (when-let [one-of (:allOf node)]
      (is (< 1 (count one-of)))))
  node)

;; If you end up making changes to the json schema generator, install jv to make
;; sure the validation tests below are run:
;; https://github.com/santhosh-tekuri/jsonschema

(deftest fix-json-schema-test
  (let [schema (js/make-schema)]
    (testing "does it pass the malli schema?"
      (is (map? schema)))
    (testing "it should get rid of empty and one-branched oneOfs/allOf"
      (walk/postwalk check-node schema))
    (testing "existing test query are valid"
      (let [schema-file (File/createTempFile "json-schema" "test")
            query (gen/random-query (mt/metadata-provider))]
        (spit schema-file (json-util/encode schema))
        (try
          (let [query-json (json-util/encode query {:pretty true})
                jv (sh/sh "jv" (str schema-file) "/dev/stdin" :in query-json)]
            (is (zero? (:exit jv))
                (format "invalid query %s %s" query-json (:err jv))))
          ;; If you don't have the jv validator installed, don't worry about it
          (catch java.io.IOException e
            (when-not (re-find #"No such file or directory" (str e))
              (throw e)))
          (finally (.delete schema-file)))))))

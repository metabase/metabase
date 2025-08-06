(ns metabase-enterprise.semantic-search.index-embedding-test
  "Tests for things at the intersection of the index and embedding namespaces."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase.test :as mt]))

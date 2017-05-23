(ns metabase.sync-database.cached-values-test
  (:require [expectations :refer :all]
            [metabase.test.util :as tu]
            [metabase.sync-database.cached-values :refer :all]
            [metabase.db.metadata-queries :as metadata-queries]
            [clojure.string :as str]))

(expect
  {:values nil}
  (with-redefs-fn {#'metadata-queries/field-distinct-values (constantly [(str/join (repeat 50000 "A"))])}
    #(extract-field-values {:base_type :type/Category} {})))

(expect
  {:values       [1 2 3 4]}
  (with-redefs-fn {#'metadata-queries/field-distinct-values (constantly [1 2 3 4])}
    #(extract-field-values {:base_type :type/Category} {})))



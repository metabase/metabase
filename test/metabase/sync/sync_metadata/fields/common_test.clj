(ns metabase.sync.sync-metadata.fields.common-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.sync-metadata.fields.common :as common]))

(deftest ^:parallel canonical-names-equal?-test
  #_{:clj-kondo/ignore [:equals-true]}
  (are [s1 s2 result] (= result (#'common/canonical-names-equal? {:name s1} {:name s2}))
    "id"     "ID"     true
    "Id"     "id"     true
    "id"     "id"     true
    "FoObAr" "FOOBAR" true
    "foo"    "bar"    false
    ;; Turkish character handling is one of the reasons why this function is important.
    "ıd"     "id"     true
    "ıd"     "ID"     true
    "ıD"     "Id"     true
    "ıD"     "yd"     false))

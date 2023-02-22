(ns metabase.lib.query-test
  #?@
   (:clj
    [(:require
      [clojure.test :as t]
      [metabase.lib.query :as lib.query]
      [metabase.lib.test-metadata :as lib.test-metadata])]
    :cljs
    [(:require
      [cljs.test :as t :include-macros true]
      [metabase.lib.query :as lib.query]
      [metabase.lib.test-metadata :as lib.test-metadata])]))

(t/deftest ^:parallel query-test
  (t/is (=? {:database (lib.test-metadata/id)
             :type     :query
             :query    {:source-table (lib.test-metadata/id :venues)}}
            (lib.query/query lib.test-metadata/metadata "VENUES"))))

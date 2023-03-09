(ns metabase.lib.metadata.calculate.resolve-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculate.resolve :as calculate.resolve]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel resolve-join-test
  (let [query       (lib/query meta/metadata-provider (meta/table-metadata :venues))
        join-clause (-> ((lib/join-clause
                          (meta/table-metadata :categories)
                          (lib/=
                           (lib/field (meta/id :venues :category-id))
                           (lib/with-join-alias (lib/field (meta/id :categories :id)) "CATEGORIES__via__CATEGORY_ID")))
                         query -1)
                        ;; TODO -- need a nice way to set the alias of a join.
                        (assoc :alias "CATEGORIES__via__CATEGORY_ID"))
        query       (lib/join query join-clause)]
    (is (= join-clause
           (calculate.resolve/join query -1 "CATEGORIES__via__CATEGORY_ID")))))

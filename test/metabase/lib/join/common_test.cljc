(ns metabase.lib.join.common-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.core :as lib]
   [metabase.lib.join :as lib.join]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(deftest ^:parallel resolve-join-test
  (let [query       lib.tu/venues-query
        join-clause (-> (lib/join-clause
                         (meta/table-metadata :categories)
                         [(lib/=
                           (meta/field-metadata :venues :category-id)
                           (lib/with-join-alias (meta/field-metadata :categories :id) "CATEGORIES__via__CATEGORY_ID"))])
                        (lib/with-join-alias "CATEGORIES__via__CATEGORY_ID"))
        query       (lib/join query join-clause)]
    (is (= join-clause
           (lib.join/resolve-join query -1 "CATEGORIES__via__CATEGORY_ID")))))

(ns metabase.lib.metadata.column-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.column :as lib.metadata.column]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.notebook-helpers :as lib.tu.notebook]))

(deftest ^:parallel column-unique-key-test
  (let [query           (-> (lib/query meta/metadata-provider (meta/table-metadata :venues))
                            (lib/join (meta/table-metadata :categories)))
        categories-name (lib.tu.notebook/find-col-with-spec query
                                                            (lib/returned-columns query)
                                                            {:display-name "Categories"}
                                                            {:display-name "Name"})]
    (is (= "column-unique-key-v1$Categories__NAME"
           (lib.metadata.column/column-unique-key categories-name)))
    (is (= categories-name
           (lib.metadata.column/column-with-unique-key query "column-unique-key-v1$Categories__NAME")))))

(deftest ^:parallel column-unique-key-error-on-unknown-version-test
  (let [query (lib/query meta/metadata-provider (meta/table-metadata :venues))]
    (is (thrown-with-msg?
         #?(:clj java.lang.IllegalArgumentException :cljs :default)
         #"No matching clause: 123456"
         (lib.metadata.column/column-with-unique-key query "column-unique-key-v123456$Categories__NAME")))))

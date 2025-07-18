(ns metabase.lib.schema.metadata-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.schema.metadata :as lib.schema.metadata]))

(deftest ^:parallel normalize-column-metadata-test
  (let [col {"active"                    true
             "base-type"                 "type/Text"
             "database-type"             "CHARACTER VARYING"
             "display-name"              "Category"
             "effective-type"            "type/Text"
             "field-ref"                 ["field" 61339 nil]
             "fingerprint"               {"global" {"distinct-count" 4, "nil%" 0.0}
                                          "type"
                                          {"type/Text" {"average-length" 6.375
                                                        "percent-email"  0.0
                                                        "percent-json"   0.0
                                                        "percent-state"  0.0
                                                        "percent-url"    0.0}}}
             "id"                        61339
             "lib/breakout?"             true
             "lib/deduplicated-name"     "CATEGORY"
             "lib/desired-column-alias"  "CATEGORY"
             "lib/original-display-name" "Category"
             "lib/original-name"         "CATEGORY"
             "lib/source"                "source/table-defaults"
             "lib/source-column-alias"   "CATEGORY"
             "lib/type"                  "metadata/column"
             "name"                      "CATEGORY"
             "position"                  3
             "semantic-type"             "type/Category"
             "source"                    "breakout"
             "table-id"                  10808
             "visibility-type"           "normal"}]
    (is (= {:active                    true
            :base-type                 :type/Text
            :database-type             "CHARACTER VARYING"
            :display-name              "Category"
            :effective-type            :type/Text
            :field-ref                 [:field 61339 nil]
            :fingerprint               {:global {:distinct-count 4, :nil% 0.0}
                                        :type   {:type/Text {:average-length 6.375
                                                             :percent-email  0.0
                                                             :percent-json   0.0
                                                             :percent-state  0.0
                                                             :percent-url    0.0}}}
            :id                        61339
            :name                      "CATEGORY"
            :position                  3
            :semantic-type             :type/Category
            :source                    :breakout
            :table-id                  10808
            :visibility-type           :normal
            :lib/breakout?             true
            :lib/deduplicated-name     "CATEGORY"
            :lib/desired-column-alias  "CATEGORY"
            :lib/original-display-name "Category"
            :lib/original-name         "CATEGORY"
            :lib/source                :source/table-defaults
            :lib/source-column-alias   "CATEGORY"
            :lib/type                  :metadata/column}
           (lib.normalize/normalize ::lib.schema.metadata/column col)))))

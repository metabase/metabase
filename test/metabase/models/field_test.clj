(ns metabase.models.field-test
  "Tests for specific behavior related to the Field model."
  (:require [clojure.test :refer :all]
            [metabase.models.field :refer [Field]]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan.db :as db]))

(deftest unknown-types-test
  (doseq [{:keys [column unknown-type fallback-type]} [{:column        :base_type
                                                        :unknown-type  :type/Amazing
                                                        :fallback-type :type/*}
                                                       {:column        :effective_type
                                                        :unknown-type  :type/Amazing
                                                        :fallback-type :type/*}
                                                       {:column        :semantic_type
                                                        :unknown-type  :type/Amazing
                                                        :fallback-type nil}
                                                       {:column        :coercion_strategy
                                                        :unknown-type  :Coercion/Amazing
                                                        :fallback-type nil}]]
    (testing (format "Field with unknown %s in DB should fall back to %s" column fallback-type)
      (mt/with-temp Field [field]
        (db/execute! {:update Field
                      :set    {column (u/qualified-name unknown-type)}
                      :where  [:= :id (u/the-id field)]})
        (is (= fallback-type
               (db/select-one-field column Field :id (u/the-id field))))))
    (testing (format "Should throw an Exception if you attempt to save a Field with an invalid %s" column)
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           (re-pattern (format "Invalid Field %s %s" column unknown-type))
           (mt/with-temp Field [field {column unknown-type}]
             field))))))

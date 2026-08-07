(ns metabase.metabot.util-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.util :as metabot.u]))

(deftest ^:parallel transform-query->text-test
  (testing "native query renders as its SQL"
    (is (= "SELECT 1"
           (metabot.u/transform-query->text {:stages [{:lib/type :mbql.stage/native
                                                       :native   "SELECT 1"}]}))))
  (testing "legacy format renders as its SQL"
    (is (= "SELECT 2"
           (metabot.u/transform-query->text {:native {:query "SELECT 2"}}))))
  (testing "notebook-built query renders as EDN without the metadata provider"
    (let [text (metabot.u/transform-query->text {:lib/type     :mbql/query
                                                 :lib/metadata :fake-provider
                                                 :stages       [{:lib/type :mbql.stage/mbql}]})]
      (is (str/includes? text ":mbql.stage/mbql"))
      (is (not (str/includes? text ":lib/metadata")))))
  (testing "raw string query passes through verbatim"
    (is (= "SELECT * FROM legacy" (metabot.u/transform-query->text "SELECT * FROM legacy"))))
  (testing "nil stays nil"
    (is (nil? (metabot.u/transform-query->text nil)))))

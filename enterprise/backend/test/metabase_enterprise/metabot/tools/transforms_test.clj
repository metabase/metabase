(ns metabase-enterprise.metabot.tools.transforms-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot.tools.transforms :as ee-transforms]))

(deftest ^:parallel format-python-library-output-test
  (testing "library source renders verbatim, unescaped"
    (is (= (str "<python-library path=\"common.py\">\n"
                "  <content>df[(df.a < 10) & (df.b > 2)]</content>\n"
                "</python-library>")
           (#'ee-transforms/format-python-library-output
            {:path "common.py" :content "df[(df.a < 10) & (df.b > 2)]"}))))
  (testing "path is escaped as an attribute"
    (is (= "<python-library path=\"a&quot;b.py\">\n</python-library>"
           (#'ee-transforms/format-python-library-output {:path "a\"b.py"})))))

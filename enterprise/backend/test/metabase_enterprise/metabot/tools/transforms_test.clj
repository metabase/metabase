(ns metabase-enterprise.metabot.tools.transforms-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot.tools.transforms :as ee-transforms]
   [metabase-enterprise.metabot.tools.transforms.write :as transforms-write]
   [metabase.test :as mt]))

(def ^:private python-source "df[(df.a < 10) & (df.b > 2)]")

(def ^:private rendered-library
  (str "<python-library path=\"common.py\">\n"
       "  <content>" python-source "</content>\n"
       "</python-library>"))

(deftest ^:parallel format-python-library-output-test
  (testing "library source renders verbatim, unescaped"
    (is (= rendered-library
           (#'ee-transforms/format-python-library-output
            {:path "common.py" :source python-source}))))
  (testing "path is escaped as an attribute"
    (is (= "<python-library path=\"a&quot;b.py\">\n</python-library>"
           (#'ee-transforms/format-python-library-output {:path "a\"b.py"})))))

(deftest get-transform-python-library-details-tool-test
  (testing "the tool renders the :source key the transforms-python API actually returns"
    (mt/with-premium-features #{:transforms-python}
      (with-redefs [transforms-write/get-transform-python-library-details
                    (constantly {:structured_output {:path "common.py"
                                                     :source python-source
                                                     :created_at "2026-01-01T00:00:00Z"
                                                     :updated_at "2026-01-01T00:00:00Z"}})]
        (is (= rendered-library
               (:output (ee-transforms/get-transform-python-library-details-tool {:path "common.py"}))))))))

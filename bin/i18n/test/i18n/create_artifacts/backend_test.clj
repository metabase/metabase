(ns i18n.create-artifacts.backend-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [i18n.create-artifacts.backend :as backend]
            [i18n.create-artifacts.test-common :as test-common]))

(deftest edn-test
  (#'backend/write-edn-file! test-common/po-contents "/tmp/out.edn")
  (is (= ["{"
          "\"No table description yet\"" "\"No hay una descripción de la tabla\""
          ""
          "\"Count of {0}\"" "\"Número de {0}\""
          ""
          "}"]
         (some-> (slurp "/tmp/out.edn")
                 (str/split-lines)))))

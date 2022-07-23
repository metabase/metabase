(ns i18n.create-artifacts.backend-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [i18n.create-artifacts.backend :as backend]
            [i18n.create-artifacts.test-common :as test-common]))

(deftest edn-test
  (#'backend/write-edn-file! test-common/po-contents "/tmp/out.edn")
  (is (= ["{"
          ":headers"
          "{\"MIME-Version\" \"1.0\", \"Content-Type\" \"text/plain; charset=UTF-8\", \"Content-Transfer-Encoding\" \"8bit\", \"X-Generator\" \"POEditor.com\", \"Project-Id-Version\" \"Metabase\", \"Language\" \"es\", \"Plural-Forms\" \"nplurals=2; plural=(n != 1);\"}"
          ""
          ":messages"
          "{"
          "\"No table description yet\""
          "\"No hay una descripción de la tabla\""
          ""
          "\"Count of {0}\""
          "\"Número de {0}\""
           ""
           "\"{0} table\""
           "[\"{0} tabla\" \"{0} tablas\"]"
           ""
           "\"{0} metric\""
           "[\"{0} metrik\" \"\"]"
           ""
          "}"
          "}"]
         (some-> (slurp "/tmp/out.edn")
                 (str/split-lines)))))

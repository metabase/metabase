(ns i18n.create-artifacts.backend-test
  (:require
   [clojure.string :as str]
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

(deftest backend-message?
  (testing "messages present in any .clj and .cljc files are detected as backend messages"
    (are [source-references expected] (= (@#'backend/backend-message? {:source-references source-references})
                                         expected)
      ;; Simple .clj and .cljc files with and without line numbers
      ["test.clj"]                                                                  true
      ["test.clj:123"]                                                              true
      ["test.cljc"]                                                                 true
      ["test.cljc:123"]                                                             true
      ;; Assorted real backend paths from the .po file
      ["src/metabase/query_processor/streaming/xlsx.clj"]                           true
      ["metabase/mbql/normalize.cljc:839"]                                          true
      ["metabase/driver/common.clj:223"]                                            true
      ["backend/mbql/src/metabase/mbql/normalize.clj"]                              true
      ["metabase_enterprise/audit_app/interface.clj:25"]                            true
      ["enterprise/backend/test/metabase_enterprise/serialization/load_test.clj"]   true
      ["target/classes/metabase/server/request/util.clj"]                           true
      ;; Both a FE and a BE path
      ["frontend/src/metabase/browse/components/TableBrowser/TableBrowser.jsx:145"
       "metabase/api/database.clj:178"]                                             true
      ;; FE-only paths
      ["frontend/src/metabase/components/ActionButton.jsx:31"]                      false
      ["frontend/src/metabase/entities/collections/forms.js:22"]                    false
      ["frontend/src/metabase/public/components/widgets/SharingPane.tsx:69"]        false
      ["test.cljs"]                                                                 false
      ["test.cljs:123"]                                                             false
      ;; Invalid or empty references
      []                                                                            false
      ["foo"]                                                                       false)))

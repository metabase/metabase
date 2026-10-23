(ns i18n.common-test
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer :all]
   [i18n.common :as common]
   [i18n.pseudo-locale :as pseudo-locale]
   [metabuild-common.core :as u]))

(set! *warn-on-reflection* true)

(defn- with-catalogs [f]
  (let [^java.io.File directory (u/temporary-file "i18n-test" "")]
    (io/delete-file directory)
    (.mkdir directory)
    (try
      (doseq [locale ["metabase" "fr"]]
        (spit (io/file directory (str locale ".po"))
              (str "msgid \"\"\nmsgstr \"\"\n"
                   "\"Content-Type: text/plain; charset=UTF-8\\n\"\n"
                   "\"Language: fr\\n\"\n\n"
                   "msgid \"Hello\"\nmsgstr \"Bonjour\"\n")))
      (f (str directory))
      (finally
        (doseq [file (reverse (file-seq directory))]
          (io/delete-file file true))))))

(deftest ^:parallel explicit-catalog-directory-test
  (with-catalogs
    (fn [directory]
      (is (= #{"fr"} (common/locales directory)))
      (is (= "Bonjour" (-> (common/po-contents "fr" directory) :messages first :str)))
      (is (= (str (io/file directory "fr.po"))
             (common/locale-source-po-filename "fr" directory))))))

(deftest pseudo-locale-in-update-directory-test
  (with-catalogs
    (fn [directory]
      (let [source (slurp (io/file directory "metabase.po"))]
        (pseudo-locale/generate-pseudo-locale-po! {:source-directory directory})
        (is (= source (slurp (io/file directory "metabase.po")))))
      (is (= #{"fr" "en-ZZ"} (common/locales directory)))
      (is (= "[zz] Hello" (-> (common/po-contents "en-ZZ" directory) :messages first :str))))))

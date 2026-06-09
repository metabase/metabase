(ns metabase.search.appdb.document-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.document :as document]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

;; document->entry dispatches into specialization, which needs a configured app DB to know its db-type.
(use-fixtures :once (fixtures/initialize :db))

(deftest strip-junk-chars-test
  ;; Build inputs from explicit code points rather than embedding raw control bytes in the source file.
  (let [strip @#'document/strip-junk-chars
        c     (fn [code] (str (char code)))]
    (testing "non-string values pass through unchanged"
      (is (= 42        (strip 42)))
      (is (= :a-kw     (strip :a-kw)))
      (is (= nil       (strip nil)))
      (is (= [:|| "x"] (strip [:|| "x"]))))
    (testing "NUL byte (0x00) is replaced with a space — Postgres rejects raw NUL in text columns"
      (is (= "a b" (strip (str "a" (c 0x00) "b")))))
    (testing "C0 controls (BEL, BS, VT, FF, US) are replaced with spaces"
      (is (= "a b c d e f"
             (strip (str "a" (c 0x07) "b" (c 0x08) "c" (c 0x0B) "d" (c 0x0C) "e" (c 0x1F) "f")))))
    (testing "tab/newline/CR also become spaces (already whitespace for tsvector tokenization)"
      (is (= "a b c d" (strip "a\tb\nc\rd"))))
    (testing "DEL (0x7F) and C1 controls (0x80-0x9F) are replaced"
      (is (= "a b c d" (strip (str "a" (c 0x7F) "b" (c 0x80) "c" (c 0x9F) "d")))))
    (testing "unpaired surrogate code points are replaced"
      (is (= "a b" (strip (str "a" (char 0xD800) "b")))))
    (testing "ordinary text — letters, digits, punctuation, CJK, emoji — is untouched"
      (is (= "Hello, world! 123 你好 🦄"
             (strip "Hello, world! 123 你好 🦄"))))
    (testing "BOM (U+FEFF) and zero-width joiner (U+200D — Cf class) are intentionally NOT stripped"
      (let [s (str "a" (char 0xFEFF) "b" (char 0x200D) "c")]
        (is (= s (strip s)))))
    (testing "control chars at start/end of string"
      (is (= " a " (strip (str (c 0x07) "a" (c 0x07))))))
    (testing "consecutive control chars each become a space"
      (is (= "a   b" (strip (str "a" (c 0x07) (c 0x08) (c 0x0B) "b")))))))

(deftest document->entry-junk-chars-test
  ;; document->entry calls (specialization/extra-entry-fields entity), which dispatches on (mdb/db-type)
  ;; and is only implemented for :postgres and :h2 — running this on MySQL/MariaDB hits the missing-impl error.
  (when (#{:postgres :h2} (mdb/db-type))
    (let [->entry    @#'document/document->entry
          FF         (str (char 0x000C))
          NUL        (str (char 0x0000))
          BEL        (str (char 0x0007))
          DEL        (str (char 0x007F))
          dirty-name (str "Title" FF "Sub" NUL "title" BEL)
          dirty-st   (str "line1" DEL "line2")
          entity     {:model           "card"
                      :name            dirty-name
                      :searchable_text dirty-st
                      :display_data    {:name dirty-name}
                      :legacy_input    {}
                      :archived        false}
          entry      (->entry entity)]
      (testing "top-level :name column has control chars replaced with spaces"
        (is (= "Title Sub title " (:name entry))))
      (testing "search_vector / extra fields built from the stripped entity contain no raw control chars"
        (let [printed (pr-str (vals (select-keys entry [:search_vector :with_native_query_vector
                                                        :search_terms :native_search_terms])))]
          (is (false? (.contains printed NUL)) "no NUL byte")
          (is (false? (.contains printed BEL)) "no BEL")
          (is (false? (.contains printed FF))  "no form feed")
          (is (false? (.contains printed DEL)) "no DEL")))
      (testing "display_data preserves original characters (value was a map at strip time, encoded after)"
        (let [^String json-str (:display_data entry)]
          (is (false? (.contains json-str ^CharSequence NUL)) "encoded JSON has no raw NUL")
          (is (false? (.contains json-str ^CharSequence FF))  "encoded JSON has no raw form feed"))))))

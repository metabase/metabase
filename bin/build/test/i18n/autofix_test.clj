(ns i18n.autofix-test
  (:require
   [clojure.test :refer :all]
   [i18n.autofix :as autofix]))

(defn- backend-msg [str-value]
  {:id                "Hello"
   :id-plural         nil
   :str               str-value
   :str-plural        nil
   :plural?           false
   :source-references ["metabase/foo.clj:10"]})

(defn- frontend-msg [str-value]
  {:id                "Hello"
   :id-plural         nil
   :str               str-value
   :str-plural        nil
   :plural?           false
   :source-references ["frontend/src/metabase/foo.tsx:20"]})

(defn- backend-plural-msg [str-plural]
  {:id                "Hello {0}"
   :id-plural         "Hello {0} people"
   :str               nil
   :str-plural        str-plural
   :plural?           true
   :source-references ["metabase/foo.clj:10"]})

(defn- fix-backend-str [s]
  (-> {:headers {} :messages [(backend-msg s)]}
      autofix/autofix-po-contents
      :messages
      first
      :str))

(defn- fix-frontend-str [s]
  (-> {:headers {} :messages [(frontend-msg s)]}
      autofix/autofix-po-contents
      :messages
      first
      :str))

(deftest ^:parallel backend-apostrophe-fix-test
  (testing "Word-adjacent apostrophes in backend messages get doubled"
    (are [input expected] (= expected (fix-backend-str input))
      "d'aquí a {0} mesos"           "d''aquí a {0} mesos"
      "It's {0}"                      "It''s {0}"
      "won't {0} do"                  "won''t {0} do"
      "Cam's file"                    "Cam''s file"))

  (testing "Already-escaped apostrophes are not re-doubled"
    (is (= "It''s fine" (fix-backend-str "It''s fine"))))

  (testing "Intentional MessageFormat escapes (apostrophe adjacent to {}) are preserved"
    (are [input expected] (= expected (fix-backend-str input))
      "'{0}'"                         "'{0}'"
      "'{login}' literal"             "'{login}' literal"
      "'''{{...}}''' clause"          "'''{{...}}''' clause"))

  (testing "Strings without apostrophes pass through unchanged"
    (is (= "Hello {0}" (fix-backend-str "Hello {0}")))
    (is (= "" (fix-backend-str ""))))

  (testing "nil msgstr passes through as nil"
    (is (nil? (fix-backend-str nil)))))

(deftest ^:parallel backend-plural-apostrophe-fix-test
  (testing "Each plural form gets its apostrophes fixed"
    (let [fixed (-> {:headers {} :messages [(backend-plural-msg ["d'aquí" "d'aquí a {0}"])]}
                    autofix/autofix-po-contents
                    :messages
                    first
                    :str-plural)]
      (is (= ["d''aquí" "d''aquí a {0}"] fixed)))))

(deftest ^:parallel frontend-messages-pass-through-unchanged-test
  (testing "Frontend messages keep their apostrophes untouched — ttag doesn't use MessageFormat escapes"
    (are [input] (= input (fix-frontend-str input))
      "d'aquí a {0} mesos"
      "It's {0}"
      "won't do")))

(deftest ^:parallel po-contents-shape-preserved-test
  (testing "Headers pass through untouched"
    (let [input {:headers {"Content-Type" "text/plain; charset=UTF-8"
                           "Plural-Forms" "nplurals=2; plural=(n != 1);"}
                 :messages []}]
      (is (= (:headers input)
             (:headers (autofix/autofix-po-contents input))))))

  (testing "Message count is preserved — autofix transforms, never drops"
    (let [input {:headers {}
                 :messages [(backend-msg "a'b")
                            (frontend-msg "c'd")
                            (backend-plural-msg ["e'f" "g'h"])]}]
      (is (= 3 (count (:messages (autofix/autofix-po-contents input))))))))

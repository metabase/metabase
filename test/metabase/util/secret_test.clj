(ns metabase.util.secret-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.util.secret :as u.secret]))

;;; ------------------------------------------------ audience shapes -------------------------------------------------

(def ^:private db-schema
  [:map
   [:host               {:optional true} ::u.secret/hostname]
   [:port               {:optional true} :int]
   [:ssl                {:optional true} :boolean]
   [:additional-options {:optional true} :string]])

(def ^:private smtp-schema
  [:map
   [:host     {:optional true} ::u.secret/hostname]
   [:port     {:optional true} :int]
   [:security {:optional true} :string]])

(deftest canonical-audience-selects-declared-fields-test
  (testing "the schema picks the audience fields out of a whole record, ignoring the rest"
    (is (= {:host "db.example.com" :port 5432}
           (u.secret/canonical-audience db-schema {:host             "db.example.com"
                                                   :port             5432
                                                   :name             "Prod warehouse"
                                                   :cache-ttl        60
                                                   :password         "hunter2"})))))

(deftest canonical-audience-normalizes-per-declared-type-test
  (testing "::hostname ignores case, because DNS is case-insensitive"
    (is (= {:host "db.example.com"} (u.secret/canonical-audience [:map [:host ::u.secret/hostname]] {:host "DB.Example.COM"}))))
  (testing "a plain :string does NOT -- it is the safe default, so a value only relaxes by naming a schema that does"
    (is (= {:account "AcmeCorp"} (u.secret/canonical-audience [:map [:account :string]] {:account "AcmeCorp"})))
    (is (not (u.secret/same-audience? [:map [:account :string]] {:account "AcmeCorp"} {:account "acmecorp"}))))
  (testing "a plain :int is the same whether it arrives as a string or a number, via mtx/string-transformer"
    (is (= (u.secret/canonical-audience db-schema {:port "5432"})
           (u.secret/canonical-audience db-schema {:port 5432}))))
  (testing "a plain :boolean treats \"true\"/\"false\" and true/false alike, and keeps false rather than dropping it"
    (is (= {:ssl true}  (u.secret/canonical-audience db-schema {:ssl "true"})))
    (is (= {:ssl false} (u.secret/canonical-audience db-schema {:ssl false})))
    (testing "the built-in decoding is case-sensitive, so \"TRUE\" stays a string and reads as a different audience --
             a fail-closed limitation we take rather than reintroduce a schema of our own for it"
      (is (= {:ssl "TRUE"} (u.secret/canonical-audience db-schema {:ssl "TRUE"})))))
  (testing "whitespace around a hostname is insignificant -- it is not part of the name"
    (is (= {:host "db.example.com"} (u.secret/canonical-audience db-schema {:host "  db.example.com  "}))))
  (testing "but an opaque :string is compared exactly, whitespace and all, since there it might mean something"
    (is (not (u.secret/same-audience? db-schema
                                      {:additional-options "a=1"}
                                      {:additional-options " a=1"}))))
  (testing "an absent value, nil and an empty string all mean unset"
    (is (= (u.secret/canonical-audience db-schema {:host "h"})
           (u.secret/canonical-audience db-schema {:host "h" :port nil})
           (u.secret/canonical-audience db-schema {:host "h" :port ""}))))
  (testing "::url-path drops a trailing slash"
    (is (= (u.secret/canonical-audience [:map [:path ::u.secret/url-path]] {:path "/v1/"})
           (u.secret/canonical-audience [:map [:path ::u.secret/url-path]] {:path "/v1"})))))

(deftest canonical-audience-rejects-unknown-field-schema-test
  (testing "a typo in a schema is a loud error from the registry, not a silently unguarded field"
    (is (thrown? Exception
                 (u.secret/canonical-audience [:map [:host ::u.secret/no-such-schema]] {:host "h"})))))

(deftest canonical-audience-does-not-resolve-defaults-test
  (testing "an unset port is NOT equated with the driver's default -- nothing here knows what absent resolves to, so
           this fails closed and asks for the credential rather than guessing"
    (is (not (u.secret/same-audience? db-schema {:host "h"} {:host "h" :port 5432})))))

(deftest url-audience-test
  (testing "scheme and host are case-insensitive, a trailing slash is dropped"
    (is (= {:scheme "https" :host "api.example.com" :path "/v1"}
           (u.secret/canonical-audience ::u.secret/url-audience
                                        (u.secret/url->audience-fields "HTTPS://API.Example.com/v1/")))))
  (testing "an absent port stays absent rather than being filled with the scheme default"
    (is (nil? (:port (u.secret/url->audience-fields "https://api.example.com")))))
  (testing "an explicit port is preserved"
    (is (= 8443 (:port (u.secret/url->audience-fields "https://api.example.com:8443")))))
  (testing "http and https to the same host are different audiences"
    (is (not (u.secret/same-audience? ::u.secret/url-audience
                                      (u.secret/url->audience-fields "https://api.example.com")
                                      (u.secret/url->audience-fields "http://api.example.com"))))))

;;; --------------------------------------------- audience comparison ------------------------------------------------

(deftest same-audience?-test
  (let [stored {:host "db.example.com" :port 5432 :ssl true}]
    (testing "the same audience, however spelled"
      (is (true? (u.secret/same-audience? db-schema stored stored)))
      (is (true? (u.secret/same-audience? db-schema stored {:host "DB.Example.com" :port "5432" :ssl "true"}))))
    (testing "a different host is a different audience"
      (is (false? (u.secret/same-audience? db-schema stored (assoc stored :host "evil.example.com")))))
    (testing "a different port is too -- port change is protocol downgrade in disguise (587 -> 25, 636 -> 389)"
      (is (false? (u.secret/same-audience? db-schema stored (assoc stored :port 5433)))))
    (testing "fields outside the schema do not affect the comparison"
      (is (true? (u.secret/same-audience? db-schema stored (assoc stored :name "renamed")))))))

(deftest same-audience?-catches-transport-downgrade-test
  (testing "the destination never changed, but the channel protecting the credential did"
    (is (false? (u.secret/same-audience? db-schema
                                         {:host "db" :port 5432 :ssl true}
                                         {:host "db" :port 5432 :ssl false})))
    (is (false? (u.secret/same-audience? smtp-schema
                                         {:host "smtp" :port 587 :security "starttls"}
                                         {:host "smtp" :port 587 :security "none"}))))
  (testing "including a downgrade smuggled through a free-text options field, which is declared :string and so
           compared opaquely rather than parsed"
    (is (false? (u.secret/same-audience? db-schema
                                         {:host "db" :port 5432 :additional-options "prepareThreshold=0"}
                                         {:host "db" :port 5432 :additional-options "sslmode=disable"}))))
  (testing "strengthening protection is refused too, rather than modelling what each driver's settings mean"
    (is (false? (u.secret/same-audience? db-schema
                                         {:host "db" :port 5432 :ssl false}
                                         {:host "db" :port 5432 :ssl true})))))

;;; -------------------------------------------------- expose --------------------------------------------------------

(deftest expose-requires-an-audience-test
  (testing "there is no zero-audience arity -- exposing without saying where is unrepresentable"
    (testing "the call is inlined, so a bare (expose s) does not even compile"
      (is (thrown? Exception
                   (eval '(metabase.util.secret/expose (metabase.util.secret/secret "s"))))))
    (testing "and it is refused dynamically too"
      (is (thrown? clojure.lang.ArityException
                   (apply @(resolve 'metabase.util.secret/expose) [(u.secret/secret "s")]))))))

(deftest expose-to-matching-audience-test
  (let [aud {:host "db.example.com" :port 5432 :ssl true}
        s   (u.secret/secret "hunter2" {:audience-schema db-schema :audience aud})]
    (is (= "hunter2" (u.secret/expose s aud)))
    (testing "the declared schema normalizes both sides the same way"
      (is (= "hunter2" (u.secret/expose s {:host "DB.Example.com" :port "5432" :ssl "true"}))))))

(deftest secret-bound-to-an-audience-must-declare-a-schema-test
  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"must declare an :audience-schema"
                        (u.secret/secret "hunter2" {:audience {:host "h"}}))))

(deftest expose-to-different-host-throws-test
  (let [s (u.secret/secret "hunter2" {:audience-schema db-schema
                                      :audience {:host "db.example.com" :port 5432 :ssl true}})]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not bound"
                          (u.secret/expose s {:host "evil.example.com" :port 5432 :ssl true})))))

(deftest expose-downgrade-throws-test
  (testing "same host, weaker transport -- the destination never changed"
    (let [s (u.secret/secret "hunter2" {:audience-schema smtp-schema
                                        :audience {:host "smtp.example.com" :port 587 :security "starttls"}})]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not bound"
                            (u.secret/expose s {:host "smtp.example.com" :port 587 :security "none"}))))))

(deftest expose-error-does-not-leak-the-secret-test
  (let [s (u.secret/secret "hunter2" {:audience-schema db-schema :audience {:host "a" :port 1 :ssl true}})]
    (try
      (u.secret/expose s {:host "b" :port 1 :ssl true})
      (is false "should have thrown")
      (catch clojure.lang.ExceptionInfo e
        (is (not (re-find #"hunter2" (pr-str (ex-data e)))))
        (is (not (re-find #"hunter2" (ex-message e))))
        (is (= :secret-audience-mismatch (:error-code (ex-data e))))))))

(deftest expose-disclosure-reason-test
  (testing "the one non-network reason -- handing a credential to a person -- is accepted"
    (is (= "mb_abc" (u.secret/expose (u.secret/secret "mb_abc") :disclosure/to-creator))))
  (testing "the reason set is closed"
    (is (= #{:disclosure/to-creator} u.secret/disclosure-reasons))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Unknown disclosure reason"
                          (u.secret/expose (u.secret/secret "mb_abc") :derive/hash)))))

(deftest expose-network-audience-on-unbound-secret-throws-test
  (testing "a secret with no bound audience cannot be sent to a network peer"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"no bound audience"
                          (u.secret/expose (u.secret/secret "s") {:host "h" :port 1 :ssl true})))))

;;; --------------------------------------------------- mask ---------------------------------------------------------

(deftest mask-is-value-independent-by-default-test
  (testing "the default mask leaks neither content nor length"
    (is (= (u.secret/mask (u.secret/secret "a"))
           (u.secret/mask (u.secret/secret "a-much-longer-secret-value"))))
    (testing "and reveals no character of the secret"
      (is (not (re-find #"a-much" (u.secret/mask (u.secret/secret "a-much-longer-secret-value"))))))))

(deftest mask-prefix-strategy-test
  (testing "a kind whose prefix is a non-sensitive lookup identifier can reveal it"
    (is (= (str "mb_ab" u.secret/mask-string)
           (u.secret/mask (u.secret/secret "mb_abcdefgh" {:prefix-length 5}))))))

;;; --------------------------------------------- derivations, not exposure ------------------------------------------

(deftest prefix-is-a-method-not-an-exposure-test
  (testing "the revealable prefix is computed by the secret itself; the plaintext is never handed out"
    (is (= "mb_ab" (u.secret/prefix (u.secret/secret "mb_abcdefgh" {:prefix-length 5})))))
  (testing "the length is fixed at construction, so a call site cannot ask for most of the credential"
    (let [s (u.secret/secret "mb_abcdefgh" {:prefix-length 5})]
      (is (= 5 (count (u.secret/prefix s))))))
  (testing "a kind that declared no revealable prefix has none"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"no prefix length"
                          (u.secret/prefix (u.secret/secret "hunter2"))))))

(deftest derive-with-test
  (testing "a one-way derivation gets the plaintext without it becoming a caller-scope binding"
    (is (= "2retnuh" (u.secret/derive-with (u.secret/secret "hunter2") str/reverse))))
  (testing "and needs no unverifiable reason keyword"
    (is (= 7 (u.secret/derive-with (u.secret/secret "hunter2") count)))))

(deftest masked?-recognizes-our-own-mask-test
  (is (true? (u.secret/masked? (u.secret/mask (u.secret/secret "anything")))))
  (is (false? (u.secret/masked? "hunter2")))
  (is (false? (u.secret/masked? nil))))

;;; ------------------------------------------------ redaction -------------------------------------------------------

(deftest tostring-redacts-test
  (let [s (u.secret/secret "hunter2")]
    (is (not (re-find #"hunter2" (str s))))
    (is (not (re-find #"hunter2" (pr-str s))))
    (is (not (re-find #"hunter2" (format "%s" s))))))

(deftest secret?-test
  (is (true? (u.secret/secret? (u.secret/secret "s"))))
  (is (false? (u.secret/secret? "s"))))

(ns dev.security-lint.corpus-test
  "The security-lint test examples: a fake source tree with one instance of every pattern the rules catch, and the
  exact findings the linter must produce from it.

  This is the regression guard the rest of the suite cannot be. Unit tests prove each rule and each graph feature
  in isolation; this proves the *assembled* analyzer still finds what it found. Three graph bugs -- nullary calls
  dropped from edges, `mu/defn` invisible, vector routes mistaken for parameters -- each silently changed the
  whole-codebase results and passed every unit test. Any of them would have failed here.

  When a change is meant to alter results, update `expected` in the same commit and say why."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.security-lint :as security-lint]
   [dev.security-lint.engine :as engine]
   [dev.security-lint.rules :as rules]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private root
  "Kept under dev/resources rather than a test root: these namespaces deliberately require fixture-only
  namespaces and cannot load, and both kondo and Eastwood walk the test roots in CI."
  (.getAbsolutePath (java.io.File. "dev/resources/security_lint/corpus")))

(def ^:private expected
  "[rule file row severity reachable-from]. The last element is every kind of entry point that reaches the
  finding -- :http for a request, :job :mq :cli :event :startup for the others -- so a regression in entry
  detection or in multimethod resolution shows up here even when the finding itself is unchanged.

  A finding whose values come only from stored data (`driver/thing.clj` 34, `things/sync.clj` 29) grades as one
  fed from a request: nothing read back from a store is trusted. The one exception is a URL that is only a
  setting's reaching the raw HTTP client (`things/settings.clj` 20): the setting is reported once, by
  `url-setting-without-host-validation`, and each call that reads it is a note."
  #{[:metabase-security-lint/weak-hash                                 "src/metabase/cmd/core.clj"                   7 :note    [:cli]]
    [:metabase-security-lint/honeysql-raw-from-dynamic                 "src/metabase/driver/thing.clj"              12 :warning []]
    [:metabase-security-lint/hand-rolled-sql-quoting                   "src/metabase/driver/thing.clj"              15 :warning []]
    [:metabase-security-lint/hand-rolled-sql-quoting                   "src/metabase/driver/thing.clj"              20 :warning []]
    [:metabase-security-lint/driver-connection-check-bypassed          "src/metabase/driver/thing.clj"              23 :warning []]
    [:metabase-security-lint/sql-injection                             "src/metabase/driver/thing.clj"              34 :error   []]
    [:metabase-security-lint/embed-endpoint-reaches-token-verification "src/metabase/embedding_rest/api/embed.clj"  14 :error   [:http]]
    [:metabase-security-lint/weak-random                               "src/metabase/events/handlers.clj"            9 :note    [:event]]
    [:metabase-security-lint/unsafe-nippy-thaw                         "src/metabase/notify/payload.clj"            11 :error   [:http]]
    [:metabase-security-lint/redos                                     "src/metabase/notify/payload.clj"            12 :error   [:http]]
    [:metabase-security-lint/unguarded-outbound-http                   "src/metabase/notify/payload.clj"            13 :error   [:http]]
    [:metabase-security-lint/insecure-tls-option                       "src/metabase/notify/payload.clj"            15 :error   [:http]]
    [:metabase-security-lint/unsafe-deserialization                    "src/metabase/notify/payload.clj"            17 :note    []]
    [:metabase-security-lint/public-endpoint-reaches-enablement-check  "src/metabase/public_sharing_rest/api.clj"   17 :error   [:http]]
    [:metabase-security-lint/hiccup1-unescaped-value                   "src/metabase/public_sharing_rest/api.clj"   20 :error   [:http]]
    [:metabase-security-lint/weak-hash                                 "src/metabase/tasks/helpers.clj"              5 :note    [:job :mq :startup]]
    [:metabase-security-lint/sql-injection                             "src/metabase/things/api.clj"                26 :error   [:http]]
    [:metabase-security-lint/path-traversal                            "src/metabase/things/api.clj"                41 :error   [:http]]
    [:metabase-security-lint/command-injection                         "src/metabase/things/api.clj"                44 :error   [:http]]
    [:metabase-security-lint/endpoint-returns-unchecked-rows           "src/metabase/things/api.clj"                58 :note    [:http]]
    [:metabase-security-lint/model-read-without-authorization          "src/metabase/things/api.clj"                58 :note    [:http]]
    [:metabase-security-lint/request-id-never-checked                  "src/metabase/things/api.clj"                58 :warning [:http]]
    [:metabase-security-lint/request-id-never-checked                  "src/metabase/things/api.clj"                64 :warning [:http]]
    [:metabase-security-lint/mass-assignment                           "src/metabase/things/api.clj"                67 :error   [:http]]
    [:metabase-security-lint/toucan-positional-arg-from-request        "src/metabase/things/api.clj"                67 :warning [:http]]
    [:metabase-security-lint/open-redirect                             "src/metabase/things/api.clj"                70 :error   [:http]]
    [:metabase-security-lint/endpoint-returns-unchecked-rows           "src/metabase/things/api.clj"                77 :note    [:http]]
    [:metabase-security-lint/model-read-without-authorization          "src/metabase/things/api.clj"                77 :note    [:http]]
    [:metabase-security-lint/endpoint-returns-unchecked-rows           "src/metabase/things/api.clj"                84 :note    [:http]]
    [:metabase-security-lint/model-read-without-authorization          "src/metabase/things/api.clj"                84 :note    [:http]]
    [:metabase-security-lint/request-id-never-checked                  "src/metabase/things/api.clj"                90 :warning [:http]]
    [:metabase-security-lint/credential-endpoint-without-throttle      "src/metabase/things/api.clj"                96 :warning [:http]]
    [:metabase-security-lint/endpoint-returns-unchecked-rows           "src/metabase/things/api.clj"                96 :note    [:http]]
    [:metabase-security-lint/model-read-without-authorization          "src/metabase/things/api.clj"                96 :note    [:http]]
    [:metabase-security-lint/request-id-never-checked                  "src/metabase/things/api.clj"                96 :warning [:http]]
    [:metabase-security-lint/error-data-discloses-query                "src/metabase/things/api.clj"               104 :warning [:http]]
    [:metabase-security-lint/endpoint-returns-unchecked-rows           "src/metabase/things/api.clj"               107 :note    [:http]]
    [:metabase-security-lint/model-read-without-authorization          "src/metabase/things/api.clj"               107 :note    [:http]]
    [:metabase-security-lint/request-id-never-checked                  "src/metabase/things/api.clj"               107 :warning [:http]]
    [:metabase-security-lint/endpoint-returns-unchecked-rows           "src/metabase/things/api.clj"               116 :note    [:http]]
    [:metabase-security-lint/model-read-without-authorization          "src/metabase/things/api.clj"               116 :note    [:http]]
    [:metabase-security-lint/request-id-never-checked                  "src/metabase/things/api.clj"               116 :warning [:http]]
    [:metabase-security-lint/unguarded-outbound-http                   "src/metabase/things/api.clj"               120 :error   [:http]]
    [:metabase-security-lint/request-id-never-checked                  "src/metabase/things/api.clj"               124 :warning [:http]]
    [:metabase-security-lint/write-checked-against-other-model         "src/metabase/things/api.clj"               134 :warning [:http]]
    [:metabase-security-lint/nested-request-id-never-checked           "src/metabase/things/api.clj"               143 :warning [:http]]
    [:metabase-security-lint/toucan-positional-arg-from-request        "src/metabase/things/api.clj"               143 :warning [:http]]
    [:metabase-security-lint/endpoint-returns-unchecked-rows           "src/metabase/things/api.clj"               145 :note    [:http]]
    [:metabase-security-lint/model-read-without-authorization          "src/metabase/things/api.clj"               152 :note    [:http]]
    [:metabase-security-lint/request-id-never-checked                  "src/metabase/things/api.clj"               152 :warning [:http]]
    [:metabase-security-lint/unguarded-outbound-http                   "src/metabase/things/api.clj"               155 :error   [:http]]
    [:metabase-security-lint/endpoint-returns-unchecked-rows           "src/metabase/things/api.clj"               158 :note    [:http]]
    [:metabase-security-lint/model-read-without-authorization          "src/metabase/things/api.clj"               158 :note    [:http]]
    [:metabase-security-lint/endpoint-returns-unchecked-rows           "src/metabase/things/api.clj"               164 :note    [:http]]
    [:metabase-security-lint/model-read-without-authorization          "src/metabase/things/api.clj"               164 :note    [:http]]
    [:metabase-security-lint/honeysql-inline-from-dynamic              "src/metabase/things/api.clj"               167 :warning [:http]]
    [:metabase-security-lint/toucan-positional-arg-from-request        "src/metabase/things/db.clj"                 10 :warning [:http]]
    [:metabase-security-lint/like-pattern-from-dynamic                 "src/metabase/things/db.clj"                 13 :warning [:http]]
    [:metabase-security-lint/blessed-honeysql-with-dynamic-leaf        "src/metabase/things/db.clj"                 17 :warning [:http]]
    [:metabase-security-lint/endpoint-mounted-without-auth             "src/metabase/things/internal_api.clj"       14 :warning [:http]]
    [:metabase-security-lint/hiccup1-unescaped-value                   "src/metabase/things/render.clj"              6 :warning []]
    [:metabase-security-lint/hiccup1-unescaped-value                   "src/metabase/things/render.clj"              8 :warning []]
    [:metabase-security-lint/unencrypted-sensitive-setting             "src/metabase/things/settings.clj"            8 :error   [:setting]]
    [:metabase-security-lint/url-setting-without-host-validation       "src/metabase/things/settings.clj"           13 :warning [:setting]]
    [:metabase-security-lint/sensitive-data-in-logs                    "src/metabase/things/settings.clj"           17 :error   []]
    [:metabase-security-lint/unguarded-outbound-http                   "src/metabase/things/settings.clj"           20 :note    []]
    [:metabase-security-lint/url-setting-without-host-validation       "src/metabase/things/sync.clj"               11 :warning [:setting]]
    [:metabase-security-lint/credential-sent-to-boundary-host          "src/metabase/things/sync.clj"               16 :error   []]
    [:metabase-security-lint/unguarded-outbound-http                   "src/metabase/things/sync.clj"               16 :note    []]
    [:metabase-security-lint/stored-query-runs-as-another-user         "src/metabase/things/sync.clj"               22 :warning []]
    [:metabase-security-lint/setting-written-from-boundary             "src/metabase/things/sync.clj"               28 :error   []]
    [:metabase-security-lint/toucan-model-from-boundary                "src/metabase/things/sync.clj"               29 :error   []]
    [:metabase-security-lint/weak-hash                                 "src/metabase/util/crypto.clj"                5 :note    []]
    [:metabase-security-lint/weak-cipher                               "src/metabase/util/crypto.clj"                6 :error   []]
    [:metabase-security-lint/weak-ssl-protocol                         "src/metabase/util/crypto.clj"                7 :error   []]
    [:metabase-security-lint/hardcoded-secret                          "src/metabase/util/crypto.clj"                8 :error   [:startup]]
    [:metabase-security-lint/xxe                                       "src/metabase/xml/parse.clj"                 11 :error   [:http]]
    [:metabase-security-lint/trust-all-certificates                    "src/metabase/xml/parse.clj"                 14 :error   [:protocol]]
    [:metabase-security-lint/insecure-hostname-verifier                "src/metabase/xml/parse.clj"                 18 :error   []]
    [:metabase-security-lint/weak-random                               "src/metabase/xml/parse.clj"                 20 :note    []]})

(defn- scan-corpus []
  (engine/analyze {:paths [(str root "/src")] :rules (rules/all) :config-dir ".clj-kondo" :root root}))

(deftest golden-corpus-test
  (let [findings (scan-corpus)
        actual   (into #{} (map (fn [f] [(:rule-id f) (str/replace (:file f) (str root "/") "") (:row f) (:severity f)
                                         (vec (sort (:reachable-from f)))]))
                       findings)]
    (is (empty? (:unparsed (meta findings))) "every fixture parses")
    (is (= expected actual)
        (str "\nNEW (not expected):     " (pr-str (sort-by second (set/difference actual expected)))
             "\nMISSING (expected):     " (pr-str (sort-by second (set/difference expected actual)))))))

(deftest corpus-origins-test
  (testing "a finding says which boundaries its values crossed: a stored row, a setting, the warehouse"
    (let [findings (scan-corpus)
          origins  (fn [file row] (some #(when (and (str/ends-with? (:file %) file) (= row (:row %))) (:origins %))
                                        findings))]
      (is (= #{:request :app-db/Thing} (origins "things/api.clj" 120))
          "the URL came off a Thing row fetched by id")
      (is (= #{:app-db/Thing} (origins "things/api.clj" 155))
          "and still did when a helper destructured it off the row -- the helper's return carries what it read,
           not the id it was passed")
      (is (= #{:app-db/setting} (origins "things/settings.clj" 20))
          "a setting getter is a read of the application database")
      (is (= #{:warehouse} (origins "driver/thing.clj" 34))
          "a name the warehouse reported, through a describe-table implementation")
      (is (= #{:file} (origins "things/sync.clj" 28))
          "a parsed document is content from outside the instance"))))

(deftest narrowed-report-keeps-whole-tree-sarif-test
  (testing "`:only-files` narrows the text report and the verdict; the SARIF report still covers the whole tree,
            so code scanning can compare a pull request's analysis with its base's"
    (let [out    (doto (java.io.File/createTempFile "security-lint" ".sarif") .deleteOnExit)
          result (security-lint/scan {:paths      [(str root "/src")]
                                      :root       root
                                      :quiet?     true
                                      :only-files ["src/metabase/things/render.clj"]
                                      :sarif-out  (.getAbsolutePath out)})
          sarif  (json/decode (slurp out) true)
          whole  (security-lint/scan {:paths [(str root "/src")] :root root :quiet? true})]
      (is (= #{"src/metabase/things/render.clj"} (into #{} (map #(str/replace (:file %) (str root "/") "")) (:findings result))))
      (is (= (count (:findings whole)) (count (get-in sarif [:runs 0 :results]))))
      (is (< (count (:findings result)) (count (:findings whole)))))))

(deftest every-rule-has-a-corpus-case-test
  (testing "a rule with no fixture is a rule nothing guards"
    (is (empty? (remove (set (map first expected)) (map :id (rules/all)))))))

(ns dev.security-lint.sarif-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.security-lint.sarif :as sarif]))

(set! *warn-on-reflection* true)

(def ^:private findings
  [{:rule-id :metabase-security-lint/command-injection :rule-name "Command injection"
    :file "/repo/src/metabase/a.clj" :row 8 :col 3 :end-row 8 :end-col 40
    :severity :error :precision :high :cwe "CWE-78" :message "dynamic arg"
    :snippet "(shell/sh ...)" :form "(shell/sh ...)"
    :description "Full desc CI" :remediation "Use a vector of args"
    :endpoint-reachable? true :reachable-from #{:http :job}
    :flows {:http {:count 2 :entries ["GET /a" "POST /b"]
                   :path [{:name "GET /a" :filename "/repo/src/metabase/api.clj" :row 3 :col 1}
                          {:name "metabase.a/run" :filename "/repo/src/metabase/a.clj" :row 6 :col 1}]}
            :job  {:count 1 :entries ["defjob Nightly"]
                   :path [{:name "defjob Nightly" :filename "/repo/src/metabase/t.clj" :row 9 :col 1}
                          {:name "metabase.a/run" :filename "/repo/src/metabase/a.clj" :row 6 :col 1}]}}}
   {:rule-id :metabase-security-lint/command-injection :rule-name "Command injection"
    :file "/repo/src/metabase/b.clj" :row 2 :col 1 :end-row 2 :end-col 9
    :severity :error :precision :high :cwe "CWE-78" :message "dynamic arg"
    :snippet "(shell/sh ...)" :form "(shell/sh ...)"}
   {:rule-id :metabase-security-lint/weak-hash :rule-name "Weak hash"
    :file "/repo/src/metabase/c.clj" :row 4 :col 5 :end-row 4 :end-col 30
    :severity :note :precision :low :cwe "CWE-328" :message "md5"
    :snippet "(MessageDigest/getInstance ...)" :form "(MessageDigest/getInstance ...)"}])

(def ^:private rules
  [{:id :metabase-security-lint/command-injection :name "Command injection" :description "Full desc CI"
    :severity :error :precision :high :cwe "CWE-78" :remediation "Use a vector of args"
    :ns 'dev.security-lint.rules.injection}
   {:id :metabase-security-lint/weak-hash :name "Weak hash" :description "Full desc WH"
    :severity :note :precision :low :cwe "CWE-328" :remediation "Use SHA-256"}])

(defn- run-report [] (sarif/report findings {:rules rules :root "/repo"}))

(deftest envelope-test
  (let [r (run-report)]
    (is (= "2.1.0" (:version r)))
    (is (string? (get r (keyword "$schema"))))
    (is (= 1 (count (:runs r))))
    (is (= "metabase-security-lint" (get-in r [:runs 0 :tool :driver :name])))
    (is (= sarif/version (get-in r [:runs 0 :tool :driver :semanticVersion])))
    (testing "the invocation record carries the scan's times when given"
      (is (= [{:executionSuccessful true}] (get-in r [:runs 0 :invocations])))
      (let [t0 (java.time.Instant/parse "2026-09-12T10:00:00Z")
            t1 (java.time.Instant/parse "2026-09-12T10:00:40Z")
            r  (sarif/report findings {:rules rules :root "/repo" :started t0 :ended t1})]
        (is (= [{:executionSuccessful true :startTimeUtc "2026-09-12T10:00:00Z" :endTimeUtc "2026-09-12T10:00:40Z"}]
               (get-in r [:runs 0 :invocations])))))))

(deftest help-uri-test
  (let [driver-rules (get-in (run-report) [:runs 0 :tool :driver :rules])]
    (testing "a rule that knows its namespace links the alert to its source on master"
      (is (= "https://github.com/metabase/metabase/blob/master/dev/src/dev/security_lint/rules/injection.clj"
             (get-in driver-rules [0 :helpUri]))))
    (testing "one that does not has no link rather than a wrong one"
      (is (not (contains? (second driver-rules) :helpUri))))))

(deftest message-markdown-test
  (let [result (first (get-in (run-report) [:runs 0 :results]))]
    (testing "the markdown message is the text plus the flagged code in a block"
      (is (str/starts-with? (get-in result [:message :markdown]) (get-in result [:message :text])))
      (is (str/includes? (get-in result [:message :markdown]) "```clojure\n(shell/sh ...)\n```")))))

(deftest rules-deduplicated-test
  (let [driver-rules (get-in (run-report) [:runs 0 :tool :driver :rules])]
    (testing "each rule appears once even though one has two findings"
      (is (= 2 (count driver-rules))))
    (testing "rule ids are the stable string form of the rule keyword"
      (is (= ["metabase-security-lint/command-injection" "metabase-security-lint/weak-hash"]
             (map :id driver-rules))))
    (testing "carries description and remediation for the alert body"
      (is (= "Full desc CI" (get-in driver-rules [0 :fullDescription :text])))
      (is (re-find #"vector of args" (get-in driver-rules [0 :help :text])))
      (is (re-find #"\*\*Remediation:\*\*" (get-in driver-rules [0 :help :markdown]))
          "GitHub renders help.markdown on the alert page"))))

(deftest results-reference-rules-by-index-test
  (let [results (get-in (run-report) [:runs 0 :results])]
    (is (= 3 (count results)))
    (is (= [0 0 1] (map :ruleIndex results)))
    (is (= ["metabase-security-lint/command-injection"
            "metabase-security-lint/command-injection"
            "metabase-security-lint/weak-hash"]
           (map :ruleId results)))))

(deftest level-mapping-test
  (let [r (run-report)]
    (testing "clojure severities map onto SARIF levels"
      (is (= ["error" "error" "note"] (map :level (get-in r [:runs 0 :results])))))
    (testing "a security tag files these as security alerts; no security-severity, so that the alert's severity
              is the result's level -- graded per finding by taint -- and the merge-blocking threshold can be
              'errors' without a rule's worst case counting for its warnings"
      (let [props (map :properties (get-in r [:runs 0 :tool :driver :rules]))]
        (is (every? #(not (contains? % :security-severity)) props))
        (is (every? #(contains? (set (:tags %)) "security") props))
        (is (contains? (set (:tags (first props))) "external/cwe/cwe-78"))
        (is (= ["high" "low"] (map :precision props)))))))

(deftest locations-relative-to-repo-root-test
  (let [results (get-in (run-report) [:runs 0 :results])
        loc     (get-in (first results) [:locations 0 :physicalLocation])]
    (testing "GitHub resolves artifact URIs against the repo root, so paths must be relative, and say so"
      (is (= "%SRCROOT%" (get-in loc [:artifactLocation :uriBaseId])))
      (is (= "src/metabase/a.clj" (get-in loc [:artifactLocation :uri]))))
    (is (= {:startLine 8 :startColumn 3 :endLine 8 :endColumn 40} (:region loc)))))

(deftest fingerprints-stable-test
  (testing "the same finding fingerprints identically across runs, so alerts don't churn"
    (is (= (map :partialFingerprints (get-in (run-report) [:runs 0 :results]))
           (map :partialFingerprints (get-in (run-report) [:runs 0 :results])))))
  (testing "different findings get different fingerprints"
    (let [fps (map #(get-in % [:partialFingerprints :primaryLocationLineHash])
                   (get-in (run-report) [:runs 0 :results]))]
      (is (= 3 (count (distinct fps)))))))

(deftest reachable-from-property-test
  (testing "every kind of entry that reaches a finding is listed, sorted"
    (is (= [["http" "job"] [] []]
           (map #(get-in % [:properties :reachableFrom]) (get-in (run-report) [:runs 0 :results]))))))

(deftest endpoint-reachable-property-test
  (testing "reachability rides along on each result, so triage can be ordered by it"
    (let [results (get-in (run-report) [:runs 0 :results])]
      (is (= [true false false] (map #(get-in % [:properties :endpointReachable]) results))))))

(deftest empty-findings-test
  (testing "a clean run still emits a valid report so GitHub clears resolved alerts"
    (let [r (sarif/report [] {:rules rules :root "/repo"})]
      (is (= [] (get-in r [:runs 0 :results])))
      (is (= 2 (count (get-in r [:runs 0 :tool :driver :rules])))))))

(deftest repeated-form-in-one-file-test
  (testing "two findings with the same rule, file and code get distinct fingerprints, or GitHub merges them into one alert"
    (let [twice [{:rule-id :metabase-security-lint/weak-hash :file "/repo/src/metabase/d.clj" :row 4 :col 5 :end-row 4 :end-col 30
                  :severity :note :message "md5" :form "(MessageDigest/getInstance \"MD5\")"}
                 {:rule-id :metabase-security-lint/weak-hash :file "/repo/src/metabase/d.clj" :row 9 :col 5 :end-row 9 :end-col 30
                  :severity :note :message "md5" :form "(MessageDigest/getInstance \"MD5\")"}]
          fps   (fn [fs] (mapv #(get-in % [:partialFingerprints :primaryLocationLineHash])
                               (get-in (sarif/report fs {:rules rules :root "/repo"}) [:runs 0 :results])))]
      (is (apply distinct? (fps twice)))
      (testing "and they do not depend on line numbers, so an edit above them does not churn the alerts"
        (is (= (fps twice) (fps (mapv #(update % :row + 20) twice)))))
      (testing "nor on the order findings arrive in"
        (is (= (set (fps twice)) (set (fps (reverse twice)))))))))

(deftest message-carries-reachability-test
  (testing "GitHub does not display result properties, so what reaches the finding goes in the message text"
    (let [msgs (mapv #(get-in % [:message :text]) (get-in (run-report) [:runs 0 :results]))]
      (is (= "dynamic arg. Reachable from http, job." (first msgs)))
      (is (re-find #"(?i)not reachable from any known entry point" (second msgs))))))

(deftest text-report-test
  (let [out (sarif/text findings {:root "/repo"})]
    (testing "findings are grouped under a header per rule, naming it with its counts, then what it means"
      (is (re-find #"(?m)^## command-injection: Command injection \(2 errors\)\n\nFull desc CI\n\nRemediation: Use a vector of args$" out))
      (is (re-find #"(?m)^## weak-hash: Weak hash \(1 note\)$" out)))
    (testing "rules with an error come first"
      (is (< (.indexOf out "## command-injection") (.indexOf out "## weak-hash"))))
    (testing "within a rule, a section per severity, saying what the severity means"
      (is (re-find #"(?m)^### Error: Fails the scan\." out))
      (is (re-find #"(?m)^### Note: Informational\." out)))
    (testing "a message every finding in a section shares is said once, above them"
      (is (re-find #"(?m)^### Error: .*\n\ndynamic arg\n\nsrc/metabase/a\.clj:8:3\n    reachable from http" out)))
    (testing "a message that varies stays with its finding"
      (let [out (sarif/text (assoc-in findings [1 :message] "other arg") {:root "/repo"})]
        (is (re-find #"(?m)^src/metabase/a\.clj:8:3\n    dynamic arg\n" out))
        (is (re-find #"(?m)^src/metabase/b\.clj:2:1\n    other arg\n" out))))
    (testing "a finding starts with file:row:col alone on its line, which IDE terminals make clickable, with the
              details indented under it and a blank line after"
      (is (re-find #"\n\nsrc/metabase/b\.clj:2:1\n    not reachable from any known entry point" out)))
    (testing "the code is quoted under the message"
      (is (re-find #"\| \(shell/sh \.\.\.\)" out)))
    (testing "a summary closes the report"
      (is (re-find #"3 findings in 3 files across 2 rules: 2 errors, 1 note" out)))))

(deftest text-report-snippet-is-one-line-test
  (let [long-snippet (str "(shell/sh \"bash\" \"-c\" (str " (apply str (repeat 200 "x")) "))\n  (second-line)")
        out (sarif/text [(assoc (first findings) :snippet long-snippet)] {:root "/repo"})]
    (testing "only the first line of the code, cut to a readable width"
      (is (not (re-find #"second-line" out)))
      (is (every? #(<= (count %) 120) (str/split-lines out))))))

(def ^:private fixed-now (java.time.ZonedDateTime/of 2026 9 10 21 40 0 0 (java.time.ZoneId/of "UTC")))

(deftest text-report-header-test
  (let [out (sarif/text findings {:root "/repo" :now fixed-now})]
    (testing "the report opens with when it ran and the totals"
      (is (str/starts-with? out "# Security lint report\n\nRan 2026-09-10 21:40 UTC\n3 findings in 3 files across 2 rules: 2 errors, 1 note\n")))
    (testing "and an overview line per rule with its counts, errors first"
      (is (re-find #"(?m)^  command-injection +2 errors$" out))
      (is (re-find #"(?m)^  weak-hash +1 note$" out))
      (is (< (.indexOf out "  command-injection") (.indexOf out "  weak-hash") (.indexOf out "## command-injection"))))))

(deftest text-report-empty-test
  (let [out (sarif/text [] {:root "/repo" :now fixed-now})]
    (is (str/starts-with? out "# Security lint report\n\nRan 2026-09-10 21:40 UTC\n"))
    (is (str/ends-with? out "No security findings.\n"))))

(deftest fingerprint-ignores-formatting-test
  (testing "the fingerprint hashes the normalized form, so a reformat does not churn the alert"
    (let [fp (fn [f] (get-in (sarif/report [f] {:rules rules :root "/repo"})
                             [:runs 0 :results 0 :partialFingerprints :primaryLocationLineHash]))
          a  (first findings)]
      (is (= (fp a) (fp (assoc a :snippet "(shell/sh" :row 30))))
      (is (not= (fp a) (fp (assoc a :form "(shell/sh other)")))))))

(deftest code-flows-test
  (let [result (first (get-in (run-report) [:runs 0 :results]))
        flows  (:codeFlows result)]
    (testing "one code flow per entry kind that reaches the finding"
      (is (= 2 (count flows))))
    (testing "a flow walks from the entry through each function to the finding, every step a linkable location"
      (let [locs (get-in (first flows) [:threadFlows 0 :locations])]
        (is (= ["GET /a" "metabase.a/run" "dynamic arg"] (map #(get-in % [:location :message :text]) locs)))
        (is (= ["src/metabase/api.clj" "src/metabase/a.clj" "src/metabase/a.clj"]
               (map #(get-in % [:location :physicalLocation :artifactLocation :uri]) locs)))
        (is (= [3 6 8] (map #(get-in % [:location :physicalLocation :region :startLine]) locs)))))
    (testing "a finding nothing reaches has no code flows"
      (is (nil? (:codeFlows (second (get-in (run-report) [:runs 0 :results]))))))))

(deftest uri-drops-leading-dot-slash-test
  (testing "a scan of ./src reports src/...; GitHub resolves URIs against the repository root"
    (let [uri (fn [f] (get-in (sarif/report [f] {:rules rules :root "/repo"})
                              [:runs 0 :results 0 :locations 0 :physicalLocation :artifactLocation :uri]))]
      (is (= "src/metabase/a.clj" (uri (assoc (first findings) :file "./src/metabase/a.clj"))))
      (is (= "src/metabase/a.clj" (uri (assoc (first findings) :file "/repo/./src/metabase/a.clj")))))))

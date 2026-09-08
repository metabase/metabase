(ns dev.security-lint.rules-test
  "Each rule is exercised against a vulnerable snippet and a safe one.

  These run through the real engine rather than calling `:detect` directly, so they also cover resolution -- that
  `edn/read-string` is spared while `read-string` is flagged is a property of the pair, not of either half."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.security-lint.engine :as engine]
   [dev.security-lint.rule :as rule]
   [dev.security-lint.rules :as rules]))

(set! *warn-on-reflection* true)

(defn- check
  "Run `rule-id` over `src` and return the findings.

  Pins `:any-local` rather than using the `:call-graph` default: these are unit tests of each rule's
  *shape* detection, and a plain `defn` parameter is the readable stand-in for untrusted input. Which bindings
  count as sources is a separate concern, covered in `dev.security-lint.request-taint-test` and in
  `taint-policy-applies-to-real-rules-test` below."
  [rule-id src]
  (let [f (doto (java.io.File/createTempFile "seclint" ".clj") .deleteOnExit)]
    (spit f src)
    (engine/analyze {:paths [(.getAbsolutePath f)] :rules [(rule/by-id rule-id)] :taint-sources :any-local})))

(defn- check-cg
  "Run `rule-id` over `src` under the `:call-graph` policy, which endpoint rules require."
  [rule-id src]
  (let [f (doto (java.io.File/createTempFile "seclint" ".clj") .deleteOnExit)]
    (spit f src)
    (engine/analyze {:paths [(.getAbsolutePath f)] :rules [(rule/by-id rule-id)] :taint-sources :call-graph})))

(defn- check-request
  "Run `rule-id` over `src` under the default policy, where a plain `defn` parameter is *not* a source -- the
  untainted case for a rule whose severity depends on taint."
  [rule-id src]
  (check-cg rule-id src))

(defn- flags? [rule-id src] (= 1 (count (check rule-id src))))
(defn- clean? [rule-id src] (zero? (count (check rule-id src))))

(use-fixtures :once (fn [f] (rules/all) (f)))

(deftest command-injection-test
  (is (flags? :metabase-security-lint/command-injection
              "(ns t (:require [clojure.java.shell :as shell]))
               (defn f [x] (shell/sh \"bash\" \"-c\" (str \"ls \" x)))"))
  (is (clean? :metabase-security-lint/command-injection
              "(ns t (:require [clojure.java.shell :as shell]))
               (defn f [] (shell/sh \"ls\" \"-la\"))")
      "a fully literal command is fine")
  (is (clean? :metabase-security-lint/command-injection
              "(ns t (:require [clojure.java.shell :as shell]))
               (defn f [x] (shell/sh \"ls\" x))")
      "passing a value as its own argument is the safe form -- no shell parsing involved"))

(deftest sql-injection-test
  (is (flags? :metabase-security-lint/sql-injection
              "(ns t (:require [next.jdbc :as jdbc]))
               (defn f [db table] (jdbc/execute! db [(str \"select * from \" table)]))"))
  (is (clean? :metabase-security-lint/sql-injection
              "(ns t (:require [next.jdbc :as jdbc]))
               (defn f [db id] (jdbc/execute! db [\"select * from t where id = ?\" id]))")
      "a parameterized query is the safe form")
  (is (flags? :metabase-security-lint/sql-injection
              "(ns t (:require [next.jdbc :as jdbc]))
               (defn f [db sql] (jdbc/execute! db [sql]))")
      "a caller-supplied value used directly as the SQL text needs no interpolation to be injection")
  (is (flags? :metabase-security-lint/sql-injection
              "(ns t (:require [next.jdbc :as jdbc]))
               (defn- q [t] (format \"select * from %s\" t))
               (defn f [db table] (jdbc/execute! db [(q table)]))")
      "SQL built inside a callee is still SQL built from the caller's value")
  (is (clean? :metabase-security-lint/sql-injection
              "(ns t (:require [next.jdbc :as jdbc]))
               (defn f [db schema t] (jdbc/execute! db (if schema [\"select 1 from x where s = ? and t = ?\" schema t] [\"select 1 from x where t = ?\" t])))")
      "a parameter is a parameter in either branch")
  (is (clean? :metabase-security-lint/sql-injection
              "(ns t (:require [next.jdbc :as jdbc]))
               (defn f [db t] (let [args [\"select 1 from x where t = ?\" t]] (jdbc/execute! db args)))")
      "and through a binding of the vector"))

(deftest unsafe-deserialization-test
  (is (flags? :metabase-security-lint/unsafe-deserialization
              "(ns t) (defn f [s] (read-string s))"))
  (is (clean? :metabase-security-lint/unsafe-deserialization
              "(ns t (:require [clojure.edn :as edn])) (defn f [s] (edn/read-string s))")
      "clojure.edn/read-string does not eval")
  (is (flags? :metabase-security-lint/unsafe-deserialization
              "(ns t) (defn f [s] (load-string s))"))
  (testing "reading internal data is worth a note; reading caller-supplied data is code execution"
    (is (= [:error] (map :severity (check :metabase-security-lint/unsafe-deserialization
                                          "(ns t) (defn f [s] (read-string s))"))))
    (is (= [:note] (map :severity (check-request :metabase-security-lint/unsafe-deserialization
                                                 "(ns t) (defn f [s] (read-string s))"))))))

(deftest path-traversal-test
  (is (flags? :metabase-security-lint/path-traversal
              "(ns t (:require [clojure.java.io :as io]))
               (defn f [name] (io/file (str \"/var/data/\" name)))"))
  (is (clean? :metabase-security-lint/path-traversal
              "(ns t (:require [clojure.java.io :as io]))
               (defn f [] (io/file \"/var/data/fixed.csv\"))"))
  (is (flags? :metabase-security-lint/path-traversal
              "(ns t (:require [clojure.java.io :as io]))
               (defn f [name] (io/file \"/var/data\" name))")
      "a caller-supplied path segment traverses without any string building")
  (is (clean? :metabase-security-lint/path-traversal
              "(ns t) (defn f [content] (spit \"/var/data/out.txt\" content))")
      "spit's second argument is the content, not the path")
  (is (clean? :metabase-security-lint/path-traversal
              "(ns t (:require [clojure.java.io :as io]) (:import java.io.File))
               (defn f [content] (let [tmp (File/createTempFile \"x\" \".csv\")] (io/output-stream tmp)))")
      "a temp file the code created is no path of the caller's")
  (is (clean? :metabase-security-lint/path-traversal
              "(ns t) (defn f [req] (slurp (:body req)))")
      "a request body is a stream, not a path")
  (is (clean? :metabase-security-lint/path-traversal
              "(ns t) (defn f [url] (with-open [reader (open url)] (slurp reader)))")
      "what with-open binds is a stream or a reader, whatever opened it")
  (is (clean? :metabase-security-lint/path-traversal
              "(ns t (:require [clojure.java.io :as io])) (defn f [card] (when-let [tmp (and (:csv card) (create-temp-file! \"csv\"))] (io/output-stream tmp)))")
      "a temp file behind an `and`"))

(deftest unguarded-outbound-http-test
  (is (flags? :metabase-security-lint/unguarded-outbound-http
              "(ns t (:require [clj-http.client :as http]))
               (defn f [url] (http/get url))")
      "raw clj-http bypasses the network policy in metabase.util.http")
  (testing "a caller-supplied URL is SSRF; a setting's is the setting's rule; a hard-coded one is nobody's"
    (is (= [:error] (map :severity (check :metabase-security-lint/unguarded-outbound-http
                                          "(ns t (:require [clj-http.client :as http]))
                                           (defn f [url] (http/get url))"))))
    (is (= [:note] (map :severity (check-cg :metabase-security-lint/unguarded-outbound-http
                                            "(ns t (:require [clj-http.client :as http] [metabase.settings.core :refer [defsetting]]))
                                             (defsetting collector-url \"doc\")
                                             (defn f [] (http/post (collector-url) {}))"))))
    (is (empty? (check-request :metabase-security-lint/unguarded-outbound-http
                               "(ns t (:require [clj-http.client :as http]))
                                (defn f [] (http/get \"https://internal\"))")))
    (is (empty? (check-cg :metabase-security-lint/unguarded-outbound-http
                          "(ns t (:require [clj-http.client :as http] [metabase.api.macros :as api.macros]))
(api.macros/defendpoint :get \"/geo\" \"doc\" [_r {:keys [ip]} _b] (http/get (str \"https://get.geojs.io/v1/ip/geo.json?ip=\" ip)))"))
        "a URL whose host is a literal goes to that host whatever the rest of it says"))
  (is (clean? :metabase-security-lint/unguarded-outbound-http
              "(ns t (:require [metabase.util.http :as u.http]))
               (defn f [url] (u.http/get url))")))

(deftest weak-hash-test
  (is (flags? :metabase-security-lint/weak-hash
              "(ns t) (defn f [] (java.security.MessageDigest/getInstance \"MD5\"))"))
  (is (flags? :metabase-security-lint/weak-hash
              "(ns t) (defn f [] (java.security.MessageDigest/getInstance \"SHA-1\"))"))
  (is (clean? :metabase-security-lint/weak-hash
              "(ns t) (defn f [] (java.security.MessageDigest/getInstance \"SHA-256\"))")))

(deftest weak-cipher-test
  (is (flags? :metabase-security-lint/weak-cipher
              "(ns t) (defn f [] (javax.crypto.Cipher/getInstance \"DES/ECB/PKCS5Padding\"))"))
  (is (flags? :metabase-security-lint/weak-cipher
              "(ns t) (defn f [] (javax.crypto.Cipher/getInstance \"AES/ECB/PKCS5Padding\"))")
      "ECB leaks plaintext structure even with a strong cipher")
  (is (clean? :metabase-security-lint/weak-cipher
              "(ns t) (defn f [] (javax.crypto.Cipher/getInstance \"AES/GCM/NoPadding\"))")))

(deftest weak-ssl-protocol-test
  (is (flags? :metabase-security-lint/weak-ssl-protocol
              "(ns t) (defn f [] (javax.net.ssl.SSLContext/getInstance \"SSLv3\"))"))
  (is (flags? :metabase-security-lint/weak-ssl-protocol
              "(ns t) (defn f [] (javax.net.ssl.SSLContext/getInstance \"TLSv1\"))"))
  (is (clean? :metabase-security-lint/weak-ssl-protocol
              "(ns t) (defn f [] (javax.net.ssl.SSLContext/getInstance \"TLSv1.3\"))")))

(deftest insecure-hostname-verifier-test
  (is (flags? :metabase-security-lint/insecure-hostname-verifier
              "(ns t) (defn f [v] (javax.net.ssl.HttpsURLConnection/setDefaultHostnameVerifier v))"))
  (is (clean? :metabase-security-lint/insecure-hostname-verifier "(ns t) (defn f [] :ok)")))

(deftest xxe-test
  (is (flags? :metabase-security-lint/xxe
              "(ns t (:require [clojure.xml :as xml])) (defn f [s] (xml/parse s))"))
  (testing "clojure.data.xml is the parser actually used here, and was not covered"
    (is (flags? :metabase-security-lint/xxe
                "(ns t (:require [clojure.data.xml :as xml])) (defn f [s] (xml/parse s))"))
    (is (flags? :metabase-security-lint/xxe
                "(ns t (:require [clojure.data.xml :as xml])) (defn f [s] (xml/parse-str s))")))
  (testing "a raw JAXP factory resolves external entities unless told otherwise"
    (is (flags? :metabase-security-lint/xxe
                "(ns t) (defn f [] (javax.xml.parsers.DocumentBuilderFactory/newInstance))")))
  (is (clean? :metabase-security-lint/xxe "(ns t) (defn f [s] s)"))
  (is (clean? :metabase-security-lint/xxe
              "(ns t (:require [clojure.xml :as xml] [clojure.java.io :as io])) (defn f [] (xml/parse (io/input-stream (io/resource \"tz/zones.xml\"))))")
      "a document on the classpath is the build's own"))

(deftest mass-assignment-test
  (is (flags? :metabase-security-lint/mass-assignment
              "(ns t (:require [toucan2.core :as t2]))
               (defn f [id body] (t2/update! :model/Card id body))")
      "a request body written straight into a model sets every column it names")
  (is (clean? :metabase-security-lint/mass-assignment
              "(ns t (:require [toucan2.core :as t2]))
               (defn f [id] (t2/update! :model/Card id {:name \"fixed\"}))")
      "an explicit literal map names exactly the columns it means to set")
  (is (clean? :metabase-security-lint/mass-assignment
              "(ns t (:require [toucan2.core :as t2]))
               (defn f [id body] (t2/update! :model/Card id (select-keys body [:name])))")
      "the rule's own remediation must clear the finding")
  (testing "the data-access layer is exempt -- passing a changes map through is what it is for"
    (let [dir (doto (java.io.File. (System/getProperty "java.io.tmpdir")
                                   (str "seclint" (System/nanoTime)))
                .mkdirs .deleteOnExit)
          f   (doto (java.io.File. dir "db.clj") .deleteOnExit)]
      (spit f "(ns t (:require [toucan2.core :as t2]))\n(defn f [id body] (t2/update! :model/Card id body))")
      (is (empty? (engine/analyze {:paths [(.getAbsolutePath f)]
                                   :rules [(rule/by-id :metabase-security-lint/mass-assignment)]
                                   :taint-sources :any-local})))))
  (testing "except for a write into a model that decides permissions or holds a secret, where a forwarded map
            from a document or a request is the finding"
    (let [dir (doto (java.io.File. (System/getProperty "java.io.tmpdir")
                                   (str "seclint" (System/nanoTime)))
                .mkdirs .deleteOnExit)
          f   (doto (java.io.File. dir "db.clj") .deleteOnExit)]
      (spit f "(ns t (:require [toucan2.core :as t2] [clj-yaml.core :as yaml] [metabase.api.macros :as api.macros]))
(defn update-user! [id changes] (t2/update! :model/User id changes))
(defn update-table! [id changes] (t2/update! :model/Table id changes))
(api.macros/defendpoint :put \"/:id\" \"doc\" [{:keys [id]} _q body] (update-user! id (yaml/parse-string body)) (update-table! id (yaml/parse-string body)))")
      (is (= [2] (map :row (engine/analyze {:paths [(.getAbsolutePath f)]
                                            :rules [(rule/by-id :metabase-security-lint/mass-assignment)]
                                            :taint-sources :call-graph})))))))

(deftest redos-test
  (is (flags? :metabase-security-lint/redos
              "(ns t) (defn f [pat] (re-pattern pat))")
      "a caller-supplied pattern can be built to backtrack catastrophically")
  (is (clean? :metabase-security-lint/redos
              "(ns t) (defn f [] (re-pattern \"^[a-z]+$\"))"))
  (is (clean? :metabase-security-lint/redos
              "(ns t) (defn f [pat] (re-pattern (java.util.regex.Pattern/quote pat)))")
      "the rule's own remediation must clear the finding")
  (is (clean? :metabase-security-lint/redos
              "(ns t (:import java.util.regex.Pattern)) (defn f [pat] (re-pattern (str \"^\" (Pattern/quote pat))))")))

(deftest sql-injection-sanitizer-naming-test
  (testing "quoted-table-name reads as a quoting function even though it is past tense"
    (is (clean? :metabase-security-lint/sql-injection
                "(ns t (:require [next.jdbc :as jdbc]))
                 (defn f [db t] (jdbc/execute! db [(format \"alter table %s\" (quoted-table-name t))]))"))))

(deftest sql-injection-taint-test
  (testing "interpolating a namespace-level constant is not a finding -- it cannot carry user input"
    (is (clean? :metabase-security-lint/sql-injection
                "(ns t (:require [next.jdbc :as jdbc]))
                 (def events-table \"events\")
                 (defn f [db] (jdbc/execute! db [(format \"select * from %s\" events-table)]))")))
  (testing "quoting an identifier is the correct fix, not a workaround, so it clears the finding"
    (is (clean? :metabase-security-lint/sql-injection
                "(ns t (:require [next.jdbc :as jdbc]))
                 (defn f [db table] (jdbc/execute! db [(format \"select * from %s\" (quote-ident table))]))"))))

(deftest insecure-tls-option-test
  (is (flags? :metabase-security-lint/insecure-tls-option
              "(ns t (:require [clj-http.client :as http]))
               (defn f [url] (http/get url {:insecure? true}))"))
  (is (flags? :metabase-security-lint/insecure-tls-option
              "(ns t (:require [clj-http.client :as http]))
               (defn f [url] (http/post url {:validate-hostnames false}))"))
  (is (clean? :metabase-security-lint/insecure-tls-option
              "(ns t (:require [clj-http.client :as http]))
               (defn f [url] (http/get url {:socket-timeout 500}))")))

(deftest hardcoded-secret-test
  (is (flags? :metabase-security-lint/hardcoded-secret
              "(ns t) (def conn {:user \"admin\" :password \"s3cr3t-p4ssw0rd-value\"})"))
  (is (clean? :metabase-security-lint/hardcoded-secret
              "(ns t) (def conn {:user \"admin\" :password (env :db-password)})")
      "reading from the environment is the correct pattern")
  (is (clean? :metabase-security-lint/hardcoded-secret
              "(ns t) (def conn {:user \"admin\" :password \"\"})")
      "an empty placeholder is not a secret")
  (is (clean? :metabase-security-lint/hardcoded-secret
              "(ns t) (def providers [{:settings {:api-key \"llm-anthropic-api-key\"}}])")
      "mapping a config key to a setting name is metadata, not a credential"))

(deftest weak-random-test
  (is (flags? :metabase-security-lint/weak-random "(ns t) (defn f [] (java.util.Random.))"))
  (is (clean? :metabase-security-lint/weak-random "(ns t) (defn f [] (java.security.SecureRandom.))")))

(deftest sensitive-data-in-logs-test
  (is (flags? :metabase-security-lint/sensitive-data-in-logs
              "(ns t (:require [clojure.tools.logging :as log]))
               (defn f [password] (log/info \"logging in with\" password))"))
  (is (clean? :metabase-security-lint/sensitive-data-in-logs
              "(ns t (:require [clojure.tools.logging :as log]))
               (defn f [user-id] (log/info \"logging in\" user-id))"))
  (is (clean? :metabase-security-lint/sensitive-data-in-logs
              "(ns t (:require [clojure.tools.logging :as log]))
               (defn f [api-key secret] (log/info \"key\" (u/the-id api-key) \"set?\" (boolean secret) (count secret) (some? secret) (keys secret)))")
      "an id, a count, a presence or the keys of a credential disclose nothing of it"))

(deftest unsafe-nippy-thaw-test
  (is (flags? :metabase-security-lint/unsafe-nippy-thaw
              "(ns t (:require [taoensso.nippy :as nippy]))
               (defn f [payload] (nippy/thaw payload))"))
  (is (clean? :metabase-security-lint/unsafe-nippy-thaw
              "(ns t (:require [taoensso.nippy :as nippy]))
               (def blob (byte-array 0))
               (defn f [] (nippy/thaw blob))")))

(deftest unencrypted-sensitive-setting-test
  (is (flags? :metabase-security-lint/unencrypted-sensitive-setting
              "(ns t (:require [metabase.settings.core :refer [defsetting]]))
               (defsetting my-api-key \"doc\" :encryption :no)"))
  (is (clean? :metabase-security-lint/unencrypted-sensitive-setting
              "(ns t (:require [metabase.settings.core :refer [defsetting]]))
               (defsetting my-api-key \"doc\" :encryption :when-encryption-key-set)"))
  (is (clean? :metabase-security-lint/unencrypted-sensitive-setting
              "(ns t (:require [metabase.settings.core :refer [defsetting]]))
               (defsetting page-size \"doc\" :encryption :no)")
      "a setting whose name suggests nothing sensitive is left alone")
  (is (clean? :metabase-security-lint/unencrypted-sensitive-setting
              "(ns t (:require [metabase.settings.core :refer [defsetting]]))
               (defsetting slack-token-valid? \"doc\" :encryption :no)")
      "a boolean flag about a credential is not itself a credential")
  (is (clean? :metabase-security-lint/unencrypted-sensitive-setting
              "(ns t (:require [metabase.settings.core :refer [defsetting]]))
               (defsetting openai-max-tokens-per-batch \"doc\" :encryption :no)")
      "\"tokens\" mid-name is a count, not an auth token")
  (is (clean? :metabase-security-lint/unencrypted-sensitive-setting
              "(ns t (:require [metabase.settings.core :refer [defsetting]]))
               (defsetting llm-max-tokens \"doc\" :encryption :no)")
      "a quantity word makes this a count even though it ends in \"tokens\"")
  (is (clean? :metabase-security-lint/unencrypted-sensitive-setting
              "(ns t (:require [metabase.settings.core :refer [defsetting]]))
               (defsetting my-api-key \"doc\" :sensitive? true)")
      "defsetting defaults :sensitive? settings to encrypted, so absence is not a finding there"))

(deftest open-redirect-test
  (is (flags? :metabase-security-lint/open-redirect
              "(ns t (:require [ring.util.response :as response]))
               (defn f [target] (response/redirect target))"))
  (is (clean? :metabase-security-lint/open-redirect
              "(ns t (:require [ring.util.response :as response]))
               (defn f [] (response/redirect \"/dashboard\"))")))

(deftest trust-all-certificates-test
  (is (flags? :metabase-security-lint/trust-all-certificates
              "(ns t) (defn f [] (reify javax.net.ssl.X509TrustManager
                                   (checkServerTrusted [_ _ _] nil)))"))
  (is (clean? :metabase-security-lint/trust-all-certificates
              "(ns t) (defn f [] (reify java.io.Closeable (close [_] nil)))")))

(deftest taint-policy-applies-to-real-rules-test
  (testing "under the default policy a real rule fires on a defendpoint parameter"
    (is (= 1 (count (check-request
                     :metabase-security-lint/command-injection
                     "(ns t (:require [metabase.api.macros :as api.macros] [clojure.java.shell :as shell]))
                      (api.macros/defendpoint :post \"/run\"
                        \"doc\"
                        [_route _query {:keys [dir]}]
                        (shell/sh \"bash\" \"-c\" (str \"ls \" dir)))")))))
  ;; The helper below is exactly the shape of
  ;; sso/integrations/jwt.clj, where a request value really does reach the sink one call later.
  (testing "and stays quiet on an internal helper with the same shape"
    (is (zero? (count (check-request
                       :metabase-security-lint/command-injection
                       "(ns t (:require [clojure.java.shell :as shell]))
                        (defn helper [dir] (shell/sh \"bash\" \"-c\" (str \"ls \" dir)))"))))))

(deftest public-endpoint-reaches-enablement-check-test
  (let [src "(ns metabase.public-sharing-rest.api (:require [metabase.api.macros :as api.macros]))
(defn- check-public-sharing-enabled [] true)
(defn- fetch [] (check-public-sharing-enabled) 1)
(api.macros/defendpoint :get \"/ok\" \"doc\" [_r _q _b] (fetch))
(api.macros/defendpoint :get \"/bad\" \"doc\" [_r _q _b] 2)"
        rows (map :row (check-cg :metabase-security-lint/public-endpoint-reaches-enablement-check src))]
    (is (= [5] rows) "only /bad, which reaches the check through nothing; /ok reaches it via fetch")))

(deftest embed-endpoint-reaches-token-verification-test
  (let [src "(ns metabase.embedding-rest.api.embed (:require [metabase.api.macros :as api.macros]))
(defn- unsign-and-translate-ids [t] t)
(api.macros/defendpoint :get \"/ok\" \"doc\" [{:keys [token]} _q _b] (unsign-and-translate-ids token))
(api.macros/defendpoint :get \"/bad\" \"doc\" [{:keys [token]} _q _b] token)"
        rows (map :row (check-cg :metabase-security-lint/embed-endpoint-reaches-token-verification src))]
    (is (= [4] rows))))

(deftest model-read-without-authorization-test
  (let [src "(ns metabase.things.api (:require [metabase.api.macros :as api.macros] [toucan2.core :as t2] [metabase.api.common :as api]))
(api.macros/defendpoint :get \"/checked/:id\" \"doc\" [{:keys [id]} _q _b] (api/read-check :model/Thing id))
(api.macros/defendpoint :get \"/unchecked/:id\" \"doc\" [{:keys [id]} _q _b] (t2/select-one :model/Thing :id id))
(api.macros/defendpoint :get \"/nothing\" \"doc\" [_r _q _b] 1)
(api.macros/defendpoint :get \"/mine\" \"doc\" [_r _q _b] (t2/select :model/Thing :owner_id api/*current-user-id*))
(defn- my-thing [id user-id] (t2/select-one :model/Thing :id id :owner_id user-id))
(api.macros/defendpoint :get \"/mine/:id\" \"doc\" [{:keys [id]} _q _b] (my-thing id api/*current-user-id*))"
        rows (map :row (check-cg :metabase-security-lint/model-read-without-authorization src))]
    (is (= [3] rows) "only the select with no authz on any path; read-check counts, no select is fine, and a
                      query scoped to the current user -- directly or through a helper -- is authorized by
                      construction")))

(deftest honeysql-raw-from-dynamic-test
  (let [id :metabase-security-lint/honeysql-raw-from-dynamic]
    (is (flags? id "(ns t) (defn f [t] [:select [[:raw (str \"count(\" t \")\")]]])")
        "SQL text assembled around a value the function did not choose")
    (is (flags? id "(ns t) (defn f [kind] [:datediff [:raw (name kind)] 1 2])")
        "the name of an unvalidated keyword is spliced as-is")
    (is (clean? id "(ns t) (defn f [unit] [:datediff [:raw (name unit)] 1 2])")
        "a temporal unit is an MBQL enum, validated before a driver sees it")
    (is (clean? id "(ns t) (defn f [] [:select [[:raw \"now()\"]]])") "a literal is what :raw is for")
    (is (clean? id "(ns t) (defn f [unit] [:datediff [:raw (datepart-token unit)] 1 2])")
        "a value mapped through some other function is that function's to get right")
    (is (clean? id "(ns t) (defn f [t] [:raw (format \"date '%s'\" (u.date/format t))])"))
    (is (clean? id "(ns t) (defn f [t] [:raw (quote-name t)])") "quoting the identifier is the fix")
    (is (clean? id "(ns t) (defn f [t] ^:allow-raw-sql [:raw t])")
        "the marker the app-DB runtime guard honours is the lint's suppression as well")
    (is (clean? id "(ns t) (def dims 3) (defn f [] [:raw (format \"vector(%d)\" dims)])")
        "a namespace constant is not dynamic")
    (testing "a request value reaching the splice is an error; a merely dynamic one is a warning"
      (is (= [:warning] (map :severity (check-cg id "(ns t) (defn f [kind] [:datediff [:raw (name kind)] 1 2])"))))
      (is (= [:error] (map :severity (check-cg id "(ns t (:require [metabase.api.macros :as api.macros]))
(api.macros/defendpoint :post \"/x\" \"doc\" [_r _q {:keys [unit]}] [:datediff [:raw (name unit)] 1 2])")))))))

(deftest honeysql-inline-from-dynamic-test
  (let [id :metabase-security-lint/honeysql-inline-from-dynamic
        ep (fn [params body] (str "(ns t (:require [metabase.api.macros :as api.macros]))
(api.macros/defendpoint :get \"/x\" \"doc\" " params " " body ")"))]
    (is (= [:warning] (map :severity (check-cg id (ep "[{:keys [q]} _q _b]" "[:inline q]"))))
        "a request value of unknown type is written into the SQL text")
    (is (empty? (check-cg id (ep "[{:keys [n]} :- [:map [:n ms/PositiveInt]] _q _b]" "[:inline n]")))
        "a request value pinned to a number inlines safely")
    (is (empty? (check-cg id (ep "[{:keys [q]} _q _b]" "[:inline (long q)]"))) "and so does a coerced one")
    (is (empty? (check-cg id (ep "[{:keys [offset items]} _q _b]" "[:inline (+ offset items)]"))) "arithmetic is a number")
    (is (empty? (check-cg id "(ns t) (defn f [x] [:inline x])"))
        "a value no boundary reaches is the author's")))

(deftest hand-rolled-sql-quoting-test
  (let [id :metabase-security-lint/hand-rolled-sql-quoting
        d  (fn [body] (str "(ns metabase.driver.x) " body))]
    (is (flags? id (d "(defn quote-name [s] (str \"`\" s \"`\"))"))
        "wrapping in backticks without doubling the ones inside is the ClickHouse rename-table hole")
    (is (flags? id (d "(defn f [s] (str \"'\" s \"'\"))")) "a string literal built the same way")
    (is (flags? id (d "(defn f [kind] (format \"'%s'\" (name kind)))")) "the name of a keyword is as raw as the keyword")
    (is (clean? id (d "(defn f [unit] (format \"'%s'\" (name unit)))")) "a temporal unit is an MBQL enum")
    (is (flags? id "(ns t) (defn f [old new] (format \"RENAME TABLE %s TO %s\" old new))")
        "DDL with a bare interpolated identifier, wherever it is written")
    (is (flags? id (d "(defn f [s] (format \"\\\"%s\\\"\" s))")) "%s wrapped in quotes")
    (is (clean? id "(ns t) (defn f [old new] (format \"RENAME TABLE %s TO %s\" (quote-name old) (quote-name new)))")
        "quoting through a function whose name says so")
    (is (clean? id (d "(defn f [s] (str \"`\" (str/replace s \"`\" \"``\") \"`\"))"))
        "escaping the quote character first is the correct hand-rolled form")
    (is (clean? id (d "(defn f [t] (format \"date '%s'\" (u.date/format t)))"))
        "a value rendered by some other function has been shaped by it; the rule does not second-guess what")
    (is (clean? id "(ns metabase.things.api) (defn f [name] (format \"Branch '%s' already exists\" name))")
        "quotes in a REST namespace's messages are prose")
    (is (clean? id "(ns t) (defn f [name] (str \"Table '\" name \"' was not found\"))")
        "quotes inside prose are not identifier quoting")
    (is (clean? id (d "(defn f [type col] (format \"There's a value with the wrong type ('%s') in the '%s' column\" (name type) (name col)))"))
        "prose in a driver namespace is still prose")
    (is (clean? id "(ns t) (def t \"events\") (defn f [] (format \"DROP TABLE %s\" t))")
        "a namespace constant is not dynamic")))

(deftest blessed-honeysql-with-dynamic-leaf-test
  (let [id :metabase-security-lint/blessed-honeysql-with-dynamic-leaf
        ep (fn [params body] (str "(ns t (:require [metabase.api.macros :as api.macros]))
(api.macros/defendpoint :get \"/x\" \"doc\" " params " " body ")"))]
    (is (= [:warning] (map :severity (check-cg id (ep "[{:keys [owner]} _q _b]" "^:allow-subquery {:select [:id] :where [:= :owner owner]}"))))
        "a blessed clause trusts every leaf inside it, and an untyped request value can be a keyword or a clause")
    (is (= [:warning] (map :severity (check-cg id (ep "[{:keys [x]} _q _b]" "^:mb/interpret-as-query-syntax {:where [:= :id x]}")))))
    (is (empty? (check-cg id (ep "[{:keys [owner]} _q _b]" "^:allow-subquery {:select [:id] :where [:= :owner (long owner)]}")))
        "a coerced leaf is provably scalar")
    (is (empty? (check-cg id (ep "[{:keys [nm]} _q _b]" "^:allow-subquery {:select [:id] :from [:t] :where [:= :name (str nm)]}")))
        "a string leaf is bound as a parameter")
    (is (empty? (check-cg id (ep "[{:keys [owner]} :- [:map [:owner ms/PositiveInt]] _q _b]" "^:allow-subquery {:select [:id] :where [:= :owner owner]}")))
        "a request value pinned to a number is a bound parameter")
    (is (empty? (check-cg id (ep "[{:keys [q]} :- [:map [:q ms/NonBlankString]] _q _b]" "^:allow-subquery {:select [:id] :where [:= :name q]}")))
        "and so is one pinned to a string")
    (is (empty? (check-cg id (ep "[{:keys [user-id]} _q _b]" "^:allow-subquery {:select [:id] :where [:= :user_id user-id]}")))
        "a leaf named like an id is a number by convention")
    (is (empty? (check-cg id (ep "[{:keys [owner]} _q _b]" "{:select [:id] :from [:t] :where [:= :owner owner]}")))
        "an unblessed clause goes through the runtime guard")
    (is (empty? (check-cg id "(ns t) (defn f [x] ^:allow-subquery {:select [:id] :where [:= :id x]})"))
        "a leaf no boundary reaches is the author's")))

(deftest toucan-positional-arg-from-request-test
  (let [id  :metabase-security-lint/toucan-positional-arg-from-request
        src (fn [schema body]
              (str "(ns t (:require [metabase.api.macros :as api.macros] [toucan2.core :as t2]))
(api.macros/defendpoint :post \"/x\" \"doc\" [_r _q {:keys [id]} :- " schema "] " body ")"))]
    (is (= 1 (count (check-cg id (src "[:map [:id :any]]" "(t2/select-one :model/Card id)"))))
        "a value of any shape in the pk-or-query position is toucan's query when it is not a number")
    (is (= 1 (count (check-cg id (src "[:map [:id [:maybe :map]]]" "(t2/update! :model/Card id {:name \"x\"})")))))
    (is (empty? (check-cg id (src "[:map [:id ms/PositiveInt]]" "(t2/select-one :model/Card id)")))
        "a schema that pins the value to an integer is enforced at the request boundary")
    (is (empty? (check-cg id (src "[:map [:id :any]]" "(t2/select-one :model/Card (u/the-id id))")))
        "coercing to an id is the fix")
    (is (empty? (check-cg id (src "[:map [:id :any]]" "(t2/select-one :model/Card :id id)")))
        "the keyword-value form is a where clause, not a query")
    (is (empty? (check-cg id "(ns t (:require [toucan2.core :as t2])) (defn f [id] (t2/select-one :model/Card id))"))
        "an internal caller's parameter is not request-shaped")
    (is (= 1 (count (check-cg id "(ns t (:require [toucan2.core :as t2]))
(defn handle [request] (t2/select-one :model/Card (get-in request [:params :id])))")))
        "a Ring request map carries no schema at all")))

(deftest like-pattern-from-dynamic-test
  (let [id :metabase-security-lint/like-pattern-from-dynamic]
    (is (flags? id "(ns t) (defn f [q] [:like :name (str \"%\" q \"%\")])")
        "wildcards around a search string leave the string's own wildcards live")
    (is (flags? id "(ns t) (defn f [q] {:where [:ilike :name (str q \"%\")]})"))
    (is (flags? id "(ns t) (defn f [q] [:like :name q])") "a bare value is a pattern too")
    (is (clean? id "(ns t (:require [metabase.util.honey-sql-2 :as h2x])) (defn f [q] [:like :name (h2x/like-substring q)])")
        "the escaping helper is the fix")
    (is (clean? id "(ns t) (defn f [q] [:like :name (str (escape-like q) \"%\")])"))
    (is (clean? id "(ns t) (defn f [] [:like :name \"admin%\"])"))
    (is (clean? id "(ns t) (defn f [id] [:like :location (str \"/\" (long id) \"/%\")])")
        "a numeric coercion cannot carry a wildcard")
    (testing "escaping in the caller clears the request taint at the sink one call away"
      (let [src (fn [arg] (str "(ns t (:require [metabase.util.honey-sql-2 :as h2x]))
(defn- helper [pattern] [:like :name pattern])
(defn handle [request] (let [q (get-in request [:params :q])] (helper " arg ")))"))]
        (is (= [:warning] (map :severity (check-cg id (src "(str q \"%\")")))))
        (is (= [:note] (map :severity (check-cg id (src "(h2x/like-substring q)")))))))))

(deftest error-data-discloses-query-test
  (let [id :metabase-security-lint/error-data-discloses-query
        ep (fn [body] (str "(ns t (:require [metabase.api.macros :as api.macros]))
(defn- check [card] " body ")
(api.macros/defendpoint :post \"/x\" \"doc\" [_r _q {:keys [card]}] (check card))"))]
    (is (= [:warning] (map :severity (check-cg id (ep "(throw (ex-info \"no\" {:status-code 403 :query (:dataset_query card)}))"))))
        "the middleware serialises ex-data into the response body, so the denial carries the card's query")
    (is (empty? (check-cg id (ep "(throw (ex-info \"no\" {:sql (compile card)}))")))
        "without a status code it is somebody's diagnostic, and the query processor has dozens")
    (is (empty? (check-cg id (ep "(throw (ex-info \"no\" {:status-code 403 :card-id (:id card)}))")))
        "an id is not a disclosure")
    (is (empty? (check-cg id (ep "(throw (ex-info \"no\" {:query \"fixed text\"}))")))
        "a literal value discloses nothing")
    (is (empty? (check-cg id "(ns t) (defn f [q] (throw (ex-info \"no\" {:status-code 400 :query q})))"))
        "unreachable from a request, nothing returns it to a caller")))

(deftest hiccup1-unescaped-value-test
  (let [id :metabase-security-lint/hiccup1-unescaped-value]
    (is (flags? id "(ns t (:require [hiccup.core :refer [html]])) (defn f [title] (html [:h1 title]))")
        "hiccup 1 does not escape strings")
    (is (clean? id "(ns t (:require [hiccup.core :as hiccup])) (defn f [url] (hiccup/html [:img {:src url}]))")
        "but it does escape attribute values -- render-attribute runs escape-html -- so the value cannot leave
         the attribute; what URL it is, is another rule's question")
    (is (flags? id "(ns t (:require [hiccup.core :refer [html]])) (defn f [nm] (html [:p (str \"Hello \" nm)]))"))
    (is (clean? id "(ns t (:require [hiccup.core :refer [h html]])) (defn f [title] (html [:h1 (h title)]))")
        "escaping with `h` is the hiccup-1 fix")
    (is (clean? id "(ns t (:require [hiccup2.core :as hiccup])) (defn f [title] (hiccup/html [:h1 title]))")
        "hiccup 2 escapes by default")
    (is (clean? id "(ns t (:require [hiccup.core :refer [html]])) (defn f [rows] (html [:table (for [r rows] [:tr [:td \"x\"]])]))")
        "a local driving a loop is not rendered text")
    (is (flags? id "(ns t) (defn icon [color] (str \"<svg fill=\\\"\" color \"\\\">\"))")
        "markup assembled with str is the Batik file-read hole")
    (is (clean? id "(ns t) (defn icon [color] (str \"<svg fill=\\\"\" (escape-html color) \"\\\">\"))"))
    (is (clean? id "(ns t) (defn f [nm] (str \"Hello \" nm))") "no markup, no finding")))

(deftest url-setting-without-host-validation-test
  (let [id  :metabase-security-lint/url-setting-without-host-validation
        src (fn [opts] (str "(ns t (:require [metabase.settings.core :refer [defsetting]]))
(defsetting tile-server-url \"doc\" " opts ")"))]
    (is (flags? id (src ":visibility :admin"))
        "a URL an admin or settings manager can set, fetched by the server, is an SSRF vector")
    (is (flags? id (src ":visibility :admin :setter (fn [v] (setting/set-value-of-type! :string :tile-server-url v))"))
        "a setter that validates nothing")
    (is (clean? id (src ":visibility :admin :setter (fn [v] (when-not (u.http/host-allowed-for-network-policy? v) (throw (ex-info \"no\" {}))) (setting/set-value-of-type! :string :tile-server-url v))"))
        "a setter that applies the network policy")
    (is (clean? id (src ":visibility :internal")) "not settable through the API")
    (is (clean? id (src ":setter :none")) "environment-only")
    (is (clean? id (src ":visibility :admin :type :boolean")) "not a string")
    (is (clean? id "(ns t (:require [metabase.settings.core :refer [defsetting]])) (defsetting page-size \"doc\" :visibility :admin)")
        "not a URL")))

(deftest credential-endpoint-without-throttle-test
  (let [src "(ns metabase.session.api (:require [metabase.api.macros :as api.macros] [metabase.util.throttle :as throttle]))
(defn- check-throttle [k] (throttle/check nil k))
(api.macros/defendpoint :post \"/ok\" \"doc\" [_r _q {:keys [email password]}] (check-throttle email) password)
(api.macros/defendpoint :post \"/bad\" \"doc\" [_r _q {:keys [email password]}] password)
(api.macros/defendpoint :post \"/other\" \"doc\" [_r _q {:keys [name]}] name)"
        rows (map :row (check-cg :metabase-security-lint/credential-endpoint-without-throttle src))]
    (is (= [4] rows) "only the endpoint that takes a credential and reaches no throttle")))

(deftest endpoint-mounted-without-auth-test
  (let [routes "(ns metabase.api-routes.routes (:require [metabase.api.macros :as api.macros] [metabase.api.routes.common :as routes.common]))
(defn- +auth [h] (routes.common/+auth (api.macros/ns-handler h)))
(def ^:private route-map {\"/card\" (+auth 'metabase.cards.api) \"/util\" 'metabase.util.api \"/public\" (routes.common/+public-exceptions 'metabase.public-sharing-rest.api)})"
        api    (fn [ns] (str "(ns " ns " (:require [metabase.api.macros :as api.macros]))
(api.macros/defendpoint :get \"/x\" \"doc\" [_r _q _b] 1)"))
        scan   (fn [& srcs]
                 (let [dir (doto (java.io.File. (System/getProperty "java.io.tmpdir") (str "seclint" (System/nanoTime)))
                             .mkdirs .deleteOnExit)]
                   (doseq [[i src] (map-indexed vector srcs)]
                     (spit (doto (java.io.File. dir (str "f" i ".clj")) .deleteOnExit) src))
                   (engine/analyze {:paths [(.getAbsolutePath dir)]
                                    :rules [(rule/by-id :metabase-security-lint/endpoint-mounted-without-auth)]
                                    :taint-sources :call-graph})))]
    (is (= ["metabase.util.api is mounted under no authentication wrapper"]
           (map :message (scan routes (api "metabase.cards.api") (api "metabase.util.api"))))
        "only the namespace mounted bare; the anonymous-by-design ones are exempt by path")
    (is (empty? (scan routes "(ns metabase.util.api (:require [metabase.api.macros :as api.macros] [metabase.api.common :as api]))
(api.macros/defendpoint :get \"/x\" \"doc\" [_r _q _b] (api/check-superuser) 1)"))
        "an endpoint that demands a superuser in its body has demanded a session")))

(deftest driver-connection-check-bypassed-test
  (let [id :metabase-security-lint/driver-connection-check-bypassed]
    (is (flags? id "(ns metabase.driver.x (:require [metabase.driver :as driver]))
(defmethod driver/validate-db-details! :x [_ details] (when (:bad details) (throw (Exception. \"no\"))))")
        "overriding the check drops the shared JDBC property denylist unless the parent runs too")
    (is (clean? id "(ns metabase.driver.x (:require [metabase.driver :as driver]))
(defmethod driver/validate-db-details! :x [driver details] ((get-method driver/validate-db-details! :sql-jdbc) driver details) (when (:bad details) (throw (Exception. \"no\"))))"))
    (is (clean? id "(ns metabase.driver.x (:require [metabase.driver :as driver]))
(defmethod driver/validate-db-details! :x [_ details] (when (re-find #\"socketFactory\" (:additional-options details)) (throw (Exception. \"no\"))))")
        "an override that denylists additional-options itself is the check by another route")
    (is (flags? id "(ns metabase.driver.x (:require [metabase.driver :as driver]))
(defmethod driver/can-connect? :x [driver details] (open-a-connection driver details))")
        "a connection test that never validates the details connects with whatever they say")
    (is (clean? id "(ns metabase.driver.x (:require [metabase.driver :as driver]))
(defmethod driver/can-connect? :x [driver details] (driver/validate-db-details! driver details) (open-a-connection driver details))"))
    (is (clean? id "(ns metabase.driver.x (:require [metabase.driver :as driver]))
(defmethod driver/can-connect? :x [driver details] ((get-method driver/can-connect? :sql-jdbc) driver details))")
        "delegating to the parent runs its validation")
    (is (clean? id "(ns metabase.driver.x (:require [metabase.driver :as driver]))
(defmethod driver/display-name :x [_] \"X\")") "any other method")))

(deftest trust-all-certificates-constructor-test
  (is (flags? :metabase-security-lint/trust-all-certificates
              "(ns t (:import (com.unboundid.util.ssl TrustAllTrustManager))) (defn f [] (TrustAllTrustManager.))")
      "a library's ready-made trust-everything manager is the same hole without a reify"))

(deftest credential-sent-to-boundary-host-test
  (let [id :metabase-security-lint/credential-sent-to-boundary-host
        src (fn [url opts] (str "(ns t (:require [clj-http.client :as http] [metabase.settings.core :refer [defsetting]]))
(defsetting llm-base-url \"doc\")
(defsetting llm-api-key \"doc\" :sensitive? true)
(defn f [] (http/post " url " " opts "))"))]
    (is (= 1 (count (check-cg id (src "(llm-base-url)" "{:headers {\"Authorization\" (str \"Bearer \" (llm-api-key))}}"))))
        "a key sent to a host a settings manager chose")
    (is (= 1 (count (check-cg id (src "(llm-base-url)" "{:form-params {:api_key (llm-api-key)}}")))))
    (is (empty? (check-cg id (src "\"https://api.vendor.com\"" "{:headers {\"Authorization\" (str \"Bearer \" (llm-api-key))}}")))
        "a fixed host is the vendor")
    (is (empty? (check-cg id (src "(llm-base-url)" "{:body \"ping\"}")))
        "no credential in the request")
    (is (= 1 (count (check-cg id "(ns t (:require [clj-http.client :as http] [metabase.settings.core :refer [defsetting]]))
(defsetting hook-url \"doc\")
(defn f [token] (http/request {:url (hook-url) :method :post :headers {\"Authorization\" token}}))")))
        "the single-map form of request")))

(deftest stored-query-runs-as-another-user-test
  (let [id :metabase-security-lint/stored-query-runs-as-another-user]
    (is (= 1 (count (check-cg id "(ns t (:require [toucan2.core :as t2] [metabase.request.core :as request] [metabase.query-processor :as qp]))
(defn f [card-id] (let [card (t2/select-one :model/Card card-id)] (request/with-current-user (:creator_id card) (qp/process-query (:dataset_query card)))))")))
        "a stored query executed under its creator's identity")
    (is (empty? (check-cg id "(ns t (:require [metabase.request.core :as request] [metabase.query-processor :as qp]))
(defn f [query] (request/with-current-user 1 (qp/process-query query)))"))
        "a query from nowhere the graph sees")
    (is (empty? (check-cg id "(ns t (:require [toucan2.core :as t2] [metabase.query-processor :as qp]))
(defn f [card-id] (let [card (t2/select-one :model/Card card-id)] (qp/process-query (:dataset_query card))))"))
        "run as the caller, which the permission middleware then checks")))

(deftest mass-assignment-by-origin-test
  (let [id :metabase-security-lint/mass-assignment
        dal (fn [src]
              (let [dir (doto (java.io.File. (System/getProperty "java.io.tmpdir") (str "seclint" (System/nanoTime)))
                          .mkdirs .deleteOnExit)
                    f   (doto (java.io.File. dir "db.clj") .deleteOnExit)]
                (spit f src)
                (engine/analyze {:paths [(.getAbsolutePath f)] :rules [(rule/by-id id)] :taint-sources :call-graph})))]
    (is (empty? (dal "(ns t (:require [toucan2.core :as t2] [metabase.driver :as driver]))
(defn sync! [driver db table-id] (let [described (driver/describe-table driver db table-id)] (t2/update! :model/Table table-id described)))"))
        "warehouse-described metadata written into a Table is sync; the data-access layer is where that happens")
    (is (= 1 (count (dal "(ns t (:require [toucan2.core :as t2] [metabase.driver :as driver]))
(defn sync! [driver db table-id] (let [described (driver/describe-table driver db table-id)] (t2/update! :model/Database table-id described)))")))
        "written into a Database -- its details are a credential -- it is a finding even there")
    (is (empty? (dal "(ns t (:require [toucan2.core :as t2] [clj-yaml.core :as yaml]))
(defn import! [id text] (t2/update! :model/Card id (yaml/parse-string text)))"))
        "an imported document into a content model is the import")
    (is (= 1 (count (dal "(ns t (:require [toucan2.core :as t2] [clj-yaml.core :as yaml]))
(defn import! [id text] (t2/update! :model/User id (yaml/parse-string text)))")))
        "into a User it sets is_superuser")
    (is (= 1 (count (dal "(ns t (:require [toucan2.core :as t2]))
(defn revert! [card-id revision-id] (let [rev (t2/select-one :model/Revision revision-id)] (t2/update! :model/Card card-id (:object rev))))")))
        "a row of one model written wholesale into another -- what revert does")
    (is (empty? (dal "(ns t (:require [toucan2.core :as t2]))
(defn save! [card] (t2/update! :model/Card (:id card) card))"))
        "an internal helper's parameter is nothing the graph sees")
    (is (empty? (dal "(ns t (:require [toucan2.core :as t2] [metabase.api.macros :as api.macros]))
(api.macros/defendpoint :put \"/:id\" \"doc\" [{:keys [id]} _q body] (t2/update! :model/Card id body))"))
        "a request map in the data-access layer is what the layer is for; the API rule catches it elsewhere")))

(deftest setting-written-from-boundary-test
  (let [id :metabase-security-lint/setting-written-from-boundary]
    (is (= 1 (count (check-cg id "(ns t (:require [metabase.settings.core :as setting] [clj-yaml.core :as yaml]))
(defn apply! [text] (let [doc (yaml/parse-string text)] (setting/set! :site-name (:site-name doc))))")))
        "a synced document rewriting an instance setting")
    (is (= 1 (count (check-cg id "(ns t (:require [metabase.settings.core :as setting] [clj-http.client :as http]))
(defn refresh! [] (setting/set-value-of-type! :string :token-status (:body (http/get \"https://store\"))))")))
        "an HTTP response written into a setting")
    (is (empty? (check-cg id "(ns t (:require [metabase.settings.core :as setting] [metabase.api.macros :as api.macros]))
(api.macros/defendpoint :put \"/:key\" \"doc\" [{:keys [key]} _q {:keys [value]}] (setting/set! key value))"))
        "the settings API writes request values by design")))

(deftest toucan-model-from-boundary-test
  (let [id :metabase-security-lint/toucan-model-from-boundary]
    (is (= 1 (count (check-cg id "(ns t (:require [toucan2.core :as t2] [metabase.api.macros :as api.macros]))
(api.macros/defendpoint :get \"/:model/:id\" \"doc\" [{:keys [model id]} _q _b] (t2/select-one (keyword \"model\" model) :id id))")))
        "a request chooses the table")
    (is (= 1 (count (check-cg id "(ns t (:require [toucan2.core :as t2] [clj-yaml.core :as yaml]))
(defn load! [text] (let [doc (yaml/parse-string text)] (t2/select (:model doc))))")))
        "a document chooses it")
    (is (empty? (check-cg id "(ns t (:require [toucan2.core :as t2]))
(defn f [id] (t2/select-one :model/Card id))")) "a literal model")
    (is (empty? (check-cg id "(ns t (:require [toucan2.core :as t2]))
(defn f [model id] (t2/select-one model id))")) "an internal parameter")
    (is (empty? (check-cg id "(ns t (:require [toucan2.core :as t2] [metabase.api.macros :as api.macros]))
(api.macros/defendpoint :get \"/:model/:id\" \"doc\" [{:keys [model id]} :- [:map [:model [:enum \"card\" \"dashboard\"]] [:id :int]] _q _b] (t2/select-one (keyword \"model\" model) :id id))"))
        "a request value an enum pins cannot name another table")
    (is (empty? (check-cg id "(ns t (:require [toucan2.core :as t2] [metabase.api.macros :as api.macros]))
(def ^:private entity->model {\"card\" :model/Card})
(api.macros/defendpoint :get \"/:entity/:id\" \"doc\" [{:keys [entity id]} _q _b] (t2/select-one (entity->model entity) :id id))"))
        "a model looked up in an allow-list map is one of the map's")
    (is (empty? (check-cg id "(ns t (:require [toucan2.core :as t2] [metabase.api.macros :as api.macros]))
(def ^:private allowed {\"card\" :model/Card})
(api.macros/defendpoint :get \"/:entity/:id\" \"doc\" [{:keys [entity id]} _q _b] (let [model (get allowed entity)] (t2/select-one model :id id)))"))
        "through get, and through a binding")
    (is (= [:warning] (map :severity (check-cg id "(ns t (:require [toucan2.core :as t2]))
(defn f [id] (let [item (t2/select-one :model/Bookmark id)] (t2/select-one (keyword \"model\" (:type item)) :id (:item_id item))))")))
        "a model name out of a row is a warning")))

(deftest credential-row-logged-test
  (let [id :metabase-security-lint/sensitive-data-in-logs]
    (is (= 1 (count (check-cg id "(ns t (:require [toucan2.core :as t2] [metabase.util.log :as log]))
(defn f [id] (let [db (t2/select-one :model/Database id)] (log/warn \"syncing\" db)))")))
        "a Database row carries connection details whatever the variable is called")
    (is (= 1 (count (check-cg id "(ns t (:require [toucan2.core :as t2] [metabase.util.log :as log]))
(defn f [id] (let [db (t2/select-one :model/Database id)] (log/warn \"syncing\" (pr-str db))))"))))
    (is (empty? (check-cg id "(ns t (:require [toucan2.core :as t2] [metabase.util.log :as log]))
(defn f [id] (let [db (t2/select-one :model/Database id)] (log/warn \"syncing\" (:name db))))"))
        "a column of it that is not the credential")
    (is (empty? (check-cg id "(ns t (:require [toucan2.core :as t2] [metabase.util.log :as log]))
(defn f [id] (let [card (t2/select-one :model/Card id)] (log/warn \"running\" card)))"))
        "a Card row carries no credential")))

(deftest credential-row-in-error-data-test
  (let [id :metabase-security-lint/error-data-discloses-query]
    (is (= 1 (count (check-cg id "(ns t (:require [toucan2.core :as t2]))
(defn f [id] (let [db (t2/select-one :model/Database id)] (throw (ex-info \"no\" {:status-code 400 :database db}))))")))
        "a Database row in ex-data reaches the response body with its details")))

(deftest path-traversal-severity-test
  (let [id :metabase-security-lint/path-traversal]
    (is (= [:error] (map :severity (check-cg id "(ns t (:require [clojure.java.io :as io] [toucan2.core :as t2]))
(defn f [id] (let [db (t2/select-one :model/Database id)] (io/file (get-in db [:details :ssl-key-path]))))")))
        "a path stored in connection details is chosen by whoever edits the database")
    (is (= [:error] (map :severity (check-cg id "(ns t (:require [clojure.java.io :as io] [metabase.api.macros :as api.macros]))
(api.macros/defendpoint :get \"/:name\" \"doc\" [{:keys [name]} _q _b] (io/file \"/data\" name))")))
        "and a request path always was")))

(deftest request-id-never-checked-test
  (let [id  :metabase-security-lint/request-id-never-checked
        src (fn [body] (str "(ns metabase.things.api (:require [metabase.api.macros :as api.macros] [metabase.api.common :as api] [toucan2.core :as t2]))
(defn- link! [id card-id] (t2/update! :model/Thing id {:card_id card-id}))
(defn- checked-link! [id card-id] (api/read-check :model/Card card-id) (t2/update! :model/Thing id {:card_id card-id}))
(api.macros/defendpoint :put \"/:id\" \"doc\" [{:keys [id]} _q {:keys [card_id]}] (api/write-check :model/Thing id) " body ")"))]
    (is (= ["Request id never permission-checked on any path: card_id"]
           (map :message (check-cg id (src "(link! id card_id)"))))
        "the route id is write-checked; the body id reaches a write through a helper with no check anywhere")
    (is (empty? (check-cg id (src "(checked-link! id card_id)")))
        "a check inside the helper vouches for the caller's id")
    (is (empty? (check-cg id (src "(api/read-check :model/Card card_id) (link! id card_id)")))
        "or a check in the endpoint")
    (is (empty? (check-cg id (src "(link! id 1)")))
        "an id the endpoint never uses is nothing to check")
    (is (empty? (check-cg id "(ns metabase.things.api (:require [metabase.api.macros :as api.macros] [metabase.api.common :as api] [toucan2.core :as t2]))
(api.macros/defendpoint :get \"/:id\" \"doc\" [{:keys [id]} _q _b] (let [thing (api/read-check (t2/select-one :model/Thing id))] thing))"))
        "a check on the object fetched by the id vouches for the id")
    (is (empty? (check-cg id "(ns metabase.things.api (:require [metabase.api.macros :as api.macros] [metabase.api.common :as api] [toucan2.core :as t2]))
(api.macros/defendpoint :delete \"/:id\" \"doc\" [{:keys [id]} _q _b] (api/check-superuser) (t2/delete! :model/Thing id))"))
        "a superuser may name any object")
    (is (empty? (check-cg id "(ns metabase.things.api (:require [metabase.api.macros :as api.macros] [metabase.users.core :as users] [toucan2.core :as t2]))
(api.macros/defendpoint :put \"/:id/password\" \"doc\" [{:keys [id]} _q _b] (users/check-self-or-superuser id) (t2/update! :model/User id {:x 1}))"))
        "the self-or-superuser check is a check on the id")
    (is (empty? (check-cg id "(ns metabase.things.api (:require [metabase.api.macros :as api.macros] [toucan2.core :as t2]))
(api.macros/defendpoint :get \"/\" \"doc\" [_r {:keys [creator_id]} _b] (t2/select :model/Thing :creator_id creator_id))"))
        "an id in a listing's query parameters filters what the caller may see; it names nothing to authorize")
    (is (= 1 (count (check-cg id "(ns metabase.things.api (:require [metabase.api.macros :as api.macros] [toucan2.core :as t2]))
(api.macros/defendpoint :get \"/\" \"doc\" [_r _q {:keys [creator_id]}] (t2/select :model/Thing :creator_id creator_id))")))
        "the same id in the body of a listing is still an id")))

(deftest write-checked-against-other-model-test
  (let [id :metabase-security-lint/write-checked-against-other-model]
    (is (empty? (check-cg id "(ns t (:require [metabase.api.common :as api] [toucan2.core :as t2]))
(defn f [db-id card-id] (api/write-check :model/Database db-id) (t2/update! :model/Card card-id {:archived true}))"))
        "the written id was never checked at all: that is the unchecked-id rule's finding, not this one's")
    (is (= 1 (count (check-cg id "(ns t (:require [metabase.api.common :as api] [toucan2.core :as t2]))
(defn f [card-id] (api/write-check :model/Database (card-db card-id)) (t2/update! :model/Card card-id {:archived true}))")))
        "the card id went into a Database check, and the write is to Card")
    (is (empty? (check-cg id "(ns t (:require [metabase.api.common :as api] [toucan2.core :as t2]))
(defn f [card-id] (api/write-check :model/Card card-id) (t2/update! :model/Card card-id {:archived true}))"))
        "checked as the model written")
    (is (empty? (check-cg id "(ns t (:require [metabase.api.common :as api] [toucan2.core :as t2]))
(defn f [card-id] (api/write-check :model/Collection (card-collection card-id)) (t2/update! :model/Card card-id {:archived true}))"))
        "or as the model that owns it")
    (is (empty? (check-cg id "(ns t (:require [metabase.api.common :as api] [toucan2.core :as t2]))
(defn f [card-id] (let [card (api/write-check (t2/select-one :model/Card card-id))] (t2/update! :model/Card (:id card) {:archived true})))"))
        "an unnamed check on the fetched object authorizes it")))

(deftest nested-request-id-never-checked-test
  (let [id  :metabase-security-lint/nested-request-id-never-checked
        src (fn [body] (str "(ns metabase.things.api (:require [metabase.api.macros :as api.macros] [metabase.api.common :as api] [toucan2.core :as t2]))
(api.macros/defendpoint :put \"/:id\" \"doc\" [{:keys [id]} _q {:keys [dashcards]}]
  (api/write-check :model/Thing id)
  (doseq [dc dashcards] " body "))"))]
    (is (= ["Request id :action_id read from dc is never permission-checked on any path"]
           (map :message (check-cg id (src "(t2/update! :model/Dashcard 1 {:action_id (:action_id dc)})"))))
        "an id inside each dashcard of the body, written with no check")
    (is (empty? (check-cg id (src "(api/read-check :model/Action (:action_id dc)) (t2/update! :model/Dashcard 1 {:action_id (:action_id dc)})")))
        "checked at the read")
    (is (= ["Request id :action_id read from dc is never permission-checked on any path"]
           (map :message (check-cg id (src "(api/read-check :model/Card (:card_id dc)) (t2/update! :model/Dashcard 1 {:action_id (:action_id dc)})"))))
        "a check on another key of the same map does not count")
    (is (empty? (check-cg id "(ns t (:require [toucan2.core :as t2]))
(defn f [dc] (:action_id dc))"))
        "not request data")
    (is (empty? (check-cg id "(ns metabase.things.api (:require [metabase.api.macros :as api.macros] [clj-http.client :as http]))
(api.macros/defendpoint :post \"/upload\" \"doc\" [_r _q {:keys [file]}]
  (let [info (http/post \"https://slack.com/api/files.upload\" {:multipart [{:content file}]})] (str (:id info))))"))
        "an external service's id is no row of ours")))

(deftest endpoint-returns-unchecked-rows-test
  (let [id  :metabase-security-lint/endpoint-returns-unchecked-rows
        src (fn [body] (str "(ns metabase.things.api (:require [metabase.api.macros :as api.macros] [metabase.api.common :as api] [toucan2.core :as t2]))
(api.macros/defendpoint :get \"/:id/cards\" \"doc\" [{:keys [id]} _q _b] " body ")"))]
    (is (= ["Returns rows of Card with no check on it on any path"]
           (map :message (check-cg id (src "(api/read-check :model/Table id) (t2/select :model/Card :table_id id)"))))
        "the table was checked; the cards returned are authorized by their collections, which nothing checked")
    (is (empty? (check-cg id (src "(api/read-check :model/Table id) (t2/select :model/Field :table_id id)")))
        "a Field is owned by its Table, and the table was checked")
    (is (empty? (check-cg id (src "(let [t (api/read-check :model/Thing id)] (t2/select :model/Thing :parent_id (:id t)))")))
        "checked as the model returned")
    (is (empty? (check-cg id (src "(t2/select :model/Thing {:where (visible-thing-filter-clause)})")))
        "a visibility filter on the query vouches for what it returns")))

(deftest every-rule-is-covered-test
  (testing "every registered rule has a test in this namespace, so new rules can't land untested"
    (let [tested (set (for [[k v] (ns-publics 'dev.security-lint.rules-test)
                            :when (:test (meta v))
                            :let  [n (name k)]]
                        n))
          missing (remove (fn [r]
                            (let [base (name (:id r))]
                              (some #(str/starts-with? % base) tested)))
                          (rule/all))]
      (is (empty? (map :id missing))))))

(deftest model-read-authorized-by-ns-middleware-test
  (testing "a namespace wrapped in +check-superuser middleware is authorized without a per-endpoint call"
    (let [src "(ns metabase.things.api (:require [metabase.api.macros :as api.macros] [toucan2.core :as t2] [metabase.api.common :as api]))
(api.macros/defendpoint :get \"/:id\" \"doc\" [{:keys [id]} _q _b] (t2/select-one :model/Thing :id id))
(def routes (api.macros/ns-handler *ns* api/+check-superuser))"]
      (is (empty? (check-cg :metabase-security-lint/model-read-without-authorization src))))))

(deftest model-read-visibility-helpers-test
  (let [src (fn [helper]
              (str "(ns metabase.things.api (:require [metabase.api.macros :as api.macros] [toucan2.core :as t2]))
(defn- " helper " [x] x)
(api.macros/defendpoint :get \"/\" \"doc\" [_r _q _b] (" helper " (t2/select :model/Thing)))"))]
    (testing "a visibility filter authorizes a list endpoint"
      (is (empty? (check-cg :metabase-security-lint/model-read-without-authorization (src "visible-collection-filter-clause"))))
      (is (empty? (check-cg :metabase-security-lint/model-read-without-authorization (src "has-visible-card?")))))
    (testing "a helper that merely has `visible` in its name does not"
      (is (= 1 (count (check-cg :metabase-security-lint/model-read-without-authorization (src "user-visible-columns")))))
      (is (= 1 (count (check-cg :metabase-security-lint/model-read-without-authorization (src "visible-columns"))))))))

(deftest sites-inside-threading-and-fn-literals-test
  (testing "a dangerous call is the same call written with a threading macro or inside #()"
    (is (flags? :metabase-security-lint/command-injection
                "(ns t (:require [clojure.java.shell :as shell]))
                 (defn f [dir xs] (map #(shell/sh \"bash\" \"-c\" (str \"ls \" dir %)) xs))"))
    (is (flags? :metabase-security-lint/unsafe-deserialization
                "(ns t) (defn f [s] (->> s read-string))"))
    (is (flags? :metabase-security-lint/unsafe-nippy-thaw
                "(ns t (:require [taoensso.nippy :as nippy])) (defn f [blob] (some-> blob nippy/thaw))"))
    (is (flags? :metabase-security-lint/insecure-tls-option
                "(ns t (:require [clj-http.client :as http]))
                 (defn f [url] (-> url (http/get {:insecure? true})))")))
  (testing "the threaded value is the call's first argument, so a threaded URL is a caller-supplied one"
    (is (= [:error] (map :severity (check :metabase-security-lint/unguarded-outbound-http
                                          "(ns t (:require [clj-http.client :as http]))
                                           (defn f [url] (-> url (http/get {:as :json})))"))))))

(deftest weak-random-constructor-forms-test
  (testing "every spelling of the constructor is the same call"
    (is (flags? :metabase-security-lint/weak-random "(ns t) (defn f [] (new java.util.Random))"))
    (is (flags? :metabase-security-lint/weak-random "(ns t) (defn f [] (java.util.Random/new))"))
    (is (flags? :metabase-security-lint/weak-random "(ns t (:import java.util.Random)) (defn f [] (Random/new))")))
  (is (clean? :metabase-security-lint/weak-random "(ns t) (defn f [] (new java.security.SecureRandom))")))

(deftest trust-all-certificates-forms-test
  (testing "proxy, deftype and defrecord implement the interface as surely as reify does"
    (is (flags? :metabase-security-lint/trust-all-certificates
                "(ns t) (defn f [] (proxy [javax.net.ssl.X509TrustManager] [] (checkServerTrusted [_ _] nil)))"))
    (is (flags? :metabase-security-lint/trust-all-certificates
                "(ns t) (deftype Trusting [] javax.net.ssl.X509TrustManager (checkServerTrusted [_ _ _] nil))"))
    (is (flags? :metabase-security-lint/trust-all-certificates
                "(ns t) (defrecord Trusting [] javax.net.ssl.X509TrustManager (checkServerTrusted [_ _ _] nil))")))
  (testing "the extended interface replaces the same validation"
    (is (flags? :metabase-security-lint/trust-all-certificates
                "(ns t) (defn f [] (reify javax.net.ssl.X509ExtendedTrustManager (checkServerTrusted [_ _ _] nil)))")))
  (is (clean? :metabase-security-lint/trust-all-certificates
              "(ns t) (defn f [] (proxy [java.io.Closeable] [] (close [] nil)))")))

(deftest sensitive-data-in-logs-coverage-test
  (testing "every level of the project logger, plain and format variants alike"
    (doseq [call ["(log/debugf \"pw %s\" password)"
                  "(log/tracef \"pw %s\" password)"
                  "(log/fatal password)"
                  "(log/fatalf \"pw %s\" password)"]]
      (is (flags? :metabase-security-lint/sensitive-data-in-logs
                  (str "(ns t (:require [metabase.util.log :as log])) (defn f [password] " call ")"))
          call)))
  (testing "a masked value is exactly what the remediation asks for"
    (is (clean? :metabase-security-lint/sensitive-data-in-logs
                "(ns t (:require [metabase.util.log :as log] [metabase.util.string :as u.str]))
                 (defn f [token] (log/infof \"token '%s'\" (u.str/mask token)))")))
  (testing "a count of LLM tokens is not a credential"
    (is (clean? :metabase-security-lint/sensitive-data-in-logs
                "(ns t (:require [metabase.util.log :as log]))
                 (defn f [usage] (log/info \"used\" (:tokens usage) :input-tokens 5))"))))

(deftest hardcoded-secret-def-test
  (testing "a var named like a credential and bound to a literal"
    (is (flags? :metabase-security-lint/hardcoded-secret "(ns t) (def api-key \"Abc123!!xyz-longer\")"))
    (is (flags? :metabase-security-lint/hardcoded-secret "(ns t) (defonce ^:private client-secret \"Abc123!!xyz-longer\")")))
  (is (clean? :metabase-security-lint/hardcoded-secret "(ns t) (def default-api-key \"llm-anthropic-api-key\")")
      "a setting name is an identifier, not a credential")
  (is (clean? :metabase-security-lint/hardcoded-secret "(ns t) (def api-key (env :api-key))")))

(deftest sql-injection-sanitizer-is-quoting-only-test
  (testing "a function that merely normalizes, munges or escapes text does not make an identifier safe to splice"
    (doseq [helper ["normalize-key" "munge-name" "escape-text"]]
      (is (flags? :metabase-security-lint/sql-injection
                  (str "(ns t (:require [next.jdbc :as jdbc]))
                        (defn f [db t] (jdbc/execute! db [(format \"select * from %s\" (" helper " t))]))"))
          helper))))

(deftest hardcoded-secret-stand-ins-test
  (testing "a name that says the value is not a real credential"
    (is (clean? :metabase-security-lint/hardcoded-secret
                "(ns t) (def ^:private fake-hashed-password \"$2a$10$owKjTym0ZGEEZOpxM0UyjekSvt66y1VvmOJddkAaMB37e0VAIVOX2\")")
        "a fixed hash to run bcrypt against when the user does not exist, so login timing does not leak existence")
    (is (clean? :metabase-security-lint/hardcoded-secret "(ns t) (def conn {:dummy-password \"Abc123!!xyz-longer\"})")))
  (testing "a value that is a mask marker rather than a credential"
    (is (clean? :metabase-security-lint/hardcoded-secret "(ns t) (def protected-password \"**MetabasePass**\")"))))

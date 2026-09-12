(ns dev.security-lint.rules.deserialization
  "Turning untrusted bytes into live objects."
  (:require
   [dev.security-lint.ast :as ast]
   [dev.security-lint.rule :refer [defrule]]))

(set! *warn-on-reflection* true)

(defrule unsafe-deserialization
  {:name        "Reader or evaluator applied to non-literal input"
   :description (str "clojure.core/read-string honours *read-eval*, so reading attacker-controlled text can "
                     "execute arbitrary code. load-string and eval do so unconditionally.")
   :remediation "Use clojure.edn/read-string, which has no eval semantics, for anything that crosses a trust boundary."
   :severity    {:tainted :error :otherwise :note}
   :precision   :high
   :cwe         "CWE-502"
   :tainted-arg 0
   :triggers    #{clojure.core/read-string
                  clojure.core/read
                  clojure.core/load-string
                  clojure.core/load-reader
                  clojure.core/eval}}
  [{:keys [node tainted?]}]
  (let [a (ast/arg node 0)]
    ;; Reading a literal is how config defaults and test fixtures are written; only non-literals are interesting.
    (when-not (and a (ast/literal? a))
      {:tainted? tainted?
       :message  (if tainted?
                   (str (ast/head-sym node) " is applied to a caller-supplied value")
                   (str (ast/head-sym node) " is applied to a value that isn't a literal"))})))

(defrule xxe
  {:name        "XML parsed with external entities enabled"
   :description (str "clojure.xml/parse uses a default SAXParser, which resolves external entities. A document can "
                     "then read local files or make the server issue requests on the attacker's behalf.")
   :remediation (str "Parse with a factory that sets disallow-doctype-decl, or use clojure.data.xml with "
                     ":support-dtd false.")
   :severity    {:tainted :error :otherwise :note}
   :precision   :medium
   :cwe         "CWE-611"
   :tainted-arg 0
   ;; clojure.xml is not the parser this codebase actually reaches for -- the rule reported nothing because it
   ;; was watching the wrong namespace.
   :triggers    #{clojure.xml/parse
                  clojure.data.xml/parse
                  clojure.data.xml/parse-str}
   :interop-triggers #{DocumentBuilderFactory/newInstance
                       SAXParserFactory/newInstance
                       XMLInputFactory/newInstance}}
  [{:keys [node tainted?]}]
  ;; a document shipped on the classpath -- `(io/resource "timezones/windowsZones.xml")` -- is the build's, and
  ;; its entities are whatever the build put there
  (when-not (some #(and (= "resource" (some-> (ast/head-sym %) name))
                        (some-> (ast/arg % 0) ast/unmeta ast/string-value))
                  (some->> (ast/arg node 0) (ast/find-nodes ast/call?)))
    {:tainted? tainted?
     :message  (str (or (ast/head-sym node) "XML parser")
                    " resolves external entities unless they are explicitly disabled")}))

(defrule unsafe-nippy-thaw
  {:name        "Nippy deserialization of caller-supplied bytes"
   :description (str "nippy/thaw reconstructs arbitrary Clojure values, including records and objects with custom "
                     "thaw handlers. Deserializing bytes that came from a request is a remote code execution risk.")
   :remediation (str "Deserialize only bytes the server produced and can authenticate -- sign the payload, or keep "
                     "it server-side and hand out an opaque identifier instead.")
   :severity    :error
   :precision   :medium
   :cwe         "CWE-502"
   :tainted-arg 0
   :triggers    #{taoensso.nippy/thaw
                  taoensso.nippy/thaw-from-in!
                  taoensso.nippy/thaw-from-in}}
  [{:keys [tainted?]}]
  (when tainted?
    {:tainted? true :message "Nippy thaw applied to a caller-supplied value"}))

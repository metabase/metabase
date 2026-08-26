(ns dev.modules-config-test
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.modules-config :as mc]
   [rewrite-clj.node :as n]
   [rewrite-clj.parser :as r.parser]))

(defn- resource [path]
  (slurp (io/resource (str "dev/modules_config_test/" path))))

(defn- rewrite
  "Rewrite `input` text against `desired`, returning just the text."
  [input desired]
  (:text (mc/rewrite-config input desired)))

;;;; ---------------------------------------------------------------------------
;;;; End-to-end golden test: full config + mock inputs -> expected config
;;;; ---------------------------------------------------------------------------

(deftest ^:parallel full-config-rewrite-test
  (testing "a full config.edn rewritten against mock deps-graph inputs matches the expected resource"
    (let [{:keys [config dependencies model-ownership model-references]}
          (edn/read-string (resource "mocks.edn"))
          desired          (mc/compute-desired config dependencies model-ownership model-references)
          {:keys [text warnings]} (mc/rewrite-config (resource "input-config.edn") desired)]
      (is (= (resource "expected-config.edn") text))
      (is (= [] warnings)
          "the scenario is structurally sound (no new/unsorted modules)")
      (testing "and rewriting is idempotent — re-running on the output is a no-op"
        (is (= text (rewrite text desired)))))))

;;;; ---------------------------------------------------------------------------
;;;; compute-desired is pure: value in, value out
;;;; ---------------------------------------------------------------------------

(deftest ^:parallel compute-desired-test
  (let [{:keys [config dependencies model-ownership model-references]}
        (edn/read-string (resource "mocks.edn"))
        desired (mc/compute-desired config dependencies model-ownership model-references)]
    (testing ":api = a module's namespaces used by *other* modules; :uses = modules it depends on"
      (is (= #{'metabase.beta.core} (get-in desired ['beta :api])))
      (is (= #{'beta 'gamma} (get-in desired ['alpha :uses])))
      (is (= #{} (get-in desired ['enterprise/zeta :api]))
          "zeta is used by nobody"))
    (testing ":model-exports = owned models referenced elsewhere; a model only used at home is not exported"
      (is (= #{:model/Alpha} (get-in desired ['alpha :model-exports])))
      (is (= #{} (get-in desired ['enterprise/zeta :model-exports]))
          "zeta owns :model/Zeta but only references it itself"))
    (testing ":model-imports = referenced models owned by other modules"
      (is (= #{:model/Beta :model/Gamma} (get-in desired ['alpha :model-imports]))))
    (testing "a :bypass module drives no imports and its references don't force exports"
      (is (= #{} (get-in desired ['gamma :model-imports]))))))

;;;; ---------------------------------------------------------------------------
;;;; Sorting (must match metabase.core.modules-test)
;;;; ---------------------------------------------------------------------------

(deftest ^:parallel sort-module-names-test
  (testing "enterprise/ modules sort last, others alphabetically"
    (is (= '[alpha beta enterprise/aaa enterprise/zzz]
           (#'mc/sort-module-names '[enterprise/zzz beta enterprise/aaa alpha])))))

(deftest ^:parallel sort-for-key-test
  (testing ":uses sorts modules enterprise-last; other keys sort naturally"
    (is (= '[alpha enterprise/zeta] (#'mc/sort-for-key :uses '[enterprise/zeta alpha])))
    (is (= '[a.b a.c a.d] (#'mc/sort-for-key :api '[a.d a.b a.c])))
    (is (= [:model/A :model/B] (#'mc/sort-for-key :model-imports [:model/B :model/A])))))

;;;; ---------------------------------------------------------------------------
;;;; Set nodes
;;;; ---------------------------------------------------------------------------

(deftest ^:parallel set-elements-test
  (testing "elements come back in file order (not the unordered order z/sexpr would give)"
    (is (= '[gamma alpha beta]
           (#'mc/set-elements (r.parser/parse-string "#{gamma alpha beta}"))))
    (is (= '[a b]
           (#'mc/set-elements (r.parser/parse-string "#{a ; trailing\n b}")))
        "comments and whitespace are skipped")))

(deftest ^:parallel build-set-node-test
  (testing "<=3 elements stay inline"
    (is (= "#{a b c}" (n/string (#'mc/build-set-node '[a b c] 10)))))
  (testing ">3 elements go one per line, continuation lines indented to `indent`"
    (is (= "#{a\n    b\n    c\n    d}"
           (n/string (#'mc/build-set-node '[a b c d] 4)))))
  (testing "empty set"
    (is (= "#{}" (n/string (#'mc/build-set-node [] 4))))))

;;;; ---------------------------------------------------------------------------
;;;; rewrite-config branches (via tiny hand-written configs)
;;;; ---------------------------------------------------------------------------

(defn- parse-modules [text]
  (:metabase/modules (edn/read-string text)))

(deftest ^:parallel sentinel-values-are-preserved-test
  (testing ":any and :bypass survive even when a concrete value is computed"
    (let [input "{:metabase/modules {m {:api :any :uses :any :model-imports :bypass}}}"]
      (is (= input (rewrite input '{m {:api  #{metabase.m.core}
                                       :uses #{other}
                                       :model-imports #{:model/X}}}))))))

(deftest ^:parallel missing-key-is-appended-test
  (let [input  "{:metabase/modules {m {:team \"T\"}}}"
        output (rewrite input '{m {:api #{metabase.m.core}}})]
    (is (= #{'metabase.m.core} (get-in (parse-modules output) ['m :api])))))

(deftest ^:parallel unsorted-set-is-resorted-test
  (let [input "{:metabase/modules {m {:uses #{gamma beta alpha}}}}"]
    (is (str/includes? (rewrite input '{m {:uses #{alpha beta gamma}}})
                       "#{alpha beta gamma}"))))

(deftest ^:parallel empty-computed-values-test
  (testing "an emptied model key is removed entirely"
    (let [input  "{:metabase/modules {m {:model-exports #{:model/X}}}}"
          output (rewrite input '{m {:model-exports #{}}})]
      (is (not (contains? (get (parse-modules output) 'm) :model-exports)))))
  (testing "an emptied :api is normalized to #{} rather than removed"
    (let [input  "{:metabase/modules {m {:api #{metabase.m.core}}}}"
          output (rewrite input '{m {:api #{}}})]
      (is (= #{} (get-in (parse-modules output) ['m :api]))))))

(deftest ^:parallel comment-preservation-test
  (testing "a comment inside a set that does NOT change is preserved"
    (let [input "{:metabase/modules {m {:uses #{alpha ; keep me\n beta}}}}"]
      (is (str/includes? (rewrite input '{m {:uses #{alpha beta}}}) "; keep me"))))
  (testing "a comment inside a set that IS resorted is dropped"
    (let [input "{:metabase/modules {m {:uses #{beta ; drop me\n alpha}}}}"]
      (is (not (str/includes? (rewrite input '{m {:uses #{alpha beta}}}) "; drop me"))))))

;;;; ---------------------------------------------------------------------------
;;;; Structural warnings (things the tool won't auto-fix, only reports)
;;;; ---------------------------------------------------------------------------

(deftest ^:parallel structural-warnings-test
  (testing "a desired module absent from the file is reported (needs a human-assigned :team)"
    (let [{:keys [warnings]} (mc/rewrite-config "{:metabase/modules {a {:uses #{}}}}"
                                                '{a {:uses #{}} b {:uses #{}}})]
      (is (some #(str/includes? % "b") warnings))))
  (testing "out-of-order modules are reported"
    (let [{:keys [warnings]} (mc/rewrite-config "{:metabase/modules {beta {:uses #{}} alpha {:uses #{}}}}"
                                                '{alpha {:uses #{}} beta {:uses #{}}})]
      (is (some #(str/includes? % "sorted") warnings)))))

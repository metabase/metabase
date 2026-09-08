(ns dev.security-lint.engine-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [dev.security-lint.ast :as ast]
   [dev.security-lint.engine :as engine]
   [dev.security-lint.rule :as rule]
   [dev.security-lint.rules :as rules]
   [dev.security-lint.taint :as taint]))

(set! *warn-on-reflection* true)

(defn- write-temp!
  "Write `contents` to a temp .clj file and return its path."
  [contents]
  (let [f (java.io.File/createTempFile "seclint" ".clj")]
    (.deleteOnExit f)
    (spit f contents)
    (.getAbsolutePath f)))

(def ^:private sample
  "(ns sample
  (:require [clojure.java.shell :as shell]
            [clojure.edn :as edn]))

(defn safe [x] (edn/read-string x))

(defn danger [user-input]
  (shell/sh \"bash\" \"-c\" (str \"ls \" user-input)))

(defn fine []
  (shell/sh \"ls\" \"-la\"))
")

(def ^:private shell-rule
  {:id :test/shell :name "Shell" :description "d" :severity :error :precision :high :cwe "CWE-78"
   :triggers '#{clojure.java.shell/sh}
   :detect (fn [{:keys [node]}]
             (when (some ast/dynamic-string? (ast/args node))
               {:message "dynamic shell argument"}))})

(deftest resolves-and-detects-test
  (let [path     (write-temp! sample)
        findings (engine/analyze {:paths [path] :rules [shell-rule]})]
    (testing "flags only the call whose argument is built dynamically"
      (is (= 1 (count findings)))
      (is (= :test/shell (:rule-id (first findings))))
      (is (= "dynamic shell argument" (:message (first findings)))))
    (testing "the finding points at the call form"
      (is (= 8 (:row (first findings))))
      (is (= 3 (:col (first findings)))))
    (testing "the finding carries the rule's metadata through for the reporter"
      (is (= :error (:severity (first findings))))
      (is (= "CWE-78" (:cwe (first findings)))))))

(deftest resolution-not-textual-test
  (testing "clojure.edn/read-string is not confused with clojure.core/read-string"
    (let [path (write-temp! sample)
          r    {:id :test/rs :name "rs" :description "d" :severity :error :precision :high :cwe "C"
                :triggers '#{clojure.core/read-string}
                :detect (fn [_] {:message "unsafe read"})}]
      (is (empty? (engine/analyze {:paths [path] :rules [r]}))))))

(deftest exempt-files-test
  (let [path (write-temp! sample)
        r    (assoc shell-rule :exempt-files [(re-pattern (str "^" (java.util.regex.Pattern/quote path) "$"))])]
    (testing "an exempt file produces no findings"
      (is (empty? (engine/analyze {:paths [path] :rules [r]}))))))

(deftest interop-triggers-test
  (let [path (write-temp! "(ns s)\n(defn f [] (javax.crypto.Cipher/getInstance \"DES/ECB/PKCS5Padding\"))\n")
        r    {:id :test/crypto :name "c" :description "d" :severity :error :precision :high :cwe "CWE-327"
              :interop-triggers '#{Cipher/getInstance}
              :detect (fn [{:keys [node]}]
                        (let [a (ast/arg node 0)]
                          (when (and a (ast/literal-string? a)
                                     (str/includes? (ast/->str a) "DES"))
                            {:message "weak cipher"})))}
        findings (engine/analyze {:paths [path] :rules [r]})]
    (testing "matches a static Java method call that kondo does not track as a var usage"
      (is (= 1 (count findings)))
      (is (= "weak cipher" (:message (first findings)))))))

(deftest no-rules-no-findings-test
  (is (empty? (engine/analyze {:paths [(write-temp! sample)] :rules []}))))

(deftest constructor-triggers-test
  (testing "matches a constructor call, imported or fully qualified"
    (let [r {:id :test/rng :name "r" :description "d" :severity :error :precision :high :cwe "CWE-338"
             :constructor-triggers '#{Random}
             :detect (fn [_] {:message "weak rng"})}]
      (is (= 1 (count (engine/analyze {:paths [(write-temp! "(ns s)\n(defn f [] (java.util.Random.))\n")] :rules [r]}))))
      (is (= 1 (count (engine/analyze {:paths [(write-temp! "(ns s (:import java.util.Random))\n(defn f [] (Random.))\n")] :rules [r]}))))
      (is (zero? (count (engine/analyze {:paths [(write-temp! "(ns s)\n(defn f [] (java.security.SecureRandom.))\n")] :rules [r]})))))))

(deftest overlapping-triggers-report-once-test
  (testing "a rule matching the same form through two trigger kinds reports one finding"
    (let [r {:id :test/dup :name "d" :description "d" :severity :error :precision :high :cwe "C"
             :triggers '#{clojure.java.shell/sh}
             :form-triggers '#{shell/sh}
             :detect (fn [_] {:message "hit"})}
          path (write-temp! "(ns s (:require [clojure.java.shell :as shell]))\n(defn f [] (shell/sh \"ls\"))\n")]
      (is (= 1 (count (engine/analyze {:paths [path] :rules [r]})))))))

(deftest refer-in-ns-form-is-not-a-call-site-test
  (testing "a name listed in :refer is reported by clj-kondo as a var usage but is not a call"
    (let [r {:id :test/refer :name "r" :description "d" :severity :error :precision :high :cwe "C"
             :triggers '#{clojure.java.shell/sh}
             :detect (fn [_] {:message "hit"})}
          path (write-temp! "(ns s (:require [clojure.java.shell :refer [sh]]))\n(defn f [] (sh \"ls\"))\n")]
      (is (= [2] (map :row (engine/analyze {:paths [path] :rules [r]})))
          "only the call on row 2, not the refer on row 1"))))

(deftest tainted-arg-in-context-test
  (testing ":tainted-arg tells the rule whether that argument is attacker-influenced, without boilerplate"
    (let [seen (atom [])
          r {:id :test/ta :name "n" :description "d" :precision :high :cwe "C"
             :severity {:tainted :error :otherwise :note}
             :triggers '#{clojure.java.shell/sh}
             :tainted-arg 0
             :detect (fn [ctx] (swap! seen conj (:tainted? ctx)) {:message "m" :tainted? (:tainted? ctx)})}
          path (write-temp! "(ns s (:require [metabase.api.macros :as api.macros] [clojure.java.shell :as shell]))
(defn internal [dir] (shell/sh dir))
(api.macros/defendpoint :post \"/x\" \"doc\" [_r _q {:keys [dir]}] (shell/sh dir))")
          findings (engine/analyze {:paths [path] :rules [r]})]
      (is (= #{true false} (set @seen)) "both call sites are visited, with taint resolved")
      (testing "severity follows the taint, so policy debt and exploitable cases are separable"
        (is (= {:note 1 :error 1} (frequencies (map :severity findings))))))))

(deftest endpoint-rule-fires-per-endpoint-test
  (testing "an :endpoint-rule visits each defendpoint once, with what it transitively reaches"
    (let [seen (atom [])
          r {:id :test/ep :name "n" :description "d" :severity :note :precision :low :cwe "C"
             :endpoint-rule true
             :detect (fn [{:keys [reaches endpoint-ns]}]
                       (swap! seen conj [endpoint-ns reaches]) nil)}
          path (write-temp! "(ns my.api (:require [metabase.api.macros :as api.macros]))
(defn- helper [] 1)
(api.macros/defendpoint :get \"/a\" \"doc\" [_r _q _b] (helper))
(api.macros/defendpoint :get \"/b\" \"doc\" [_r _q _b] 2)")]
      (engine/analyze {:paths [path] :rules [r] :taint-sources :call-graph})
      (is (= 2 (count @seen)) "one visit per endpoint")
      (is (= '[my.api my.api] (map first @seen)))
      (is (= ['#{my.api/helper} #{}] (map second (sort-by (comp count second) > @seen)))
          "/a reaches helper, /b reaches nothing"))))

(deftest rules-sharing-a-trigger-both-fire-test
  (testing "two rules on the same var each get their finding"
    (let [mk (fn [id] {:id id :name "n" :description "d" :severity :error :precision :high :cwe "C"
                       :triggers '#{clojure.java.shell/sh} :detect (fn [_] {:message (name id)})})
          path (write-temp! "(ns s (:require [clojure.java.shell :as shell]))\n(defn f [] (shell/sh \"ls\"))\n")]
      (is (= #{:test/a :test/b}
             (set (map :rule-id (engine/analyze {:paths [path] :rules [(mk :test/a) (mk :test/b)]}))))))))

(deftest exemptions-are-path-spelling-independent-test
  (testing "an anchored exemption matches however the scan path was spelled"
    (let [dir  (doto (java.io.File. (System/getProperty "java.io.tmpdir") (str "seclint" (System/nanoTime)))
                 .mkdirs .deleteOnExit)
          sub  (doto (java.io.File. dir "src/x") .mkdirs)
          f    (doto (java.io.File. sub "f.clj") .deleteOnExit)
          _    (spit f "(ns s (:require [clojure.java.shell :as shell]))\n(defn f [] (shell/sh \"ls\"))\n")
          r    {:id :test/ex :name "n" :description "d" :severity :error :precision :high :cwe "C"
                :triggers '#{clojure.java.shell/sh} :exempt-files [#"^src/x/"]
                :detect (fn [_] {:message "hit"})}
          run  (fn [path] (count (engine/analyze {:paths [path] :rules [r] :root (.getAbsolutePath dir)})))]
      (is (zero? (run (.getAbsolutePath f))) "absolute path")
      (is (zero? (run (str (.getAbsolutePath dir) "/./src/x/f.clj"))) "dot-relative path"))))

(deftest dead-code-is-not-scanned-test
  (testing "#_ forms, (comment ...) blocks and quoted data never compile and never produce findings"
    (let [r {:id :test/dead :name "n" :description "d" :severity :error :precision :high :cwe "C"
             :interop-triggers '#{Cipher/getInstance} :constructor-triggers '#{Random} :form-triggers '#{def}
             :detect (fn [_] {:message "hit"})}
          path (write-temp! "(ns s)
#_(javax.crypto.Cipher/getInstance \"DES\")
(comment (java.util.Random.))
(defn holder [] '(javax.crypto.Cipher/getInstance \"DES\"))
(defn live [] (javax.crypto.Cipher/getInstance \"DES\"))")]
      (is (= [5] (map :row (engine/analyze {:paths [path] :rules [r]})))
          "only the live call on row 5; row 4's interop is quoted data"))))

(deftest unparsed-files-are-reported-test
  (testing "a file rewrite-clj cannot parse is named in the result's metadata rather than silently skipped"
    (let [bad  (write-temp! "(ns s)\n(defn f [] (unbalanced")
          good (write-temp! "(ns t)\n(defn g [] 1)")
          res  (engine/analyze {:paths [good bad] :rules []})]
      (is (= [bad] (:unparsed (meta res)))))))

(deftest test-files-are-skipped-by-default-test
  (let [dir (doto (java.io.File. (System/getProperty "java.io.tmpdir") (str "seclint" (System/nanoTime)))
              .mkdirs .deleteOnExit)
        f   (doto (java.io.File. dir "x_test.clj") .deleteOnExit)
        _   (spit f "(ns s (:require [clojure.java.shell :as shell]))\n(defn f [] (shell/sh \"ls\"))\n")
        r   {:id :test/t :name "n" :description "d" :severity :error :precision :high :cwe "C"
             :triggers '#{clojure.java.shell/sh} :detect (fn [_] {:message "hit"})}]
    (is (empty? (engine/analyze {:paths [(.getAbsolutePath f)] :rules [r] :root (.getAbsolutePath dir)})))
    (is (= 1 (count (engine/analyze {:paths [(.getAbsolutePath f)] :rules [r] :root (.getAbsolutePath dir)
                                     :include-tests? true}))))))

(deftest job-reachable-is-not-endpoint-reachable-test
  (testing "a sink a job reaches is reachable, but not by a request"
    (let [r {:id :test/j :name "n" :description "d" :severity :error :precision :high :cwe "C"
             :triggers '#{clojure.java.shell/sh} :detect (fn [_] {:message "m"})}
          path (write-temp! "(ns s (:require [clojure.java.shell :as shell] [clojurewerkz.quartzite.jobs :as jobs]))
(defn- run-it [] (shell/sh \"ls\"))
(jobs/defjob Nightly [_] (run-it))")
          [f] (engine/analyze {:paths [path] :rules [r] :taint-sources :call-graph})]
      (is (= #{:job} (:reachable-from f)))
      (is (false? (:endpoint-reachable? f))))))

(deftest value-references-are-edges-test
  (testing "a function passed as a plain value -- not through map/filter -- is reachable, and a :refer is not a use"
    (let [r {:id :test/v :name "n" :description "d" :severity :error :precision :high :cwe "C"
             :triggers '#{clojure.java.shell/sh} :detect (fn [_] {:message "m"})}
          path (write-temp! "(ns s (:require [clojure.java.shell :as shell] [metabase.api.macros :as api.macros]))
(defn- run-it [] (shell/sh \"ls\"))
(defn- unused-elsewhere [] (shell/sh \"pwd\"))
(defn- register [m] m)
(api.macros/defendpoint :get \"/x\" \"doc\" [_r _q _b] (register {:on-done run-it}))")
          by-row (into {} (map (juxt :row :reachable-from)) (engine/analyze {:paths [path] :rules [r] :taint-sources :call-graph}))]
      (is (= #{:http} (get by-row 2)) "run-it, stored in a map by the endpoint")
      (is (= #{} (get by-row 3)) "unused-elsewhere is referenced by nothing"))))

(deftest referenced-check-does-not-count-as-executed-test
  (testing "an endpoint that only *references* an authorization check has not run it"
    (let [src "(ns metabase.things.api (:require [metabase.api.macros :as api.macros] [toucan2.core :as t2] [metabase.api.common :as api]))
(defn- checks [] {:later api/read-check})
(api.macros/defendpoint :get \"/:id\" \"doc\" [{:keys [id]} _q _b] (checks) (t2/select-one :model/Thing :id id))"
          path (write-temp! src)
          rule (rule/by-id :metabase-security-lint/model-read-without-authorization)]
      (rules/all)
      (is (= 1 (count (engine/analyze {:paths [path] :rules [rule] :taint-sources :call-graph})))
          "the select is unauthorized: read-check is stored in a map, never called")))
  (testing "but a check run through apply or partial has run"
    (let [src "(ns metabase.things.api (:require [metabase.api.macros :as api.macros] [toucan2.core :as t2] [metabase.api.common :as api]))
(api.macros/defendpoint :get \"/:id\" \"doc\" [{:keys [id]} _q _b] (apply api/read-check [:model/Thing id]) (t2/select-one :model/Thing :id id))"
          path (write-temp! src)
          rule (rule/by-id :metabase-security-lint/model-read-without-authorization)]
      (is (empty? (engine/analyze {:paths [path] :rules [rule] :taint-sources :call-graph}))))))

(deftest reference-in-endpoint-body-is-not-executed-either-test
  (let [rule (rule/by-id :metabase-security-lint/model-read-without-authorization)
        run  (fn [src] (count (engine/analyze {:paths [(write-temp! src)] :rules [rule] :taint-sources :call-graph})))]
    (rules/all)
    (testing "a check stored as a value right in the endpoint body has still not run"
      (is (= 1 (run "(ns metabase.things.api (:require [metabase.api.macros :as api.macros] [toucan2.core :as t2] [metabase.api.common :as api]))
(defn- register [m] m)
(api.macros/defendpoint :get \"/:id\" \"doc\" [{:keys [id]} _q _b] (register {:on-done api/read-check}) (t2/select-one :model/Thing :id id))"))))
    (testing "but one run through an aliased combinator such as m/mapply has"
      (is (zero? (run "(ns metabase.things.api (:require [metabase.api.macros :as api.macros] [toucan2.core :as t2] [metabase.api.common :as api] [medley.core :as m]))
(api.macros/defendpoint :get \"/:id\" \"doc\" [{:keys [id]} _q _b] (m/mapply api/read-check {:model :model/Thing :id id}) (t2/select-one :model/Thing :id id))"))))))

(deftest wrapped-check-is-not-executed-test
  (let [rule (rule/by-id :metabase-security-lint/model-read-without-authorization)
        run  (fn [src] (count (engine/analyze {:paths [(write-temp! src)] :rules [rule] :taint-sources :call-graph})))]
    (rules/all)
    (testing "a check wrapped in partial or comp may never run, so the finding stands"
      (is (= 1 (run "(ns metabase.things.api (:require [metabase.api.macros :as api.macros] [toucan2.core :as t2] [metabase.api.common :as api]))
(defn- later [f] f)
(api.macros/defendpoint :get \"/:id\" \"doc\" [{:keys [id]} _q _b] (later (partial api/read-check :model/Thing)) (t2/select-one :model/Thing :id id))")))
      (is (= 1 (run "(ns metabase.things.api (:require [metabase.api.macros :as api.macros] [toucan2.core :as t2] [metabase.api.common :as api]))
(defn- later [f] f)
(api.macros/defendpoint :get \"/:id\" \"doc\" [{:keys [id]} _q _b] (later (comp api/read-check identity)) (t2/select-one :model/Thing :id id))"))))
    (testing "the wrapped check still makes its target reachable from the endpoint"
      (let [r {:id :test/r :name "n" :description "d" :severity :error :precision :high :cwe "C"
               :triggers '#{clojure.java.shell/sh} :detect (fn [_] {:message "m"})}
            src "(ns s (:require [clojure.java.shell :as shell] [metabase.api.macros :as api.macros]))
(defn- run-it [] (shell/sh \"ls\"))
(api.macros/defendpoint :get \"/x\" \"doc\" [_r _q _b] (partial run-it))"
            [f] (engine/analyze {:paths [(write-temp! src)] :rules [r] :taint-sources :call-graph})]
        (is (= #{:http} (:reachable-from f)))))))

(def ^:private arg-rule
  "Reports every argument of the call, so a test can see exactly what the engine handed the rule."
  {:id :test/args :name "args" :description "d" :severity :error :precision :high :cwe "C"
   :triggers '#{clj-http.client/get}
   :detect (fn [{:keys [node]}] {:message (str/join " " (map ast/->str (ast/args node)))})})

(deftest threading-and-fn-literal-sites-test
  (let [path     (write-temp! "(ns t (:require [clj-http.client :as http]))
(defn a [url] (-> url http/get))
(defn b [url] (-> url (http/get {:as :json})))
(defn c [url] (->> url http/get))
(defn d [urls] (mapv #(http/get % {:as :json}) urls))
(defn e [url] (some-> url http/get))
(defn f [url] (cond-> url true (http/get {:as :json})))
(defn g [url] (-> url first (http/get {:as :json})))
(defn h [url] (->> {:as :json} (http/get url)))
")
        findings (engine/analyze {:paths [path] :rules [arg-rule]})
        by-row   (into {} (map (juxt :row :message)) findings)]
    (testing "a bare symbol in a threading macro is a call, with the threaded value as its argument"
      (is (= "url" (get by-row 2)))
      (is (= "url" (get by-row 4)))
      (is (= "url" (get by-row 6))))
    (testing "a list step receives the threaded value in the threaded position"
      (is (= "url {:as :json}" (get by-row 3)))
      (is (= "url {:as :json}" (get by-row 7)))
      (is (= "url {:as :json}" (get by-row 9))))
    (testing "the threaded value is the previous step, so a chain is followed"
      (is (= "(first url) {:as :json}" (get by-row 8))))
    (testing "a call inside #() is a call"
      (is (= "% {:as :json}" (get by-row 5))))
    (testing "each finding sits at the position kondo reported, once"
      (is (= [2 3 4 5 6 7 8 9] (sort (map :row findings)))))))

(deftest vector-triggers-test
  (testing "a rule can watch a keyword-headed vector, which is how HoneySQL spells [:raw ...]"
    (let [r {:id :test/raw :name "n" :description "d" :severity :error :precision :high :cwe "C"
             :vector-triggers #{:raw}
             :detect (fn [{:keys [node marks]}]
                       {:message (str (ast/->str (second (ast/children node))) " " (pr-str (sort marks)))})}
          path (write-temp! "(ns t)
(defn a [x] [:select [[:raw (str x)]]])
(defn b [x] [:select [[:cast x :int]]])
(defn c [x] [:select [[^:allow-raw-sql [:raw x]]]])")
          findings (engine/analyze {:paths [path] :rules [r]})
          by-row   (into {} (map (juxt :row :message)) findings)]
      (is (= [2 4] (sort (map :row findings))) "only the vectors headed by the watched keyword")
      (is (= "(str x) ()" (get by-row 2)) "the node is the vector itself")
      (is (= "x (:allow-raw-sql)" (get by-row 4)) "metadata written on the vector reaches the rule as :marks"))))

(deftest mark-triggers-test
  (testing "a rule can watch a form by the metadata marker written on it"
    (let [r {:id :test/mark :name "n" :description "d" :severity :error :precision :high :cwe "C"
             :mark-triggers #{:allow-subquery}
             :detect (fn [{:keys [node marks]}]
                       {:message (str (first (ast/->str node)) " " (pr-str (sort marks)))})}
          path (write-temp! "(ns t)
(defn a [id] [:in :id ^:allow-subquery {:select [:id] :from [:t] :where [:= :x id]}])
(defn b [id] [:in :id ^{:allow-subquery true :other 1} {:select [:id]}])
(defn c [id] [:in :id ^:allow-raw-sql [:raw id]])")
          findings (engine/analyze {:paths [path] :rules [r]})
          by-row   (into {} (map (juxt :row :message)) findings)]
      (is (= [2 3] (sort (map :row findings))) "only forms carrying the watched marker")
      (is (= "{ (:allow-subquery)" (get by-row 2)) "the node is the marked form with its metadata stripped")
      (is (= "{ (:allow-subquery :other)" (get by-row 3)) "a map-form ^{...} contributes every key"))))

(deftest per-rule-taint-policy-test
  (testing "a rule may ask for the :any-local policy while the scan runs under :call-graph"
    (let [r {:id :test/anylocal :name "n" :description "d" :precision :high :cwe "C"
             :severity {:tainted :error :otherwise :note}
             :triggers '#{clojure.java.shell/sh}
             :taint-policy :any-local
             :detect (fn [{:keys [node] :as ctx}]
                       (let [a (ast/arg node 0)]
                         (when (taint/tainted? ctx a)
                           {:message "local"
                            :tainted? (taint/tainted? (assoc ctx :locals (:boundary-locals ctx)) a)})))}
          path (write-temp! "(ns s (:require [metabase.api.macros :as api.macros] [clojure.java.shell :as shell]))
(defn internal [dir] (shell/sh dir))
(defn fixed [] (shell/sh \"ls\"))
(api.macros/defendpoint :post \"/x\" \"doc\" [_r _q {:keys [dir]}] (shell/sh dir))")
          findings (engine/analyze {:paths [path] :rules [r]})
          by-row   (into {} (map (juxt :row :severity)) findings)]
      (is (= {2 :note 4 :error} by-row)
          "every local counts under the rule's policy; :boundary-locals still tells request taint apart"))))

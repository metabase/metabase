(ns metabase.util.malli.typescript.build-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.typescript.build :as build]))

(set! *warn-on-reflection* true)

(mr/def ::global-ref :string)

(def ^:private fake-state
  {:shadow.build.data/config
   {:entries ['example.entry 'example.empty]}

   :compiler-env
   {:cljs.analyzer/namespaces
    {'example.entry
     {:defs {'exported {:name 'example.entry/exported
                        :schema :string
                        :export true}
             'untyped-export {:name 'example.entry/untyped-export
                              :arglists '([value])
                              :export true}
             'public-only {:name 'example.entry/public-only
                           :schema :string}
             'private-schema {:name 'example.entry/private-schema
                              :schema :string
                              :private true}}}
     'example.empty
     {:defs {}}
     'example.dependency
     {:defs {'dependency-export {:name 'example.dependency/dependency-export
                                 :schema :string
                                 :export true}}}}}})

(deftest ^:parallel output-boundary-test
  (is (= ['example.entry 'example.empty] (build/entry-namespaces fake-state)))
  (is (= #{'exported 'untyped-export}
         (set (keys (build/exported-defs
                     (get-in fake-state
                             [:compiler-env :cljs.analyzer/namespaces 'example.entry :defs]))))))
  (is (= #{'example.entry 'example.empty}
         (set (keys (build/entry-definitions fake-state)))))
  (is (= ["example.empty" "example.entry"]
         (#'build/declaration-module-names
          (build/entry-definitions fake-state))))
  (is (nil? (build/module-reexports ['example.entry 'example.dependency]))))

(deftest ^:parallel analyzer-alias-typescript-expression-test
  (let [state (-> fake-state
                  (assoc-in [:compiler-env :cljs.analyzer/namespaces 'example.entry :requires]
                            {'birds 'clojure.string})
                  (assoc-in [:compiler-env :cljs.analyzer/namespaces 'example.entry :defs 'exported :schema]
                            [:any {:typescript '(birds/join " | " ["string" "number"])}]))
        defs (get (build/entry-definitions state) 'example.entry)
        result (#'build/ts-content 'example.entry defs #{} #{} false)]
    (is (str/includes? (:content result) "export const exported: string | number;"))))

(deftest ^:parallel inline-registries-stay-local-test
  (let [defs {'value {:name 'example.entry/value
                      :schema [:schema
                               {:registry {::local-ref
                                           [:map [:nested [:ref ::global-ref]]]}}
                               [:ref ::local-ref]]}}
        shared-refs (#'build/collect-refs-from-defs 'example.entry defs)
        {:keys [content]} (#'build/ts-content
                           'example.entry defs shared-refs shared-refs true)]
    (is (= #{::global-ref} shared-refs))
    (is (re-find #"type Metabase_Util_Malli_Typescript_BuildTest_LocalRef" content))
    (is (re-find #"Shared.Metabase_Util_Malli_Typescript_BuildTest_GlobalRef" content))
    (is (not (re-find #"Shared.Metabase_Util_Malli_Typescript_BuildTest_LocalRef" content)))))

(deftest ^:parallel camel-helper-qualification-test
  (testing "closed camelCase maps emit Shared.Camel<...> when shared module exists without corrupting string literals"
    (let [defs {'transformed {:name 'example.entry/transformed
                              :schema [:any {:ts/object-of [:map {:closed true} ["display-name" :string]]
                                             :ts/key-transform :camelCase}]}
                'literal {:name 'example.entry/literal
                          :schema [:= "Camel<not-a-helper>"]}}
          {:keys [content camel-used?]} (#'build/ts-content
                                         'example.entry defs #{::global-ref} #{} true)]
      (is (true? camel-used?))
      (is (str/includes? content "import type * as Shared from './metabase.lib.shared';"))
      (is (str/includes? content "Shared.Camel<"))
      (is (str/includes? content "\"Camel<not-a-helper>\""))
      (is (not (str/includes? content "Shared.Camel<not-a-helper>")))))
  (testing "string literal containing Camel< does not trigger Camel helper import when no key-transform AST node is present"
    (let [defs {'literal {:name 'example.entry/literal
                          :schema [:= "Camel<not-a-helper>"]}}
          {:keys [content camel-used?]} (#'build/ts-content
                                         'example.entry defs #{::global-ref} #{} true)]
      (is (false? camel-used?))
      (is (not (str/includes? content "import type * as Shared")))
      (is (str/includes? content "export const literal: \"Camel<not-a-helper>\";")))))

(deftest ^:parallel shared-alias-diagnostics-test
  (let [result (#'build/generate-shared-types-result #{::missing-ref} false)]
    (is (re-find #"export type .*MissingRef = unknown;" (:content result)))
    (is (some #(= :unresolved-schema-ref (:type %))
              (:diagnostics result)))))

(deftest ^:parallel conflicting-inline-registry-definitions-test
  (let [defs {'first {:name 'example.entry/first
                      :schema [:schema {:registry {::local-ref :string}} ::local-ref]}
              'second {:name 'example.entry/second
                       :schema [:schema {:registry {::local-ref :int}} ::local-ref]}}
        {:keys [content diagnostics]} (#'build/ts-content 'example.entry defs #{} #{} false)]
    (is (re-find #"type .*LocalRef = unknown;" content))
    (is (= 1 (count (filter #(= :conflicting-inline-registry-definition (:type %))
                            diagnostics))))))

(deftest ^:parallel identical-inline-registry-definitions-test
  (let [defs {'first {:name 'example.entry/first
                      :schema [:schema {:registry {::local-ref :string}} ::local-ref]}
              'second {:name 'example.entry/second
                       :schema [:schema {:registry {::local-ref :string}} ::local-ref]}}
        {:keys [content diagnostics]} (#'build/ts-content 'example.entry defs #{} #{} false)]
    (is (re-find #"type .*LocalRef = string;" content))
    (is (not-any? #(= :conflicting-inline-registry-definition (:type %)) diagnostics))))

(deftest ^:parallel registry-namespaces-load-on-demand-test
  (let [factory (ns-resolve 'metabase.util.malli.typescript.build 'registry-schema-resolver)]
    (is (some? factory))
    (when factory
      (let [attempts (atom [])
            resolver (factory
                      (fn [schema-keyword]
                        (cond
                          (= schema-keyword ::global-ref)
                          :string

                          (= schema-keyword :example.parent/schema)
                          (if (some #(= 'example.child %) @attempts)
                            [:vector :int]
                            (throw (ex-info ":malli.core/invalid-schema"
                                            {:type :malli.core/invalid-schema
                                             :data {:schema :example.child/leaf}})))))
                      (fn [ns-sym]
                        (swap! attempts conj ns-sym)
                        true))]
        (is (= :string (resolver ::global-ref)))
        (is (empty? @attempts))
        (is (= [:vector :int] (resolver :example.parent/schema)))
        (is (= ['example.child] @attempts))
        (is (nil? (resolver :example.missing/schema)))
        (is (nil? (resolver :example.missing/other)))
        (is (= ['example.child 'example.missing] @attempts))))))

(deftest ^:parallel registry-namespace-load-failures-remain-retryable-test
  (let [factory (ns-resolve 'metabase.util.malli.typescript.build 'registry-schema-resolver)
        loaded? (atom false)
        attempts (atom 0)
        resolver (factory
                  (fn [schema-keyword]
                    (when (and @loaded? (= schema-keyword :example.retry/schema))
                      :string))
                  (fn [_]
                    (let [attempt (swap! attempts inc)]
                      (cond
                        (= attempt 1) false
                        (= attempt 2) (throw (ex-info "transient load failure" {}))
                        (= attempt 3) (do (reset! loaded? true) true)))))]
    (is (nil? (resolver :example.retry/schema)))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"transient load failure"
                          (resolver :example.retry/schema)))
    (is (= :string (resolver :example.retry/schema)))
    (is (= :string (resolver :example.retry/schema)))
    (is (= 3 @attempts))))

(deftest ^:parallel stale-declaration-cleanup-test
  (let [directory (.toFile (java.nio.file.Files/createTempDirectory
                            "cljs-dts-test"
                            (make-array java.nio.file.attribute.FileAttribute 0)))
        old-declaration (java.io.File. directory "old.module.d.ts")
        current-declaration (java.io.File. directory "current.module.d.ts")
        shared-declaration (java.io.File. directory "metabase.lib.shared.d.ts")
        runtime-file (java.io.File. directory "old.module.js")
        unrelated-file (java.io.File. directory "unrelated.d.ts")]
    (doseq [file [old-declaration current-declaration shared-declaration runtime-file unrelated-file]]
      (spit file "content"))
    (let [cleanup (ns-resolve 'metabase.util.malli.typescript.build 'cleanup-stale-declarations!)]
      (is (some? cleanup))
      (when cleanup
        (cleanup directory ["old.module" "current.module"] ["current.module"] false)))
    (is (not (.exists old-declaration)))
    (is (.exists current-declaration))
    (is (not (.exists shared-declaration)))
    (is (.exists runtime-file))
    (is (.exists unrelated-file))))

(deftest ^:parallel produce-dts-test
  (let [directory (.toFile (java.nio.file.Files/createTempDirectory
                            "cljs-dts-produce-test"
                            (make-array java.nio.file.attribute.FileAttribute 0)))
        output-file (fn [_state ^String filename] (java.io.File. directory filename))
        manifest (java.io.File. directory "cljs-dts-modules.txt")
        old-declaration (java.io.File. directory "old.module.d.ts")
        unrelated-declaration (java.io.File. directory "unrelated.d.ts")
        state (assoc-in fake-state
                        [:compiler-env :cljs.analyzer/namespaces 'example.entry :defs 'exported :schema]
                        ::global-ref)]
    (spit manifest "old.module\n")
    (spit old-declaration "old")
    (spit unrelated-declaration "unrelated")
    (binding [build/*output-file* output-file]
      (is (= state (build/produce-dts state))))
    (is (= #{"example.empty" "example.entry"}
           (set (str/split-lines (slurp manifest)))))
    (is (re-find #"Shared\.Metabase_Util_Malli_Typescript_BuildTest_GlobalRef"
                 (slurp (java.io.File. directory "example.entry.d.ts"))))
    (is (= "export {};" (slurp (java.io.File. directory "example.empty.d.ts"))))
    (is (re-find #"reachable from generated declarations"
                 (slurp (java.io.File. directory "metabase.lib.shared.d.ts"))))
    (is (not (.exists old-declaration)))
    (is (.exists unrelated-declaration))
    (let [next-state (assoc-in state
                               [:compiler-env :cljs.analyzer/namespaces 'example.entry :defs 'exported :schema]
                               :int)]
      (binding [build/*output-file* output-file]
        (is (= next-state (build/produce-dts next-state))))
      (is (re-find #"export const exported: number;"
                   (slurp (java.io.File. directory "example.entry.d.ts"))))
      (is (not (.exists (java.io.File. directory "metabase.lib.shared.d.ts")))))))

(deftest ^:parallel produce-dts-computes-before-writing-test
  (let [directory (.toFile (java.nio.file.Files/createTempDirectory
                            "cljs-dts-failure-test"
                            (make-array java.nio.file.attribute.FileAttribute 0)))
        output-file (fn [_state ^String filename] (java.io.File. directory filename))
        manifest (java.io.File. directory "cljs-dts-modules.txt")
        shared-declaration (java.io.File. directory "metabase.lib.shared.d.ts")
        entry-declaration (java.io.File. directory "example.entry.d.ts")
        state (assoc-in fake-state
                        [:compiler-env :cljs.analyzer/namespaces 'example.entry :defs 'exported :schema]
                        ::global-ref)]
    (spit manifest "previous.module\n")
    (spit shared-declaration "previous shared")
    (spit entry-declaration "previous entry")
    (binding [build/*output-file* output-file
              build/*ts-content* (fn [& _]
                                   (throw (ex-info "generation failed" {})))]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"generation failed"
                            (build/produce-dts state))))
    (is (= "previous.module\n" (slurp manifest)))
    (is (= "previous shared" (slurp shared-declaration)))
    (is (= "previous entry" (slurp entry-declaration)))))

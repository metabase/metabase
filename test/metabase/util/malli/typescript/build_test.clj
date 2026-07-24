(ns metabase.util.malli.typescript.build-test
  (:require
   [cljs.analyzer :as ana]
   [clojure.test :refer :all]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.typescript.build :as build]
   [shadow.build.data :as b.data]))

(mr/def ::global-ref :string)

(def ^:private fake-state
  {::b.data/config
   {:entries ['example.entry]}

   :compiler-env
   {::ana/namespaces
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
     'example.dependency
     {:defs {'dependency-export {:name 'example.dependency/dependency-export
                                 :schema :string
                                 :export true}}}}}})

(deftest ^:parallel output-boundary-test
  (is (= ['example.entry] (build/entry-namespaces fake-state)))
  (is (= #{'exported 'untyped-export}
         (set (keys (build/exported-defs
                     (get-in fake-state
                             [:compiler-env ::ana/namespaces 'example.entry :defs]))))))
  (is (= #{'example.entry}
         (set (keys (build/entry-definitions fake-state)))))
  (is (= ["example.entry"]
         (#'build/declaration-module-names
          (build/entry-definitions fake-state))))
  (is (nil? (build/module-reexports ['example.entry 'example.dependency]))))

(deftest inline-registries-stay-local-test
  (let [defs {'value {:name 'example.entry/value
                      :schema [:schema
                               {:registry {::local-ref
                                           [:map [:nested [:ref ::global-ref]]]}}
                               [:ref ::local-ref]]}}
        shared-refs (#'build/collect-refs-from-defs 'example.entry defs)
        {:keys [content]} (#'build/ts-content
                           'example.entry defs shared-refs shared-refs)]
    (is (= #{::global-ref} shared-refs))
    (is (re-find #"type Metabase_Util_Malli_Typescript_BuildTest_LocalRef" content))
    (is (re-find #"Shared.Metabase_Util_Malli_Typescript_BuildTest_GlobalRef" content))
    (is (not (re-find #"Shared.Metabase_Util_Malli_Typescript_BuildTest_LocalRef" content)))))

(deftest shared-alias-diagnostics-test
  (let [result (#'build/generate-shared-types-result #{::missing-ref})]
    (is (some #(= :unresolved-schema-ref (:type %))
              (:diagnostics result)))))

(ns metabase.util.malli.typescript.fixture
  (:require
   [clojure.string :as str]
   [metabase.lib.card]
   [metabase.util.malli :as mu]))

(def ^{:export true
       :schema [:any {:typescript (str/join " | " (map pr-str ["bird" "heron"]))}]}
  bird-name
  "A constant whose inline TypeScript type is computed during generation."
  "bird")

(mu/defn ^:export bird-names :- [:any {:ts/array-of [:fn {:typescript (str/join " | " (map pr-str ["bird" "heron"]))}
                                                     (fn [bird-name] (contains? #{"bird" "heron"} bird-name))]}]
  "Return names with a generation-time expression in their element schema."
  []
  #js ["bird" "heron"])

(defn ^{:export true
        :schema [:=> [:cat {:ts/key-transform :camelCase} :any]
                 [:boolean {:ts/predicate-of :string}]]}
  string-after-transform?
  "Return whether the value is a string."
  [value]
  (string? value))

(defn ^{:export true
        :schema [:=> [:cat {:ts/key-transform :camelCase}
                      [:any {:ts/object-of [:map {:closed true} [:display-name :string]]}]]
                 [:boolean {:ts/predicate-of [:any {:ts/object-of [:map {:closed true} [:displayName [:= "bird"]]]}]}]]}
  bird-after-transform?
  "Return whether the native object's displayName is bird."
  [value]
  (= "bird" (.-displayName value)))

(defn ^{:export true
        :schema [:=> [:cat [:alt [:cat :string :int] [:cat :int :string]]] :boolean]}
  paired-arguments [_first-value _second-value] true)

(defn ^{:export true
        :schema [:=> [:cat]
                 [:=> [:cat [:alt [:cat :string :int] [:cat :int :string]]] :boolean]]}
  paired-callback [] (fn [_first-value _second-value] true))

(defn ^{:export true
        :schema [:=> [:cat [:maybe [:schema {:registry {::type-info [:map {:closed true}
                                                                     [:base-type {:optional true} :string]]}}
                                    ::type-info]]]
                 :boolean]}
  type-info-category? [_value] false)

(defn ^{:export true
        :schema [:=>
                 [:cat
                  [:schema
                   {:registry
                    {::nested [:map {:closed true} [:value [:maybe :string]]]
                     ::recursive [:map {:closed true} [:child [:maybe [:ref ::recursive]]]]
                     ::input [:map {:closed true}
                              [:nested [:ref ::nested]]
                              [:recursive [:ref ::recursive]]]}}
                   ::input]]
                 :boolean]}
  accepts-nested [_value] true)

(defn ^{:export true
        :schema [:=> [:cat]
                 [:schema {:registry {::nested [:map {:closed true} [:value [:maybe :string]]]}}
                  ::nested]]}
  nested-output [] {:value nil})

(defn ^{:export true
        :schema [:=>
                 [:cat]
                 [:schema
                  {:registry
                   {::safe-one [:map {:closed true} [:value :string]]
                    ::safe-two [:map {:closed true} [:value :string]]
                    ::nullable-one [:maybe [:map {:closed true} [:value :string]]]
                    ::nullable-two [:maybe [:map {:closed true} [:value :string]]]
                    ::tuple-one [:tuple [:maybe :string] :int]
                    ::tuple-two [:tuple [:maybe :string] :int]
                    ::kind-one [:map {:closed true} ["__kind" [:= "runtime"]] [:value :string]]
                    ::kind-two [:map {:closed true} ["__kind" [:= "runtime"]] [:value :string]]
                    ::primitive-one :string
                    ::primitive-two :string}}
                  [:tuple ::safe-one ::safe-two ::nullable-one ::nullable-two
                   ::tuple-one ::tuple-two ::kind-one ::kind-two
                   ::primitive-one ::primitive-two]]]}
  fixture-aliases []
  [{:value "one"} {:value "two"} nil nil [nil 1] [nil 1]
   {"__kind" "runtime", :value "one"} {"__kind" "runtime", :value "two"}
   "one" "two"])

(defn ^{:export true
        :schema [:=>
                 [:cat]
                 [:schema
                  {:registry
                   {::context-one [:map {:closed true} [:value [:maybe :string]]]
                    ::context-two [:map {:closed true} [:value [:maybe :string]]]}}
                  [:=> [:cat [:ref ::context-one]] [:ref ::context-one]]]]}
  contextual-identity [] identity)

(defn ^{:export true
        :schema [:=>
                 [:cat]
                 [:schema {:registry {::context-two [:map {:closed true}
                                                     [:value [:maybe :string]]]}}
                  ::context-two]]}
  context-two [] {:value nil})

(defn ^{:export true
        :schema [:=>
                 [:cat]
                 [:schema
                  {:registry
                   {::local-global [:map {:closed true}
                                    [:global [:ref :metabase.lib.card/maybe-columns]]]}}
                  [:=> [:cat [:ref ::local-global]] :boolean]]]}
  local-global-callback [] (constantly true))

(defn ^{:export true
        :schema [:schema
                 {:registry
                  {::object-wrapper [:map {:closed true} [:value [:maybe :string]]]
                   ::array-wrapper [:vector [:maybe :string]]
                   ::ref-wrapper [:any {:ts/object-of
                                        [:schema
                                         {:registry {::inner [:maybe :string]}}
                                         [:map {:closed true} [:value [:ref ::inner]]]]}]}}
                 [:=>
                  [:cat
                   [:map {:closed true} [:value [:maybe :string]]]
                   [:ref ::object-wrapper]
                   [:vector [:maybe :string]]
                   [:ref ::array-wrapper]
                   [:any {:ts/object-of [:map {:closed true} [:value [:maybe :string]]]}]
                   [:ref ::ref-wrapper]]
                  :boolean]]}
  accepts-wrapper-parity
  [_inline-object _extracted-object _inline-array _extracted-array _inline-ref-wrapper _extracted-ref-wrapper]
  true)

(defn ^{:export true
        :schema [:=> [:cat] [:map-of [:or [:= :one] [:enum :two]] :int]]}
  finite-keys [] {:one 1})

(defn ^{:export true
        :schema [:=> [:cat]
                 [:any {:ts/object-of [:map {:closed true} ["display-name" :string]]
                        :ts/key-transform :camelCase}]]}
  readonly-camel [] #js {"display-name" "fixture"})

(ns metabase.api.macros.defendpoint.tools-manifest-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.macros.defendpoint.tools-manifest :as tools-manifest]
   [metabase.util.malli.registry :as mr])
  (:import (clojure.lang ExceptionInfo)))

(deftest ^:parallel assert-optional-fields-nullable!-test
  (testing "no throw when every :optional field is also nullable via [:maybe ...]"
    (is (some? (tools-manifest/assert-optional-fields-nullable!
                [:map [:foo {:optional true} [:maybe :string]]] "ok-tool"))))
  (testing "no throw when there are no :optional fields"
    (is (some? (tools-manifest/assert-optional-fields-nullable!
                [:map [:foo :string] [:bar :int]] "no-optional-tool")))
    (is (nil? (tools-manifest/assert-optional-fields-nullable! nil "nil-schema-tool"))))
  (testing "throws when an :optional field rejects nil"
    (let [ex (try (tools-manifest/assert-optional-fields-nullable!
                   [:map [:foo {:optional true} :string]] "bad-tool")
                  (catch ExceptionInfo e e))]
      (is (instance? ExceptionInfo ex))
      (is (= "bad-tool" (-> ex ex-data :tool)))
      (is (= :foo (-> ex ex-data :field)))))
  (testing "walks composites — `:or` of maps catches the offender inside a branch"
    (let [schema [:or
                  [:map [:foo :string]]
                  [:map [:bar {:optional true} :int]]]
          ex    (try (tools-manifest/assert-optional-fields-nullable! schema "or-tool")
                     (catch ExceptionInfo e e))]
      (is (instance? ExceptionInfo ex))
      (is (= :bar (-> ex ex-data :field)))))
  (testing "walks into nested map properties"
    (let [schema [:map
                  [:outer [:map
                           [:inner {:optional true} :int]]]]
          ex    (try (tools-manifest/assert-optional-fields-nullable! schema "nested-tool")
                     (catch ExceptionInfo e e))]
      (is (instance? ExceptionInfo ex))
      (is (= :inner (-> ex ex-data :field))))))

(deftest ^:parallel prefer-tool-descriptions-test
  (testing "tool/description replaces description in JSON schema output"
    (let [jss (tools-manifest/malli->json-schema
               [:map [:id [:int {:description      "Internal ID"
                                 :tool/description "The ID of the saved question"}]]])]
      (is (= "The ID of the saved question"
             (get-in jss [:properties :id :description])))))
  (testing "schemas without tool/description keep original description"
    (let [jss (tools-manifest/malli->json-schema
               [:map [:id [:int {:description "Internal ID"}]]])]
      (is (= "Internal ID"
             (get-in jss [:properties :id :description]))))))

(mr/def ::ref-target-a [:enum "x" "y"])
(mr/def ::ref-target-b [:map [:nested ::ref-target-a]])

(deftest ^:parallel inline-malli-refs-test
  (testing "registered schema refs are inlined in JSON Schema output"
    (let [jss (tools-manifest/malli->json-schema [:map [:nested ::ref-target-a]])]
      (is (= {:type "object"
              :properties {:nested {:type "string" :enum ["x" "y"]}}
              :required [:nested]}
             jss))
      (is (not (contains? jss :definitions)))
      (is (not (re-find #"\$ref" (pr-str jss))))))
  (testing "nested registered refs are fully inlined"
    (let [jss (tools-manifest/malli->json-schema [:map [:item ::ref-target-b]])]
      (is (= {:type "string" :enum ["x" "y"]}
             (get-in jss [:properties :item :properties :nested])))
      (is (not (re-find #"\$ref" (pr-str jss)))))))

(deftest ^:parallel and-or-flattening-test
  (testing ":and produces flat object (no allOf)"
    (let [jss (tools-manifest/malli->json-schema
               [:and [:map [:a :int]] [:map [:b :string]]])]
      (is (= "object" (:type jss)))
      (is (= #{:a :b} (set (keys (:properties jss)))))
      (is (not (contains? jss :allOf)))))
  (testing ":or produces flat object with no required (no anyOf)"
    (let [jss (tools-manifest/malli->json-schema
               [:or [:map [:a :int]] [:map [:b :string]]])]
      (is (= "object" (:type jss)))
      (is (= #{:a :b} (set (keys (:properties jss)))))
      (is (not (contains? jss :anyOf)))
      (is (nil? (:required jss))
          "all entries should be optional after :or → :merge")))
  (testing ":and with encode map pattern produces flat object"
    (let [jss (tools-manifest/malli->json-schema
               [:and [:map [:x :int] [:y {:optional true} :string]]
                [:map {:encode/foo identity}]])]
      (is (= "object" (:type jss)))
      (is (= #{:x :y} (set (keys (:properties jss)))))
      (is (= [:x] (:required jss))))))

(deftest ^:parallel deeply-nested-root-flattening-test
  (testing ":and wrapping :and is fully flattened"
    (let [jss (tools-manifest/malli->json-schema
               [:and
                [:and [:map [:a :int]] [:map [:b :string]]]
                [:map [:c :boolean]]])]
      (is (= "object" (:type jss)))
      (is (= #{:a :b :c} (set (keys (:properties jss)))))
      (is (not (contains? jss :allOf)))))
  (testing ":or wrapping :or is fully flattened"
    (let [jss (tools-manifest/malli->json-schema
               [:or
                [:or [:map [:a :int]] [:map [:b :string]]]
                [:map [:c :boolean]]])]
      (is (= "object" (:type jss)))
      (is (= #{:a :b :c} (set (keys (:properties jss)))))
      (is (not (contains? jss :anyOf)))
      (is (nil? (:required jss))
          "all entries optional after :or flattening")))
  (testing ":and wrapping :or flattens both layers"
    (let [jss (tools-manifest/malli->json-schema
               [:and
                [:or [:map [:a :int]] [:map [:b :string]]]
                [:map [:c :boolean]]])]
      (is (= "object" (:type jss)))
      (is (= #{:a :b :c} (set (keys (:properties jss)))))
      (is (not (contains? jss :allOf)))
      (is (not (contains? jss :anyOf)))))
  (testing ":or wrapping :and — flattens :and children"
    (let [jss (tools-manifest/malli->json-schema
               [:or
                [:and [:map [:a :int]] [:map [:b :string]]]
                [:map [:c :boolean]]])]
      (is (= "object" (:type jss)))
      (is (= #{:a :b :c} (set (keys (:properties jss)))))
      (is (not (contains? jss :anyOf)))
      (is (not (contains? jss :allOf)))
      (is (nil? (:required jss))
          "all entries optional — :or makes everything optional")))
  (testing "triple-nested :and → :or → :and fully flattens"
    (let [jss (tools-manifest/malli->json-schema
               [:and
                [:or
                 [:and [:map [:a :int]] [:map [:b :string]]]
                 [:map [:c :boolean]]]
                [:map [:d :keyword]]])]
      (is (= "object" (:type jss)))
      (is (= #{:a :b :c :d} (set (keys (:properties jss)))))
      (is (not (contains? jss :allOf)))
      (is (not (contains? jss :anyOf)))))
  (testing ":or wrapping :or wrapping :and — flattening through multiple layers"
    (let [jss (tools-manifest/malli->json-schema
               [:or
                [:or
                 [:and [:map [:a :int]] [:map [:b :string]]]
                 [:map [:c :boolean]]]
                [:map [:d :keyword]]])]
      (is (= "object" (:type jss)))
      (is (= #{:a :b :c :d} (set (keys (:properties jss)))))
      (is (not (contains? jss :anyOf)))
      (is (nil? (:required jss))))))

(deftest ^:parallel nested-composite-within-properties-preserved-test
  (testing ":or inside a property value is preserved as anyOf"
    (let [jss (tools-manifest/malli->json-schema
               [:map [:x [:or :int :string]]])]
      (is (= "object" (:type jss)))
      (is (contains? (get-in jss [:properties :x]) :anyOf)
          "nested :or should remain as anyOf inside a property")))
  (testing ":and inside a property value is preserved as allOf"
    (let [jss (tools-manifest/malli->json-schema
               [:map [:x [:and :int [:fn pos?]]]])]
      (is (= "object" (:type jss)))
      ;; :and with non-map children stays as allOf or gets simplified by malli,
      ;; but the root schema should still be a flat object
      (is (= [:x] (:required jss)))))
  (testing "root :or flattened but nested :or within property preserved"
    (let [jss (tools-manifest/malli->json-schema
               [:or
                [:map [:a :int] [:nested [:or :string :boolean]]]
                [:map [:b :keyword]]])]
      (is (= "object" (:type jss))
          "root :or should be flattened to object")
      (is (= #{:a :b :nested} (set (keys (:properties jss)))))
      (is (not (contains? jss :anyOf))
          "root-level anyOf should be gone")
      (is (contains? (get-in jss [:properties :nested]) :anyOf)
          "nested :or within a property should be preserved as anyOf")))
  (testing "root :and flattened but nested :or within property preserved"
    (let [jss (tools-manifest/malli->json-schema
               [:and
                [:map [:a :int] [:choice [:or :string :boolean]]]
                [:map [:b :keyword]]])]
      (is (= "object" (:type jss)))
      (is (= #{:a :b :choice} (set (keys (:properties jss)))))
      (is (not (contains? jss :allOf)))
      (is (contains? (get-in jss [:properties :choice]) :anyOf)
          "nested :or within property preserved even when root :and is flattened"))))

(deftest ^:parallel multi-root-flattening-test
  (testing ":multi at root is flattened with all entries optional"
    (let [jss (tools-manifest/malli->json-schema
               [:multi {:dispatch :type}
                [:a [:map [:type [:= :a]] [:a-field :int]]]
                [:b [:map [:type [:= :b]] [:b-field :string]]]])]
      (is (= "object" (:type jss)))
      (is (= #{:type :a-field :b-field} (set (keys (:properties jss)))))
      (is (nil? (:required jss))
          "all entries optional after :multi → union")))
  (testing ":and wrapping :multi flattens both layers"
    (let [jss (tools-manifest/malli->json-schema
               [:and
                [:multi {:dispatch :type}
                 [:a [:map [:type [:= :a]] [:x :int]]]
                 [:b [:map [:type [:= :b]] [:y :string]]]]
                [:map [:z :boolean]]])]
      (is (= "object" (:type jss)))
      (is (= #{:type :x :y :z} (set (keys (:properties jss)))))
      (is (not (contains? jss :allOf))))))

(deftest ^:parallel refs-are-inlined-test
  (testing "malli->json-schema with :or of mixed types preserves anyOf but inlines refs"
    (let [jss (tools-manifest/malli->json-schema [:or ::ref-target-a ::ref-target-b])]
      (is (contains? jss :anyOf)
          "non-map :or branches stay as anyOf")
      (is (not (re-find #"\$ref" (pr-str jss)))))))

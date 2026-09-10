(ns metabase.api.macros.defendpoint.closed-schemas-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [metabase.api.macros.defendpoint.closed-schemas :as closed-schemas]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(mr/def ::closed
  [:map {:closed true} [:a :int]])

(mr/def ::open
  [:map [:a :int]])

(mr/def ::nested
  [:map {:closed true}
   [:inner ::open]])

(mr/def ::recursive
  [:map {:closed true}
   [:children {:optional true} [:sequential [:ref ::recursive]]]
   [:extra    {:optional true} ::open]])

(defn- kinds [schema]
  (mapv :kind (closed-schemas/findings schema)))

(deftest ^:parallel closed-maps-and-the-deliberately-open-schemas-pass-test
  (are [schema] (empty? (kinds schema))
    [:map {:closed true} [:a :int]]
    ::closed
    [:ref ::closed]
    [:maybe [:sequential ::closed]]
    [:merge ::closed [:map {:closed true} [:b :int]]]
    [:multi {:dispatch :type}
     [:a [:map {:closed true} [:type [:= :a]]]]
     [:b [:map {:closed true} [:type [:= :b]]]]]
    ms/DatabaseDetails
    ms/VisualizationSettings
    ms/DatabaseSettings
    ms/OpaqueJSONObject
    (ms/string-keyed-map :string)
    [:map-of :string :int]
    [:map-of ::closed :int]))

(deftest ^:parallel open-maps-are-found-test
  (are [schema] (= [:open-map] (kinds schema))
    [:map [:a :int]]
    [:map {:closed false} [:a :int]]
    [:map]
    :map
    [:maybe :map]
    ::open
    [:ref ::open]
    [:sequential ::open]
    ::nested
    [:map {:closed true} [:a ::open]]
    [:or :int ::open]
    [:multi {:dispatch :type} [:a [:map [:type [:= :a]]]]]))

(deftest ^:parallel keyword-keyed-map-of-is-found-test
  (are [schema] (= [:keyword-keyed-map-of] (kinds schema))
    [:map-of :keyword :int]
    [:map-of :some :string]
    [:map {:closed true} [:bag [:map-of :keyword :string]]]))

(deftest ^:parallel any-is-found-test
  (are [schema] (= [:any] (kinds schema))
    :any
    any?
    [:maybe :any]
    [:map {:closed true} [:value :any]]
    [:map-of :string :any]
    (ms/string-keyed-map :any)))

(deftest ^:parallel a-default-entry-declares-the-other-keys-test
  (testing "a map with a `::mc/default` entry is not open: the default schema says what the other keys are"
    (is (empty? (kinds [:map [:a :int] [::mc/default (ms/string-keyed-map :string)]])))
    (testing "but that schema is checked like any other"
      (is (= [:any] (kinds [:map [:a :int] [::mc/default [:map-of :string :any]]]))))))

(deftest ^:parallel any-as-a-conjunct-is-a-carrier-test
  (testing "an `:any` conjunct constrains nothing the other conjuncts do not already constrain"
    (are [schema] (empty? (kinds schema))
      [:and [:map {:closed true} [:a :int]] :any]
      [:and [:map {:closed true} [:a :int]] [:schema {:decode/normalize identity} :any]]
      [:and :int [:multi {:dispatch pos?} [true :int] [false :any]]]))
  (testing "a map entry inside a conjunct is a hole again"
    (is (= [:any] (kinds [:and [:map {:closed true} [:a :any]] [:fn map?]])))))

(deftest ^:parallel internal-keys-the-api-strips-are-skipped-test
  (let [strips [:map {:closed true, :decode/api lib.schema.common/remove-internal-keys}
                [:a :int]
                [:qp/internal {:optional true} [:map [:anything :any]]]]]
    (is (empty? (kinds strips)))
    (testing "only when the map's API decoder really strips them"
      (is (= [:open-map :any] (kinds (assoc strips 1 {:closed true})))))))

(deftest ^:parallel every-finding-carries-its-trail-test
  (is (= [{:kind :open-map, :trail [::nested :inner ::open]}]
         (map #(select-keys % [:kind :trail]) (closed-schemas/findings ::nested)))))

(deftest ^:parallel recursive-schemas-terminate-test
  (is (= [:open-map] (kinds ::recursive))))

(deftest ^:parallel registry-keys-are-walked-once-test
  (let [visited (atom #{})]
    (is (= [:open-map] (mapv :kind (closed-schemas/findings ::nested visited))))
    (is (contains? @visited ::nested))
    (testing "a second walk through the same visited set skips the keys it already saw"
      (is (empty? (closed-schemas/findings ::nested visited))))))

(deftest check-throws-with-the-offending-schemas-test
  (testing "off in prod, and off when disabled"
    (binding [closed-schemas/*enabled* false]
      (is (nil? (closed-schemas/check! :body [:map [:a :int]])))))
  (binding [closed-schemas/*enabled* true]
    (is (nil? (closed-schemas/check! :body [:map {:closed true} [:a :int]])))
    (testing "response schemas are not checked: only a request is stripped"
      (is (nil? (closed-schemas/check! :response [:map [:a :int]]))))
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"The body schema of this endpoint reaches schemas that do not declare their shape"
                          (closed-schemas/check! :body [:map {:closed true} [:bag [:map [:a :int]]]])))))

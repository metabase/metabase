(ns metabase.api.macros.defendpoint.closed-schemas-test
  (:require
   [clojure.test :refer :all]
   [malli.core :as mc]
   [metabase.api.macros :as api.macros]
   [metabase.api.macros.defendpoint.closed-schemas :as closed-schemas]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses.schema]))

(set! *warn-on-reflection* true)

(mr/def ::typed
  [:map [:a :int]])

(mr/def ::open
  [:map {:closed false} [:a :int]])

(mr/def ::nested
  [:map
   [:inner ::open]])

(mr/def ::recursive
  [:map
   [:children {:optional true} [:sequential [:ref ::recursive]]]
   [:extra    {:optional true} ::open]])

(defn- kinds [schema]
  (mapv :kind (closed-schemas/findings schema)))

(deftest ^:parallel stripped-schemas-pass-test
  (are [schema] (empty? (kinds schema))
    [:map [:a :int]]
    [:map {:closed true} [:a :int]]
    :map
    ::typed
    [:ref ::typed]
    [:maybe [:sequential ::typed]]
    [:merge ::typed [:map [:b :int]]]
    [:multi {:dispatch :type}
     [:a [:map [:type [:= :a]]]]
     [:b [:map [:type [:= :b]]]]]
    [:map-of :string :int]
    [:map-of [:enum :a :b] :int]
    (ms/string-keyed-map :string)
    [:enum :type/Text :type/Integer]
    [:fn string?]))

(deftest ^:parallel open-maps-are-found-test
  (are [schema] (= [:open-map] (kinds schema))
    [:map {:closed false} [:a :int]]
    [:maybe [:map {:closed false}]]
    ::open
    [:sequential ::open]
    ::nested
    [:or :int ::open]
    :metabase.warehouses.schema/database.connection-details
    [:multi {:dispatch :type} [:a [:map {:closed false} [:type [:= :a]]]]]))

(deftest ^:parallel keyword-keyed-map-of-is-found-test
  (are [schema] (= [:keyword-keyed-map-of] (kinds schema))
    [:map-of :keyword :int]
    [:map-of :qualified-keyword :int]
    [:map-of [:keyword {:description "a key"}] :int]
    [:map-of [:or :keyword :string] :int]
    [:map-of :some :string]
    [:map [:bag [:map-of :keyword :string]]]))

(deftest ^:parallel values-passing-as-they-arrived-are-found-test
  (are [schema] (= [:any] (kinds schema))
    :any
    any?
    :some
    map?
    vector?
    [:fn map?]
    [:maybe :any]
    [:map [:value :any]]
    [:map [:values [:sequential :any]]]
    [:map-of :string :any]
    (ms/string-keyed-map :any)))

(deftest ^:parallel default-entry-schema-is-walked-test
  (testing "a string-keyed default types the other keys"
    (is (empty? (kinds [:map [:a :int] [::mc/default (ms/string-keyed-map :string)]])))
    (is (empty? (kinds [:map [:a :int] [::mc/default [:map [:b :int]]]]))))
  (testing "a default that lets keywords through stops the map from being stripped"
    (are [default kind] (= [kind] (kinds [:map [:a :int] [::mc/default default]]))
      :any                    :any
      [:map-of :keyword :int] :keyword-keyed-map-of
      [:map-of :string :any]  :any
      [:map {:closed false}]  :open-map)))

(deftest ^:parallel and-is-settled-by-its-declaring-conjunct-test
  (testing "one conjunct that types or strips the value is enough"
    (are [schema] (empty? (kinds schema))
      [:and [:map [:a :int]] :any]
      [:and [:map [:a :int]] [:map [:a :int] [::mc/default :any]]]
      [:and [:map [:a :int]] [:fn map?]]
      [:and [:sequential ::typed] [:cat :any [:* :any]]]
      [:and :int [:multi {:dispatch pos?} [true :int] [false :any]]]))
  (testing "a `:fn` conjunct is a guard and settles nothing"
    (are [schema] (= [:any] (kinds schema))
      [:and :any [:fn :type]]
      [:and [:fn map?] [:fn :type]]
      [:and [:map [:a :any]] [:fn map?]]))
  (testing "an open map stays reported next to a declaring conjunct"
    (is (= [:open-map] (kinds [:and [:map [:a ::open]] [:fn map?]])))))

(deftest ^:parallel findings-match-what-decoder-keeps-test
  (let [value {:a 1, :b 2}]
    (are [schema decoded] (= decoded
                             (api.macros/decode-and-validate-params :body schema value))
      [:map [:a :int]]                                              {:a 1}
      [:map {:closed false} [:a :int]]                              {:a 1, :b 2}
      [:map [:a :int] [::mc/default [:map-of :keyword :int]]]       {:a 1, :b 2}
      [:map [:a :int] [::mc/default [:map-of :string :int]]]        {:a 1, "b" 2}
      [:map-of :keyword :int]                                       {:a 1, :b 2}
      [:and [:map [:a :int]] [:map [:a :int] [::mc/default :any]]]  {:a 1}
      :any                                                          {:a 1, :b 2})))

(deftest ^:parallel stripped-internal-keys-are-skipped-test
  (let [strips [:map {:decode/api lib.schema.common/remove-internal-keys}
                [:a :int]
                [:qp/internal {:optional true} [:map [:anything :any]]]]]
    (is (empty? (kinds strips)))
    (testing "only when the API decoder of the map really strips them"
      (is (= [:any] (kinds (assoc strips 1 {})))))
    (testing "and never the default entry, whose key is not a key at all"
      (is (= [:any] (kinds [:map {:decode/api lib.schema.common/remove-internal-keys}
                            [::mc/default [:map-of :string :any]]]))))))

(deftest ^:parallel every-finding-carries-its-trail-test
  (is (= [{:kind :open-map, :trail [::nested :inner ::open]}]
         (map #(select-keys % [:kind :trail]) (closed-schemas/findings ::nested)))))

(deftest ^:parallel recursive-schemas-terminate-test
  (is (= [:open-map] (kinds ::recursive)))
  (testing "and report the same on every walk"
    (is (= [:open-map] (kinds ::recursive)))))

(deftest check-throws-on-unstripped-schemas-test
  (is (nil? (closed-schemas/check! :body [:map [:a :int]])))
  (testing "an open map is allowed"
    (is (nil? (closed-schemas/check! :body [:map [:bag [:map {:closed false}]]]))))
  (testing "response schemas are not checked: only a request is stripped"
    (is (nil? (closed-schemas/check! :response [:map [:a :any]]))))
  (are [schema] (thrown-with-msg? clojure.lang.ExceptionInfo
                                  #"The body schema of this endpoint reaches schemas the API does not strip"
                                  (closed-schemas/check! :body schema))
    [:map [:bag :any]]
    [:map [:bag [:map-of :keyword :int]]]))

(deftest ^:parallel registered-open-map-keeps-its-error-message-test
  (is (= {:details "nullable Value must be a map."}
         (try
           (api.macros/decode-and-validate-params :body [:map [:details [:maybe :metabase.warehouses.schema/database.connection-details]]] {:details "x"})
           (catch clojure.lang.ExceptionInfo e
             (:errors (ex-data e)))))))

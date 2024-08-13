(ns metabase.xrays.domain-entities.converters-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test.util.js :as test.js]
   [metabase.xrays.domain-entities.converters :as converters]))

(deftest incoming-basics-test
  (testing "simple values are not transformed"
    (is (= identity (converters/incoming number?)))
    (is (= identity (converters/incoming string?)))
    (is (= identity (converters/incoming nil?)))
    (is (= identity (converters/incoming boolean?)))))

(deftest keywords-test
  (testing "plain keywords are transformed without changing their spelling"
    (let [->kw (converters/incoming keyword?)
          kw-> (converters/outgoing keyword?)
          pairs [[:foo "foo"]
                 [:foo-bar "foo-bar"]
                 [:foo_bar "foo_bar"]
                 [:fooBar  "fooBar"]]]
      (doseq [[kw s] pairs]
        (is (= kw (->kw s)))
        (is (= s (kw-> kw)))
        (is (= kw (-> kw kw-> ->kw)))
        (is (= s  (-> s  ->kw kw->))))))

  (testing "qualified keywords are transformed without changing their spelling"
    (let [->kw (converters/incoming :qualified-keyword)
          kw-> (converters/outgoing :qualified-keyword)
          pairs [[:my.ns/foo "my.ns/foo"]
                 [:my.ns/foo-bar "my.ns/foo-bar"]
                 [:my.ns/foo_bar "my.ns/foo_bar"]
                 [:my.ns/fooBar  "my.ns/fooBar"]]]
      (doseq [[kw s] pairs]
        (is (= kw (->kw s)))
        (is (= s (kw-> kw)))
        (is (= kw (-> kw kw-> ->kw)))
        (is (= s  (-> s  ->kw kw->)))))))

(def HalfDeclared
  [:map
   [:declared-camel {:js/prop "declaredCamel"} string?]
   [:declared-snake string?]
   [:declared-kebab {:js/prop "declared-kebab"} string?]])

(def ->half-declared
  (converters/incoming HalfDeclared))

(deftest map-basics-test
  (testing "incoming maps"
    (testing "become CLJS maps"
      (is (map? ((converters/incoming [:map]) #js {}))))

    (testing "have both declared and undeclared keys normalized as :kebab-case-keywords"
      (is (= {:declared-camel   "yes"
              :declared-snake   "also"
              :declared-kebab   "finally"
              :undeclared-camel 7
              :undeclared-snake 8
              :undeclared-kebab 9}
             (->half-declared #js {"declaredCamel"    "yes"
                                   "declared_snake"   "also"
                                   "declared-kebab"   "finally"
                                   "undeclaredCamel"  7
                                   "undeclared_snake" 8
                                   "undeclared-kebab" 9}))))

    (testing "work like maps for their declared keys"
      (let [converted (->half-declared #js {"declaredCamel"  "yes"
                                            "declared_snake" "also"
                                            "declared-kebab" "finally"})]
        (is (= "yes"      (:declared-camel converted)))
        (is (= "also"     (:declared-snake converted)))
        (is (= "finally"  (:declared-kebab converted)))
        (is (= :not-found (:does-not-exist converted :not-found)))
        (is (= "yes"      (converted :declared-camel)))
        (is (= "also"     (converted :declared-snake)))
        (is (= "finally"  (converted :declared-kebab)))
        (is (= :not-found (converted :does-not-exist :not-found)))

        (is (= #{:declared-camel :declared-snake :declared-kebab}
               (set (keys converted))))
        (is (= #{"yes" "also" "finally"}
               (set (vals converted))))
        (is (= 3 (count converted)))
        (let [native {:declared-camel "yes"
                      :declared-snake "also"
                      :declared-kebab "finally"}]
          (is (= native converted))
          (is (= converted native))))))

  (testing "outgoing maps"
    (let [input #js {"declaredCamel"    "yes"
                     "declared_snake"   "also"
                     "declared-kebab"   "finally"
                     "undeclaredCamel"  7
                     "undeclared_snake" 8
                     "undeclared-kebab" 9}
          obj   (->half-declared input)]

      (testing "are converted per the schema by :js/prop; defaulting to snake_case"
        (let [adjusted (assoc obj :declared-camel "no")]
          (is (not (identical? obj adjusted)))
          (is (test.js/= #js {"declaredCamel"    "no"
                              "declared_snake"   "also"
                              "declared-kebab"   "finally"
                              "undeclared_camel" 7
                              "undeclared_snake" 8
                              "undeclared_kebab" 9}
                         ((converters/outgoing HalfDeclared) adjusted))))))))

(def Child
  [:map [:inner-value {:js/prop "innerValue"} string?]])

(def Parent
  [:map [:child Child]])

(def Grandparent
  [:map [:parent Parent]])

(deftest nesting-test
  (testing "deeply nested maps"
    (let [input     #js {"parent" #js {"child" #js {"innerValue" "asdf"}}}
          exp-clj   {:parent {:child {:inner-value "asdf"}}}
          converted ((converters/incoming Grandparent) input)]
      (is (= exp-clj converted))
      (is (test.js/= input ((converters/outgoing Grandparent) converted)))))

  (testing "nesting kitchen sink"
    (let [schema    [:map
                     [:foo-bar {:js/prop "fooBar"}
                      [:vector
                       [:map-of
                        keyword?
                        [:sequential
                         [:map
                          [:kebab-case {:js/prop "kebab-case"} :qualified-keyword]
                          ;; TODO: Can we get keyword enums?
                          ;; Not out of the box, but probably with a :js/something override the decoders
                          ;; can be taught to check for.
                          [:snake-case [:enum "abc" "def"]]
                          [:camel-case {:js/prop "camelCase"} number?]]]]]]]
          ->sink    (converters/incoming schema)
          sink->    (converters/outgoing schema)
          input     #js {"fooBar"
                         #js [#js {"first_chunk"
                                   #js [#js {"kebab-case" "becomes/keyword"
                                             "snake_case" "def"
                                             "camelCase"  7}
                                        #js {"kebab-case" "a/plain-keyword"
                                             "snake_case" "abc"
                                             "camelCase"  -7}
                                        #js {"kebab-case" "a/snake_keyword"
                                             "snake_case" "def"
                                             "camelCase"  0}]

                                   "emptyChunk" #js []
                                   "another-chunk" #js [#js {"kebab-case" "a/camelKeyword"
                                                             "snake_case" "abc"
                                                             "camelCase"  -2}]}
                              #js {"cousin_chunk"
                                   #js [#js {"kebab-case" "namespaced.with/all-punctuation_used"
                                             "snake_case" "abc"
                                             "camelCase"  2}]}]}

          exp       {:foo-bar [{:first_chunk [{:kebab-case :becomes/keyword
                                               :snake-case "def"
                                               :camel-case 7}
                                              {:kebab-case :a/plain-keyword
                                               :snake-case "abc"
                                               :camel-case -7}
                                              {:kebab-case :a/snake_keyword
                                               :snake-case "def"
                                               :camel-case 0}]
                                :emptyChunk  []
                                :another-chunk [{:kebab-case :a/camelKeyword
                                                 :snake-case "abc"
                                                 :camel-case -2}]}
                               {:cousin_chunk [{:kebab-case :namespaced.with/all-punctuation_used
                                                :snake-case "abc"
                                                :camel-case 2}]}]}
          converted (->sink input)]
      (testing "converts to CLJS as expected"
        (is (map? converted))
        (is (= exp converted)))
      (testing "round-trips as expected"
        (is (test.js/= input (-> input ->sink sink->)))))))

(deftest idempotency-test
  (testing "CLJS maps are not further converted"
    (let [->parent (converters/incoming Parent)
          input    {:child {:inner-value "foo"}}]
      (is (identical? input (->parent input))))))

(deftest opaque-any-test
  (testing ":any values are not touched, and round-trip as identical?"
    (let [schema    [:map
                     [:wrapper [:map
                                [:inner :any]
                                [:other number?]]]
                     [:foo string?]]
          js-obj    #js {"neverConverted" true}
          input     #js {"wrapper" #js {"inner" js-obj
                                        "other" 7}
                         "foo" "bar"}
          ->map     (converters/incoming schema)
          map->     (converters/outgoing schema)
          converted (->map input)
          returned  ^Object (map-> converted)]
      (is (map?    (-> converted :wrapper)))
      (is (object? (-> converted :wrapper :inner)))
      (is (identical? js-obj (-> converted :wrapper :inner)))
      (is (identical? js-obj (let [^Object wrapper (.-wrapper returned)]
                               (.-inner wrapper)))))))

(deftest uuid-test
  (testing "UUIDs are converted to strings in JS and back to #uuid objects in CLJS"
    (let [uuid (random-uuid)]
      (is (= (str uuid)
             ((converters/outgoing :uuid) uuid)))
      (is (= uuid
             ((converters/incoming :uuid) (str uuid))))))

  (testing "UUIDs nested in maps work too"
    (let [uuid   (random-uuid)
          schema [:map [:id :uuid]]]
      (is (test.js/= #js {:id (str uuid)}
               ((converters/outgoing schema) {:id uuid})))
      (is (= {:id uuid}
             ((converters/incoming schema) #js {:id (str uuid)})))))

  (testing "UUIDs nested in maps inside a map-of work too"
    (let [uuid   (random-uuid)
          schema [:map-of :string [:map [:id :uuid]]]]
      (is (test.js/= #js{"abc" #js {:id (str uuid)}}
               ((converters/outgoing schema) {"abc" {:id uuid}})))
      (is (= {"abc" {:id uuid}}
             ((converters/incoming schema) #js {"abc" #js {:id (str uuid)}}))))))

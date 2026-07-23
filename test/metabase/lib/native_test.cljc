(ns metabase.lib.native-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.native :as lib.native]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.malli :as mu]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel merge-template-tags-test
  (let [t1 {:id           "ac8a19f0-e125-418a-81dc-aa7f4f2c3e76"
            :name         "var"
            :display-name "Var"
            :type         :text}
        t2 {:type         :snippet
            :name         "snippet: snippet1"
            :id           "0e6dbc02-e9f4-4bdf-bf6e-9995afd108e0"
            :snippet-name "snippet1"
            :display-name "Snippet: Snippet1"}]
    (testing "should preserve order"
      (is (= [t1 t2]
             (#'lib.native/merge-template-tags [t1] [t2]))))
    (testing "should prefer changes from second collection like clojure.core/merge"
      (let [t1' (assoc t1 :type :number)]
        (is (= [t1' t2]
               (#'lib.native/merge-template-tags [t1] [t2 t1'])))))))

(deftest ^:parallel variable-tag-test
  (are [exp input] (= exp (into #{} (map :name) (lib.native/extract-template-tags meta/metadata-provider input)))
    #{"foo"} "SELECT * FROM table WHERE {{foo}} AND some_field IS NOT NULL"
    #{"foo" "bar"} "SELECT * FROM table WHERE {{foo}} AND some_field = {{bar}}"
    ;; Duplicates are flattened.
    #{"foo" "bar"} "SELECT * FROM table WHERE {{foo}} AND some_field = {{bar  }} OR {{  foo}}"
    ;; Ignoring non-alphanumeric vars
    #{} "SELECT * FROM table WHERE {{&foo}}"))

(deftest ^:parallel snippet-tag-test
  (are [exp input] (= exp (into #{} (map :name) (lib.native/extract-template-tags meta/metadata-provider input)))
    #{"snippet: foo"} "SELECT * FROM table WHERE {{snippet:   foo  }} AND some_field IS NOT NULL"
    #{"snippet: foo  *#&@"} "SELECT * FROM table WHERE {{snippet:   foo  *#&@}}"
    #{"snippet: foo"} "SELECT * FROM table WHERE {{snippet: foo}} AND {{snippet:foo}}"))

(deftest ^:parallel card-tag-test
  (are [exp input] (= exp (into #{} (map :name) (lib.native/extract-template-tags meta/metadata-provider input)))
    #{"#123"} "SELECT * FROM table WHERE {{ #123 }} AND some_field IS NOT NULL"
    ;; TODO: This logic should trim the whitespace and unify these two card tags.
    ;; I think this is a bug in the original code but am aiming to reproduce it exactly for now.
    ;; Tech debt issue: #39378
    #{"#123" "#123-with-slug"} "SELECT * FROM table WHERE {{ #123 }} AND {{  #123-with-slug  }}"
    #{"#123"} "SELECT * FROM table WHERE {{ #not-this }} AND {{#123}}"
    #{} "{{ #123foo }}"))

(deftest ^:parallel template-tags-test
  (testing "snippet tags"
    (let [snippet           {:type :snippet
                             :name "foo"
                             :id   1}
          metadata-provider (lib.tu/mock-metadata-provider
                             {:native-query-snippets [snippet]})]
      (is (=? [{:type         :snippet
                :name         "snippet: foo"
                :snippet-name "foo"
                :snippet-id   1
                :id           string?}]
              (lib.native/extract-template-tags metadata-provider "SELECT * FROM table WHERE {{snippet:foo}}")))
      (is (=? [{:type         :snippet
                :name         "snippet: foo"
                :snippet-name "foo"
                :snippet-id   1
                :id           string?}]
              (lib.native/extract-template-tags metadata-provider "SELECT * FROM {{snippet: foo}} WHERE {{snippet:foo}}"))))))

(deftest ^:parallel template-tags-test-2
  (testing "renaming a variable"
    (let [old-tag {:type         :text
                   :name         "foo"
                   :display-name "Foo"
                   :id           (str (random-uuid))}]
      (testing "changes display-name if the original is not customized"
        (is (=? [{:type         :text
                  :name         "bar"
                  :display-name "Bar"
                  :id           (:id old-tag)}]
                (lib.native/extract-template-tags meta/metadata-provider "SELECT * FROM {{bar}}"
                                                  [old-tag]))))
      (testing "keeps display-name if it's customized"
        (is (=? [{:type         :text
                  :name         "bar"
                  :display-name "Custom Name"
                  :id           (:id old-tag)}]
                (lib.native/extract-template-tags meta/metadata-provider "SELECT * FROM {{bar}}"
                                                  [(assoc old-tag :display-name "Custom Name")]))))
      (testing "works with other variables present, if they don't change"
        (let [other {:type         :text
                     :name         "other"
                     :display-name "Some Var"
                     :id           (str (random-uuid))}]
          (is (=? [{:type         :text
                    :name         "bar"
                    :display-name "Bar"
                    :id           (:id old-tag)}
                   other]
                  (lib.native/extract-template-tags meta/metadata-provider "SELECT * FROM {{bar}} AND field = {{other}}"
                                                    [old-tag other]))))))))

(deftest ^:parallel template-tags-test-3
  (testing "general case, add and remove"
    (let [mktag (fn [base]
                  (merge {:type         :text
                          :display-name (u.humanization/name->human-readable-name :simple (:name base))
                          :id           string?}
                         base))
          v1    (mktag {:name "foo"})
          v2    (mktag {:name "bar"})
          v3    (mktag {:name "baz"})
          s1    (mktag {:name         "snippet: first snippet"
                        :snippet-name "first snippet"
                        :snippet-id   123
                        :type         :snippet})
          s2    (mktag {:name         "snippet: another snippet"
                        :snippet-name "another snippet"
                        :snippet-id   124
                        :type         :snippet})
          c1    (mktag {:name    "#123-card-1"
                        :type    :card
                        :card-id 123})
          c2    (mktag {:name    "#321"
                        :type    :card
                        :card-id 321})
          metadata-provider (lib.tu/mock-metadata-provider
                             {:native-query-snippets [{:name         "first snippet"
                                                       :id           123
                                                       :snippet-name "first snippet"}
                                                      {:name         "another snippet"
                                                       :id           124
                                                       :snippet-name "another snippet"}]})]
      (is (=? [c1 v1 s1]
              (lib.native/extract-template-tags
               metadata-provider
               "SELECT * FROM {{#123-card-1}} WHERE {{foo}} AND {{  snippet:first snippet}}")))
      (is (=? [c2 v3 v2 s2]
              (lib.native/extract-template-tags
               metadata-provider
               "SELECT * FROM {{#321}} WHERE {{baz}} AND {{bar}} AND {{snippet:another snippet}}"
               [(assoc v1 :id (str (random-uuid)))
                (assoc c1 :id (str (random-uuid)))
                (assoc s1 :id (str (random-uuid)))])))
      (let [s1-uuid (str (random-uuid))]
        (is (= [(assoc s2 :id s1-uuid)]
               (lib.native/extract-template-tags
                metadata-provider
                "SELECT * FROM {{snippet:another snippet}}"
                [(assoc s1 :id s1-uuid)])))))))

(deftest ^:parallel variable-tag-with-dots-and-underscores-test
  (testing "dots and underscores are legal in variable names (metabase#15029)"
    (are [exp input] (= exp
                        (into #{} (map :name) (lib.native/extract-template-tags meta/metadata-provider input)))
      #{"number.of.stars"} "select * from products where rating = {{number.of.stars}}"
      #{"a_b" "c.d"}       "select {{a_b}}, {{c.d}}")))

(deftest ^:parallel snippet-inner-tags-surfaced-test
  (testing "a snippet's own inner template tags are surfaced onto the outer query"
    (doseq [[description snippets query expected]
            [["inner variable tag"
              [{:id            1
                :name          "cat-filter"
                :content       "category = {{category}}"
                :template-tags {"category" {:name         "category"
                                            :type         :text
                                            :display-name "Category"}}}]
              "select * from products where {{snippet: cat-filter}}"
              "category"]
             ["inner card tag"
              [{:id            1
                :name          "card-ref"
                :content       "id in ({{#123}})"
                :template-tags {"#123" {:name         "#123"
                                        :type         :card
                                        :display-name "#123"
                                        :card-id      123}}}]
              "select * from products where {{snippet: card-ref}}"
              "#123"]
             ["inner table tag"
              [{:id            1
                :name          "table-ref"
                :content       "{{orders}}"
                :template-tags {"orders" {:name         "orders"
                                          :type         :table
                                          :display-name "Orders"
                                          :table-id     (meta/id :orders)}}}]
              "select * from {{snippet: table-ref}}"
              "orders"]
             ["nested snippet's inner tags"
              [{:id            1
                :name          "outer"
                :content       "{{snippet: inner}}"
                :template-tags {"snippet: inner" {:name         "snippet: inner"
                                                  :type         :snippet
                                                  :display-name "Inner"
                                                  :snippet-name "inner"}}}
               {:id            2
                :name          "inner"
                :content       "category = {{category}}"
                :template-tags {"category" {:name         "category"
                                            :type         :text
                                            :display-name "Category"}}}]
              "select * from products where {{snippet: outer}}"
              "category"]]]
      (testing description
        (let [mp (lib.tu/mock-metadata-provider
                  meta/metadata-provider
                  {:native-query-snippets snippets})]
          (is (contains? (into #{} (map :name) (lib.native/extract-template-tags mp query))
                         expected)))))))

(deftest ^:parallel snippet-inner-tag-dedup-test
  (doseq [[description snippets query expected]
          [["a local tag and a snippet's surfaced inner tag of the same name collapse to one parameter"
            [{:id            1
              :name          "s"
              :content       "category = {{filter}}"
              :template-tags {"filter" {:name         "filter"
                                        :type         :text
                                        :display-name "Filter"}}}]
            "select * from products where {{snippet: s}} and x = {{filter}}"
            "filter"]
           ["two snippets sharing an inner tag name dedup to a single entry"
            [{:id            1
              :name          "s1"
              :content       "a = {{category2}}"
              :template-tags {"category2" {:name         "category2"
                                           :type         :text
                                           :display-name "Category2"}}}
             {:id            2
              :name          "s2"
              :content       "b = {{category2}}"
              :template-tags {"category2" {:name         "category2"
                                           :type         :text
                                           :display-name "Category2"}}}]
            "select * from products where {{snippet: s1}} and {{snippet: s2}}"
            "category2"]]]
    (testing description
      (let [mp   (lib.tu/mock-metadata-provider
                  meta/metadata-provider
                  {:native-query-snippets snippets})
            tags (lib.native/extract-template-tags mp query)]
        (is (= 1 (count (filter #(= expected %) (map :name tags)))))))))

(def ^:private qp-results-metadata
  "Capture of the `data.results_metadata` that would come back when running `SELECT * FROM VENUES;` with the Query
  Processor.

  IRL queries actually come back with both `data.cols` and `data.results_metadata.columns`, which are slightly
  different from one another; the frontend merges these together into one unified metadata map. This is both icky and
  silly. I'm hoping we can get away with just using one or the other in the future. So let's try to use just the stuff
  here and see how far we get. If it turns out we need something in `data.cols` that's missing from here, let's just
  add it to `data.results_metadata.columns` in QP results, and add it here as well, so we can start moving toward a
  world where we don't have two versions of the metadata in query responses."
  {:lib/type :metadata/results
   :columns  (get-in (lib.tu/mock-cards) [:venues :result-metadata])})

(deftest ^:parallel native-query-test
  (is (=? {:lib/type :mbql/query
           :database (meta/id)
           :stages   [{:lib/type :mbql.stage/native
                       :native   "SELECT * FROM VENUES;"}]}
          (lib/native-query meta/metadata-provider "SELECT * FROM VENUES;" qp-results-metadata nil))))

(deftest ^:parallel native-query-suggested-name-test
  (let [query (lib/native-query meta/metadata-provider "SELECT * FROM VENUES;" qp-results-metadata nil)]
    (is (= "Native query"
           (lib/describe-query query)))
    (is (nil? (lib/suggested-name query)))))

(deftest ^:parallel native-query-building
  (let [query (lib/native-query meta/metadata-provider "select * from venues where id = {{myid}}")]
    (testing "Updating query keeps template tags in sync"
      (is (=? ["select * from venues where id = {{myid}}"
               [{:type         :text
                 :name         "myid"
                 :id           string?
                 :display-name "Myid"}]]
              ((juxt lib/raw-native-query lib/template-tags) query)))
      (is (=? ["select * from venues where id = {{myid}} and x = {{y}}"
               [{:name "myid"} {:name "y"}]]
              (-> query
                  (lib/with-native-query "select * from venues where id = {{myid}} and x = {{y}}")
                  ((juxt lib/raw-native-query lib/template-tags)))))
      (is (=? ["select * from venues where id = {{myrenamedid}}"
               [{:name "myrenamedid"}]]
              (-> query
                  (lib/with-native-query "select * from venues where id = {{myrenamedid}}")
                  ((juxt lib/raw-native-query lib/template-tags)))))
      (is (empty?
           (-> query
               (lib/with-native-query "select * from venues")
               lib/template-tags))))
    (is (thrown-with-msg?
         #?(:clj Throwable :cljs :default)
         #"Must be a native query"
         (-> (lib.tu/venues-query)
             (lib/with-native-query "foobar"))))))

(deftest ^:parallel with-native-query-snippet-with-template-tags-test
  (testing "with-native-query should pull in template tags from referenced snippets"
    (let [mp    (lib.tu/mock-metadata-provider
                 meta/metadata-provider
                 {:native-query-snippets [{:id            1
                                           :name          "snippet1"
                                           :type          :snippet
                                           :content       "{{var}}"
                                           :template-tags {"var" {:id           "ac8a19f0-e125-418a-81dc-aa7f4f2c3e76"
                                                                  :name         "var"
                                                                  :display-name "Var"
                                                                  :type         :text}}}]})
          initial-tags [{:snippet-name "snippet1"
                         :display-name "Snippet: Snippet1"
                         :type         :snippet
                         :name         "snippet: snippet1"
                         :id           "e0616322-eadc-430b-a15b-d26d1615076d"
                         :snippet-id   1}]
          expected [{:snippet-name "snippet1"
                     :display-name "Snippet: Snippet1"
                     :type         :snippet
                     :name         "snippet: snippet1"
                     :id           "e0616322-eadc-430b-a15b-d26d1615076d"
                     :snippet-id   1}
                    {:id           "ac8a19f0-e125-418a-81dc-aa7f4f2c3e76"
                     :name         "var"
                     :display-name "Var"
                     :type         :text}]]
      (testing "Query created with `with-template-tags` should get snippet tags pulled in"
        (let [query (-> (lib/native-query mp "{{snippet: snippet1}}")
                        (lib/with-template-tags initial-tags))]
          (is (= expected
                 (lib/template-tags query)))))
      (testing (str "lib.native/with-native-query should update template tags to the same was they'd be if we used"
                    " `with-template-tags` in the first place")
        (let [query (-> (lib/native-query mp "{{snippet: snippet1}}")
                        ;; if we don't manually splice in tags here then `with-native-query` has nothing to update
                        (lib/update-query-stage 0 assoc :template-tags initial-tags))]
          (is (= expected
                 (lib/template-tags (lib.native/with-native-query query "{{snippet: snippet1}}")))))))))

(deftest ^:parallel with-native-query-update-snippet-with-template-tags-test
  (testing "with-native-query should update template tags when a {{snippet: ...}} tag changes"
    (let [mp (lib.tu/mock-metadata-provider
              meta/metadata-provider
              {:native-query-snippets [{:id            1
                                        :name          "snippet1"
                                        :type          :snippet
                                        :content       "SELECT"}
                                       {:id            2
                                        :name          "snippet2"
                                        :type          :snippet
                                        :content       "{{var}}"
                                        :template-tags {"var" {:id           "ac8a19f0-e125-418a-81dc-aa7f4f2c3e76"
                                                               :name         "var"
                                                               :display-name "Var"
                                                               :type         :text}}}]})
          initial-tags [{:snippet-name "snippet1"
                         :display-name "Snippet: Snippet1"
                         :type         :snippet
                         :name         "snippet: snippet1"
                         :id           "e0616322-eadc-430b-a15b-d26d1615076d"
                         :snippet-id   1}]
          query (-> (lib/native-query mp "{{snippet: snippet1}}")
                    (lib/with-template-tags initial-tags))]
      (testing "Initial query (references snippet 1)"
        (is (=? [{:name "snippet: snippet1"}]
                (lib/template-tags query))))
      (testing "updated query (references snippet 2) should update template tags and pull in tags from updated snippet"
        (let [query' (lib.native/with-native-query query "{{snippet: snippet2}}")]
          (is (=? [{:name "snippet: snippet2"}
                   {:name "var"}]
                  (lib/template-tags query'))))))))

(deftest ^:parallel with-template-tags-test
  (let [query         (lib/native-query meta/metadata-provider "select * from venues where id = {{myid}}")
        original-tags (lib/template-tags query)]
    (is (= (assoc-in original-tags [0 :display-name] "My ID")
           (-> query
               (lib/with-template-tags {"myid" (assoc (first original-tags) :display-name "My ID")})
               lib/template-tags)))
    (testing "Changing query keeps updated template tags"
      (is (= (assoc-in original-tags [0 :display-name] "My ID")
             (-> query
                 (lib/with-template-tags {"myid" (assoc (first original-tags) :display-name "My ID")})
                 (lib/with-native-query "select * from venues where category_id = {{myid}}")
                 lib/template-tags))))
    (testing "Doesn't introduce garbage"
      (is (= original-tags
             (-> query
                 (lib/with-template-tags {"garbage" (assoc (first original-tags) :name "garbage" :display-name "Foobar")})
                 lib/template-tags))))
    (testing "Allows to remove template tag properties"
      (let [template-tags     [{:default      nil
                                :dimension    [:field {:lib/uuid (str (random-uuid))} 1]
                                :display-name "Tag"
                                :id           "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
                                :name         "tag"
                                :type         :dimension
                                :widget-type  :date/range}]
            query             (-> (lib/native-query meta/metadata-provider "select * from venues where {{tag}}")
                                  (lib/with-template-tags template-tags))
            new-template-tags [{:display-name "Tag"
                                :id           "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
                                :name         "tag"
                                :type         :text}]]
        (is (= new-template-tags (lib/template-tags (lib/with-template-tags query new-template-tags))))))
    (is (thrown-with-msg?
         #?(:clj Throwable :cljs :default)
         #"Must be a native query"
         (-> (lib.tu/venues-query)
             (lib/with-template-tags [(assoc (first original-tags) :display-name "My ID")]))))))

(deftest ^:parallel with-template-tags-update-map-order-test
  ;; preserve updated order as passed in by the FE.
  (testing "it should be possible to reorder template tags with with-template-tags"
    (let [query                   (lib/native-query meta/metadata-provider "{{x}} {{y}} {{z}}")
          [x y :as original-tags] (lib/template-tags query)]
      (is (=? [{:name "x"} {:name "y"} {:name "z"}]
              original-tags))
      (doseq [[message updated-tags] {"updated tags is a map"
                                      {"y" y, "x" x}

                                      "updated tags is a list"
                                      [y x]}]
        (testing message
          (let [query' (lib/with-template-tags query updated-tags)]
            (is (=? [{:name "y"} {:name "x"} {:name "z"}]
                    (lib/template-tags query')))))))))

(defn ^:private metadata-provider-requiring-collection []
  (meta/updated-metadata-provider update :features conj :native-requires-specified-collection))

(deftest ^:parallel native-query+collection-test
  (testing "building when collection is not required"
    (is (=? {:stages [(complement :collection)]}
            (lib/native-query meta/metadata-provider "myquery")))
    (is (=? {:stages [(complement :collection)]}
            (lib/native-query meta/metadata-provider "myquery" nil {:collection "mycollection"}))))
  (testing "building when requires collection"
    (is (=? {:stages [(complement :collection)]}
            (lib/native-query meta/metadata-provider "myquery")))
    (is (=? {:stages [{:collection "mycollection"}]}
            (lib/native-query (metadata-provider-requiring-collection) "myquery" nil {:collection "mycollection"})))))

(deftest ^:parallel with-different-database-test
  (let [query (lib/native-query meta/metadata-provider "myquery")]
    (testing "database id should change"
      (is (=? {:database 9999}
              (-> query
                  (lib/with-different-database
                    (meta/updated-metadata-provider assoc :id 9999))))))
    (is (thrown-with-msg?
         #?(:clj Throwable :cljs :default)
         #"Must be a native query"
         (-> (lib.tu/venues-query)
             (lib/with-different-database meta/metadata-provider))))))

(deftest ^:parallel with-native-collection-test
  (is (=? {:stages [{:collection "mynewcollection"}]}
          (-> (lib/native-query (metadata-provider-requiring-collection) "myquery" nil {:collection "mycollection"})
              (lib/with-native-extras {:collection "mynewcollection"}))))
  (is (=? {:stages [(complement :collection)]}
          (-> (lib/native-query meta/metadata-provider "myquery")
              (lib/with-native-extras {:collection "mycollection"}))))
  (is (thrown-with-msg?
       #?(:clj Throwable :cljs :default)
       #"Must be a native query"
       (-> (lib/query (metadata-provider-requiring-collection) (meta/table-metadata :venues))
           (lib/with-native-extras {:collection "mycollection"}))))
  (testing "should not throw when creating a native query without required extras (metabase#62556)"
    (is (=? {:stages [{:native "myquery"}]}
            (lib/native-query (metadata-provider-requiring-collection) "myquery")))))

(deftest ^:parallel has-write-permission-test
  (testing ":native-permissions in database"
    (is (lib/has-write-permission
         (lib/native-query (lib.tu/mock-metadata-provider
                            meta/metadata-provider
                            {:database (merge (lib.metadata/database meta/metadata-provider) {:native-permissions :write})})
                           "select * from x;")))
    (is (not (lib/has-write-permission
              (lib/native-query (lib.tu/mock-metadata-provider
                                 meta/metadata-provider
                                 {:database (merge (lib.metadata/database meta/metadata-provider) {:native-permissions :none})})
                                "select * from x;"))))
    (is (not (lib/has-write-permission
              (lib/native-query (lib.tu/mock-metadata-provider
                                 meta/metadata-provider
                                 {:database (dissoc (lib.metadata/database meta/metadata-provider) :native-permissions)})
                                "select * from x;"))))
    (is (thrown-with-msg?
         #?(:clj Throwable :cljs :default)
         #"Must be a native query"
         (lib/has-write-permission (lib.tu/venues-query))))))

(deftest ^:parallel can-run-native-test
  (is (lib/can-run (lib/with-template-tags
                     (lib/native-query meta/metadata-provider "select * {{foo}}")
                     {"foo" {:type :dimension
                             :id "1"
                             :name "foo"
                             :widget-type :text
                             :display-name "foo"
                             :dimension [:field {:lib/uuid (str (random-uuid))} 1]}})
                   :question))
  (is (lib/can-run (lib.tu/venues-query) :question))
  (mu/disable-enforcement
    (is (not (lib/can-run (lib/native-query meta/metadata-provider "") :question)))
    (is (not (lib/can-run (lib/with-template-tags
                            (lib/native-query meta/metadata-provider "select * {{foo}}")
                            {"foo" {:type :dimension
                                    :id "1"
                                    :name "foo"
                                    ;; missing :dimension
                                    :widget-type :text
                                    :display-name "foo"}})
                          :question)))
    (is (not (lib/can-run (update-in (lib/native-query (metadata-provider-requiring-collection) "select * {{foo}}" nil {:collection "foobar"})
                                     [:stages 0] dissoc :collection)
                          :question)))))

(deftest ^:parallel engine-test
  (is (= :h2 (lib/engine (lib.tu/native-query)))))

(deftest ^:parallel native-query-card-ids-test
  (let [query (lib/query (lib.tu/metadata-provider-with-mock-cards)
                         {:database (meta/id)
                          :type     :native
                          :native   {:query         {}
                                     :template-tags {"tag-name-not-important1" {:type         :card
                                                                                :display-name "X"
                                                                                :card-id      1}
                                                     "tag-name-not-important2" {:type         :card
                                                                                :display-name "Y"
                                                                                :card-id      2}}}})]
    (is (= #{1 2}
           (lib/native-query-card-ids query)))))

(deftest ^:parallel template-tags-referenced-cards-test
  (testing "returns Card instances from raw query"
    (let [query (lib/query (lib.tu/metadata-provider-with-mock-cards)
                           {:database (meta/id)
                            :type     :native
                            :native   {:query         {}
                                       :template-tags {"tag-name-not-important1" {:type         :card
                                                                                  :display-name "X"
                                                                                  :card-id      1}
                                                       "tag-name-not-important2" {:type         :card
                                                                                  :display-name "Y"
                                                                                  :card-id      2}}}})]
      (is (=? [{:id            1
                :dataset-query {}}
               {:id            2
                :dataset-query {}}]
              (lib/template-tags-referenced-cards query))))))

(deftest ^:parallel not-has-template-tag-variables?-test
  (are [query] (not (lib.native/has-template-tag-variables? query))
    (lib/query meta/metadata-provider (meta/table-metadata :venues))
    (lib/native-query meta/metadata-provider "select * from venues where id = 1")
    (lib/native-query meta/metadata-provider "select * from venues {{snippet:a snippet}}")
    (lib/native-query meta/metadata-provider "select * from {{#123-some-card}}")))

(deftest ^:parallel has-template-tag-variables?-test
  (are [query] (lib.native/has-template-tag-variables? query)
    ;; text variable
    (lib/native-query meta/metadata-provider "select * from venues where name = {{mytag}}")

    ;; number variable
    (-> (lib/native-query meta/metadata-provider "select * from venues where category_id = {{mytag}}")
        (lib/with-template-tags {"mytag"
                                 {:default "1"
                                  :display-name "My Tag"
                                  :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
                                  :name "mytag"
                                  :type :number}}))

    ;; date variable
    (-> (lib/native-query meta/metadata-provider "select * from orders where created_at = {{mytag}}")
        (lib/with-template-tags {"mytag"
                                 {:default nil
                                  :display-name "My Tag"
                                  :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
                                  :name "mytag"
                                  :type :date}}))

    ;; field filter
    (-> (lib/native-query meta/metadata-provider "select * from venues where {{mytag}}")
        (lib/with-template-tags {"mytag"
                                 {:default nil
                                  :dimension [:field {:lib/uuid (str (random-uuid))} 1]
                                  :display-name "My Tag"
                                  :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
                                  :name "mytag"
                                  :type :dimension
                                  :widget-type :date/range}}))))

(deftest ^:parallel remove-template-tags-when-changing-database
  (let [query (-> (lib/native-query meta/metadata-provider "select * from venues where {{mytag}}")
                  (lib/with-template-tags {"mytag"
                                           {:default nil
                                            :dimension [:field {:lib/uuid (str (random-uuid))} 1]
                                            :display-name "My Tag"
                                            :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
                                            :name "mytag"
                                            :type :dimension
                                            :widget-type :date/range}}))]
    (testing "remove dimensions from template tags"
      (is (empty? (-> query
                      (lib/with-different-database
                        (meta/updated-metadata-provider assoc :id 9999))
                      lib/template-tags
                      (->> (filter :dimension))))))))

(deftest ^:parallel native-query-idents-test
  (let [card  (:venues/native (lib.tu/mock-cards))
        mp    (lib.tu/metadata-provider-with-mock-card card)
        query (lib/query mp (lib.metadata/card mp (:id card)))]
    (is (=? [{:name         "ID"
              :display-name "ID"
              :lib/source   :source/card}
             {:name         "NAME"
              :display-name "Name"
              :lib/source   :source/card}
             {:name         "CATEGORY_ID"
              :display-name "Category ID"
              :lib/source   :source/card}
             {:name         "LATITUDE"
              :display-name "Latitude"
              :lib/source   :source/card}
             {:name         "LONGITUDE"
              :display-name "Longitude"
              :lib/source   :source/card}
             {:name         "PRICE"
              :display-name "Price"
              :lib/source   :source/card}]
            (lib/returned-columns query)))))

(deftest ^:parallel add-parameters-text-tag-test
  (is (= [{:id     "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
           :type   :string/=
           :value  ["foo"]
           :target [:variable [:template-tag "mytag"]]}]
         (-> (lib/native-query meta/metadata-provider "select * from venues where {{mytag}}")
             (lib/with-template-tags {"mytag" {:type :text
                                               :name "mytag"
                                               :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
                                               :display-name "My Tag"}})
             lib/add-parameters-for-template-tags
             :parameters))))

(deftest ^:parallel add-parameters-number-tag-test
  (is (= [{:id     "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
           :type   :number/=
           :value  ["0"]
           :target [:variable [:template-tag "mytag"]]}]
         (-> (lib/native-query meta/metadata-provider "select * from venues where {{mytag}}")
             (lib/with-template-tags {"mytag"
                                      {:display-name "My Tag"
                                       :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
                                       :name "mytag"
                                       :type :number}})
             lib/add-parameters-for-template-tags
             :parameters))))

(deftest ^:parallel add-parameters-date-tag-test
  (is (= [{:id     "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
           :type   :date/single
           :value  "1970-01-01"
           :target [:variable [:template-tag "mytag"]]}]
         (-> (lib/native-query meta/metadata-provider "select * from venues where {{mytag}}")
             (lib/with-template-tags {"mytag"
                                      {:display-name "My Tag"
                                       :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
                                       :name "mytag"
                                       :type :date}})
             lib/add-parameters-for-template-tags
             :parameters))))

(deftest ^:parallel add-parameters-boolean-tag-test
  (is (= [{:id     "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
           :type   :boolean/=
           :value  [false]
           :target [:variable [:template-tag "mytag"]]}]
         (-> (lib/native-query meta/metadata-provider "select * from venues where {{mytag}}")
             (lib/with-template-tags {"mytag"
                                      {:display-name "My Tag"
                                       :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
                                       :name "mytag"
                                       :type :boolean}})
             lib/add-parameters-for-template-tags
             :parameters))))

(deftest ^:parallel add-parameters-string-dimension-tag-test
  (is (= [{:id     "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
           :type   :string/=
           :value  ["foo"]
           :target [:dimension [:template-tag "mytag"]]}]
         (-> (lib/native-query meta/metadata-provider "select * from venues where {{mytag}}")
             (lib/with-template-tags {"mytag"
                                      {:dimension [:field
                                                   {:lib/uuid "a9e2b665-cadd-4d25-b1c1-09ca8f1736cf"}
                                                   (meta/id :products :category)]
                                       :display-name "My Tag"
                                       :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
                                       :name "mytag"
                                       :type :dimension
                                       :widget-type :date/range}})
             lib/add-parameters-for-template-tags
             :parameters))))

(deftest ^:parallel add-parameters-number-dimension-tag-test
  (is (= [{:id     "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
           :type   :number/=
           :value  ["0"]
           :target [:dimension [:template-tag "mytag"]]}]
         (-> (lib/native-query meta/metadata-provider "select * from venues where {{mytag}}")
             (lib/with-template-tags {"mytag"
                                      {:dimension [:field
                                                   {:lib/uuid "a9e2b665-cadd-4d25-b1c1-09ca8f1736cf"}
                                                   (meta/id :orders :total)]
                                       :display-name "My Tag"
                                       :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
                                       :name "mytag"
                                       :type :dimension
                                       :widget-type :date/range}})
             lib/add-parameters-for-template-tags
             :parameters))))

(deftest ^:parallel add-parameters-date-dimension-tag-test
  (is (= [{:id     "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
           :type   :date/single
           :value  "2025-01-01"
           :target [:dimension [:template-tag "mytag"]]}]
         (-> (lib/native-query meta/metadata-provider "select * from venues where {{mytag}}")
             (lib/with-template-tags {"mytag"
                                      {:dimension [:field
                                                   {:lib/uuid "a9e2b665-cadd-4d25-b1c1-09ca8f1736cf"}
                                                   (meta/id :orders :created-at)]
                                       :display-name "My Tag"
                                       :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
                                       :name "mytag"
                                       :type :dimension
                                       :widget-type :date/range}})
             lib/add-parameters-for-template-tags
             :parameters))))

(deftest ^:parallel add-parameters-temporal-unit-tag-test
  (is (= [{:id     "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
           :type   :temporal-unit
           :value  "week"
           :target [:dimension [:template-tag "mytag"]]}]
         (-> (lib/native-query meta/metadata-provider "select * from venues where {{mytag}}")
             (lib/with-template-tags {"mytag"
                                      {:dimension [:field
                                                   {:lib/uuid "a9e2b665-cadd-4d25-b1c1-09ca8f1736cf"}
                                                   (meta/id :orders :created-at)]
                                       :display-name "My Tag"
                                       :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
                                       :name "mytag"
                                       :type :temporal-unit}})
             lib/add-parameters-for-template-tags
             :parameters))))

(deftest ^:parallel validate-template-tags-test
  (testing "valid template tags should return no errors"
    (are
     [template-tags]
     (= [] (lib.native/validate-template-tags
            (lib/query (lib.tu/metadata-provider-with-mock-cards)
                       {:database (meta/id)
                        :type     :native
                        :native   {:query         {}
                                   :template-tags template-tags}})))
      {}

      {"mytag" {:type :number
                :name "mytag"
                :display-name "My Tag"
                :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"}}))
  (testing "invalid template tags should return the correct errors"
    (mu/disable-enforcement
      (are
       [errors template-tags]
       (= errors (lib.native/validate-template-tags
                  (lib/query (lib.tu/metadata-provider-with-mock-cards)
                             {:database (meta/id)
                              :type     :native
                              :native   {:query         {}
                                         :template-tags template-tags}})))
        [{:tag-name "mytag"
          :error/message "The variable \"mytag\" needs to be mapped to a field."}]
        {"mytag" {:type :dimension
                  :name "mytag"
                  :display-name "My Tag"
                  :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"}}

        [{:tag-name "mytag"
          :error/message "The variable \"mytag\" needs to be mapped to a field."}]
        {"mytag" {:type :temporal-unit
                  :name "mytag"
                  :display-name "My Tag"
                  :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"}}

        [{:tag-name "mytag"
          :error/message "Missing widget label: mytag"}]
        {"mytag" {:type :number
                  :name "mytag"
                  :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"}}

        [{:tag-name "mytag"
          :error/message "Missing widget label: mytag"}
         {:tag-name "mytag"
          :error/message "The variable \"mytag\" needs to be mapped to a field."}]
        {"mytag" {:type :dimension
                  :name "mytag"
                  :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"}}))))

(defn- table-tag-query [mp template-tag-overrides]
  (let [base-query (lib.native/native-query mp "select * from {{table}}")
        template-tag (m/find-first #(= (:name %) "table") (lib.native/template-tags base-query))]
    (lib.native/with-template-tags base-query
      {"table" (merge template-tag {:type :table} template-tag-overrides)})))

(deftest ^:parallel with-template-tags-normalize-template-tag-names-test
  (testing "`with-template-tags` should normalize tag names"
    ;; `snippet:expensive_venues` should be normalized to `snippet: expensive_venues`
    (let [mp (lib.tu/mock-metadata-provider
              meta/metadata-provider
              {:native-query-snippets [{:id      1
                                        :name    "expensive_venues"
                                        :content "venues WHERE price = 4"}]})]
      (is (=? {:stages [{:native        "SELECT * FROM {{snippet:expensive_venues}}"
                         :template-tags [{:name         "snippet: expensive_venues"
                                          :snippet-id   1
                                          :snippet-name "expensive_venues"
                                          :type         :snippet
                                          :display-name "(New display name)"}]}]}
              (-> (lib/native-query mp "SELECT * FROM {{snippet:expensive_venues}}")
                  (lib/with-template-tags {"snippet:expensive_venues" {:type         :snippet
                                                                       :name         "snippet:expensive_venues"
                                                                       :display-name "(New display name)"
                                                                       :snippet-name "expensive_venues"
                                                                       :snippet-id   1}})))))))

(deftest ^:parallel basic-native-query-table-references-test
  (testing "should find id-based native query table references"
    (is (= #{{:table (meta/id :orders)}}
           (lib.native/native-query-table-references
            (table-tag-query meta/metadata-provider {:table-id (meta/id :orders)}))))))

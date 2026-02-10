(ns metabase.lib.native-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.native :as lib.native]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.util.humanization :as u.humanization]
   [metabase.util.malli :as mu]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel variable-tag-test
  (are [exp input] (= exp (set (keys (lib.native/extract-template-tags meta/metadata-provider input))))
    #{"foo"} "SELECT * FROM table WHERE {{foo}} AND some_field IS NOT NULL"
    #{"foo" "bar"} "SELECT * FROM table WHERE {{foo}} AND some_field = {{bar}}"
    ;; Duplicates are flattened.
    #{"foo" "bar"} "SELECT * FROM table WHERE {{foo}} AND some_field = {{bar  }} OR {{  foo}}"
    ;; Ignoring non-alphanumeric vars
    #{} "SELECT * FROM table WHERE {{&foo}}"))

(deftest ^:parallel snippet-tag-test
  (are [exp input] (= exp (set (keys (lib.native/extract-template-tags meta/metadata-provider input))))
    #{"snippet: foo"} "SELECT * FROM table WHERE {{snippet:   foo  }} AND some_field IS NOT NULL"
    #{"snippet: foo  *#&@"} "SELECT * FROM table WHERE {{snippet:   foo  *#&@}}"
    #{"snippet: foo"} "SELECT * FROM table WHERE {{snippet: foo}} AND {{snippet:foo}}"))

(deftest ^:parallel card-tag-test
  (are [exp input] (= exp (set (keys (lib.native/extract-template-tags meta/metadata-provider input))))
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
      (is (=? {"snippet: foo" {:type         :snippet
                               :name         "snippet: foo"
                               :snippet-name "foo"
                               :snippet-id   1
                               :id           string?}}
              (lib.native/extract-template-tags metadata-provider "SELECT * FROM table WHERE {{snippet:foo}}")))
      (is (=? {"snippet: foo" {:type         :snippet
                               :name         "snippet: foo"
                               :snippet-name "foo"
                               :snippet-id   1
                               :id           string?}}
              (lib.native/extract-template-tags metadata-provider "SELECT * FROM {{snippet: foo}} WHERE {{snippet:foo}}")))))

  (testing "renaming a variable"
    (let [old-tag {:type         :text
                   :name         "foo"
                   :display-name "Foo"
                   :id           (str (random-uuid))}]
      (testing "changes display-name if the original is not customized"
        (is (=? {"bar" {:type         :text
                        :name         "bar"
                        :display-name "Bar"
                        :id           (:id old-tag)}}
                (lib.native/extract-template-tags meta/metadata-provider "SELECT * FROM {{bar}}"
                                                  {"foo" old-tag}))))
      (testing "keeps display-name if it's customized"
        (is (=? {"bar" {:type         :text
                        :name         "bar"
                        :display-name "Custom Name"
                        :id           (:id old-tag)}}
                (lib.native/extract-template-tags meta/metadata-provider "SELECT * FROM {{bar}}"
                                                  {"foo" (assoc old-tag :display-name "Custom Name")}))))

      (testing "works with other variables present, if they don't change"
        (let [other {:type         :text
                     :name         "other"
                     :display-name "Some Var"
                     :id           (str (random-uuid))}]
          (is (=? {"other" other
                   "bar"   {:type         :text
                            :name         "bar"
                            :display-name "Bar"
                            :id           (:id old-tag)}}
                  (lib.native/extract-template-tags meta/metadata-provider "SELECT * FROM {{bar}} AND field = {{other}}"
                                                    {"foo"   old-tag
                                                     "other" other})))))))

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
                             {:native-query-snippets [{:name "first snippet"
                                                       :id   123}
                                                      {:name "another snippet"
                                                       :id   124}]})]
      (is (=? {"foo"                    v1
               "#123-card-1"            c1
               "snippet: first snippet" s1}
              (lib.native/extract-template-tags
               metadata-provider
               "SELECT * FROM {{#123-card-1}} WHERE {{foo}} AND {{  snippet:first snippet}}")))
      (is (=? {"bar"                      v2
               "baz"                      v3
               "snippet: another snippet" s2
               "#321"                     c2}
              (lib.native/extract-template-tags
               metadata-provider
               "SELECT * FROM {{#321}} WHERE {{baz}} AND {{bar}} AND {{snippet:another snippet}}"
               {"foo"                    (assoc v1 :id (str (random-uuid)))
                "#123-card-1"            (assoc c1 :id (str (random-uuid)))
                "snippet: first snippet" (assoc s1 :id (str (random-uuid)))})))
      (let [s1-uuid (str (random-uuid))]
        (is (= {"snippet: another snippet" (assoc s2 :id s1-uuid)}
               (lib.native/extract-template-tags
                metadata-provider
                "SELECT * FROM {{snippet:another snippet}}"
                {"snippet: first snippet" (assoc s1 :id s1-uuid)})))))))

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
               {"myid" {:type :text,
                        :name "myid",
                        :id string?
                        :display-name "Myid"}}]
              ((juxt lib/raw-native-query lib/template-tags) query)))
      (is (=? ["select * from venues where id = {{myid}} and x = {{y}}"
               {"myid" {} "y" {}}]
              (-> query
                  (lib/with-native-query "select * from venues where id = {{myid}} and x = {{y}}")
                  ((juxt lib/raw-native-query lib/template-tags)))))
      (is (=? ["select * from venues where id = {{myrenamedid}}"
               {"myrenamedid" {}}]
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

(deftest ^:parallel with-template-tags-test
  (let [query (lib/native-query meta/metadata-provider "select * from venues where id = {{myid}}")
        original-tags (lib/template-tags query)]
    (is (= (assoc-in original-tags ["myid" :display-name] "My ID")
           (-> query
               (lib/with-template-tags {"myid" (assoc (get original-tags "myid") :display-name "My ID")})
               lib/template-tags)))
    (testing "Changing query keeps updated template tags"
      (is (= (assoc-in original-tags ["myid" :display-name] "My ID")
             (-> query
                 (lib/with-template-tags {"myid" (assoc (get original-tags "myid") :display-name "My ID")})
                 (lib/with-native-query "select * from venues where category_id = {{myid}}")
                 lib/template-tags))))
    (testing "Doesn't introduce garbage"
      (is (= original-tags
             (-> query
                 (lib/with-template-tags {"garbage" (assoc (get original-tags "myid") :name "garbage" :display-name "Foobar")})
                 lib/template-tags))))
    (testing "Allows to remove template tag properties"
      (let [template-tags     {"tag"
                               {:default nil
                                :dimension [:field {:lib/uuid (str (random-uuid))} 1]
                                :display-name "Tag"
                                :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
                                :name "tag"
                                :type :dimension
                                :widget-type :date/range}}
            query             (-> (lib/native-query meta/metadata-provider "select * from venues where {{tag}}")
                                  (lib/with-template-tags template-tags))
            new-template-tags {"tag"
                               {:display-name "Tag"
                                :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
                                :name "tag"
                                :type :text}}]
        (is (= new-template-tags (lib/template-tags (lib/with-template-tags query new-template-tags))))))
    (is (thrown-with-msg?
         #?(:clj Throwable :cljs :default)
         #"Must be a native query"
         (-> (lib.tu/venues-query)
             (lib/with-template-tags {"myid" (assoc (get original-tags "myid") :display-name "My ID")}))))))

(deftest ^:parallel with-template-tags-update-map-order-test
  ;; yes, I know template tags are sorted as a map, but for small maps we should preserve the order passed in by the
  ;; FE. See
  ;; https://metaboat.slack.com/archives/C0645JP1W81/p1759974826834279?thread_ts=1759289751.539169&cid=C0645JP1W81
  (testing "it should be possible to reorder template tags with with-template-tags"
    (let [query         (lib/native-query meta/metadata-provider "{{x}} {{y}} {{z}}")
          original-tags (lib/template-tags query)]
      (is (=? {"x" {}, "y" {}, "z" {}}
              original-tags))
      (is (= ["x" "y" "z"]
             (keys original-tags)))
      (let [updated-tags {"y" (get original-tags "y"), "x" (get original-tags "x")}
            query'       (lib/with-template-tags query updated-tags)]
        (is (= ["y" "x" "z"]
               (keys (lib/template-tags query'))))))))

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
                      vals
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
  (is (= [{:id     "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7",
           :type   :string/=,
           :value  ["foo"],
           :target ["variable" ["template-tag" "mytag"]]}]
         (-> (lib/native-query meta/metadata-provider "select * from venues where {{mytag}}")
             (lib/with-template-tags {"mytag" {:type :text,
                                               :name "mytag",
                                               :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
                                               :display-name "My Tag"}})
             lib/add-parameters-for-template-tags
             :parameters))))

(deftest ^:parallel add-parameters-number-tag-test
  (is (= [{:id     "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7",
           :type   :number/=,
           :value  ["0"],
           :target ["variable" ["template-tag" "mytag"]]}]
         (-> (lib/native-query meta/metadata-provider "select * from venues where {{mytag}}")
             (lib/with-template-tags {"mytag"
                                      {:display-name "My Tag"
                                       :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
                                       :name "mytag"
                                       :type :number}})
             lib/add-parameters-for-template-tags
             :parameters))))

(deftest ^:parallel add-parameters-date-tag-test
  (is (= [{:id     "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7",
           :type   :date/single,
           :value  "1970-01-01",
           :target ["variable" ["template-tag" "mytag"]]}]
         (-> (lib/native-query meta/metadata-provider "select * from venues where {{mytag}}")
             (lib/with-template-tags {"mytag"
                                      {:display-name "My Tag"
                                       :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
                                       :name "mytag"
                                       :type :date}})
             lib/add-parameters-for-template-tags
             :parameters))))

(deftest ^:parallel add-parameters-boolean-tag-test
  (is (= [{:id     "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7",
           :type   :boolean/=,
           :value  [false],
           :target ["variable" ["template-tag" "mytag"]]}]
         (-> (lib/native-query meta/metadata-provider "select * from venues where {{mytag}}")
             (lib/with-template-tags {"mytag"
                                      {:display-name "My Tag"
                                       :id "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7"
                                       :name "mytag"
                                       :type :boolean}})
             lib/add-parameters-for-template-tags
             :parameters))))

(deftest ^:parallel add-parameters-string-dimension-tag-test
  (is (= [{:id     "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7",
           :type   :string/=,
           :value  ["foo"],
           :target ["dimension" ["template-tag" "mytag"]]}]
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
  (is (= [{:id     "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7",
           :type   :number/=,
           :value  ["0"],
           :target ["dimension" ["template-tag" "mytag"]]}]
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
  (is (= [{:id     "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7",
           :type   :date/single,
           :value  "2025-01-01",
           :target ["dimension" ["template-tag" "mytag"]]}]
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
  (is (= [{:id     "9ae1ea5e-ac33-4574-bc95-ff595b0ac1a7",
           :type   :temporal-unit,
           :value  "week",
           :target ["dimension" ["template-tag" "mytag"]]}]
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
        template-tag (get (lib.native/template-tags base-query) "table")]
    (lib.native/with-template-tags base-query
      {"table" (merge template-tag {:type :table} template-tag-overrides)})))

(deftest ^:parallel basic-native-query-table-references-test
  (testing "should find id-based native query table references"
    (let [table (meta/table-metadata :orders)]
      (is (= #{{:table (:name table)
                :schema (:schema table)}}
             (lib.native/native-query-table-references
              (table-tag-query meta/metadata-provider {:table-id (meta/id :orders)})))))))

(deftest ^:parallel alias-native-query-table-references-test
  (testing "alias-only table tags do not produce table references (table may not exist in DB)"
    (is (= #{}
           (lib.native/native-query-table-references
            (table-tag-query meta/metadata-provider {:alias "my_schema.my_table"}))))))

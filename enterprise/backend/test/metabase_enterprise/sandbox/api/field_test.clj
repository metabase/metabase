(ns metabase-enterprise.sandbox.api.field-test
  "Tests for special behavior of `/api/metabase/field` endpoints in the Metabase Enterprise Edition."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.test-util :as mt.tu]
   [metabase-enterprise.test :as met]
   [metabase.models :refer [Field FieldValues User]]
   [metabase.models.field-values :as field-values]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest fetch-field-test
  (testing "GET /api/field/:id"
    (met/with-gtaps! {:gtaps      {:venues {:query      (mt.tu/restricted-column-query (mt/id))
                                            :remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}}}
                      :attributes {:cat 50}}
      (testing "Can I fetch a Field that I don't have read access for if I have segmented table access for it?"
        (let [result (mt/user-http-request :rasta :get 200 (str "field/" (mt/id :venues :name)))]
          (is (map? result))
          (is (= {:name             "NAME"
                  :display_name     "Name"
                  :has_field_values "list"}
                 (select-keys result [:name :display_name :has_field_values]))))))))

(deftest field-values-test
  (testing "GET /api/field/:id/values"
    (mt/with-temp-copy-of-db
      (doseq [[query-type gtap-rule]
              [["MBQL"
                {:gtaps      {:venues {:query      (mt.tu/restricted-column-query (mt/id))
                                       :remappings {:cat [:dimension (mt/id :venues :category_id)]}}}
                 :attributes {:cat 50}}]
               ["native"
                {:gtaps      {:venues {:query
                                       (mt/native-query
                                         {:query "SELECT id, name, category_id FROM venues WHERE category_id = {{cat}}"
                                          :template-tags {"cat" {:id           "__MY_CAT__"
                                                                 :name         "cat"
                                                                 :display-name "Cat id"
                                                                 :type         :number}}})
                                       :remappings {:cat [:variable [:template-tag "cat"]]}}}
                 :attributes {:cat 50}}]]]
        (testing (format "GTAP rule is a %s query" query-type)
          (met/with-gtaps! gtap-rule
            (testing (str "When I call the FieldValues API endpoint for a Field that I have segmented table access only "
                          "for, will I get ad-hoc values?\n")
              (letfn [(fetch-values [user field]
                        (-> (mt/user-http-request user :get 200 (format "field/%d/values" (mt/id :venues field)))
                            (update :values (partial take 3))))]
                ;; Rasta Toucan is only allowed to see Venues that are in the "Mexican" category [category_id = 50]. When
                ;; fetching FieldValues for `venue.name` should do an ad-hoc fetch and only return the names of venues in
                ;; that category.
                (is (= {:field_id        (mt/id :venues :name)
                        :values          [["Garaje"]
                                          ["Gordo Taqueria"]
                                          ["La Tortilla"]]
                        :has_more_values false}
                       (fetch-values :rasta :name)))

                (testing (str "Now in this case recall that the `restricted-column-query` GTAP we're using does *not* include "
                              "`venues.price` in the results. (Toucan isn't allowed to know the number of dollar signs!) So "
                              "make sure if we try to fetch the field values instead of seeing `[[1] [2] [3] [4]]` we get no "
                              "results")
                  (is (= {:field_id        (mt/id :venues :price)
                          :values          []
                          :has_more_values false}
                         (fetch-values :rasta :price))))

                (testing "Reset field values; if another User fetches them first, do I still see sandboxed values? (metabase/metaboat#128)"
                  (field-values/clear-field-values-for-field! (mt/id :venues :name))
                  ;; fetch Field values with an admin
                  (testing "Admin should see all Field values"
                    (is (= {:field_id        (mt/id :venues :name)
                            :values          [["20th Century Cafe"]
                                              ["25°"]
                                              ["33 Taps"]]
                            :has_more_values false}
                           (fetch-values :crowberto :name))))
                  (testing "Sandboxed User should still see only their values after an admin fetches the values"
                    (is (= {:field_id        (mt/id :venues :name)
                            :values          [["Garaje"]
                                              ["Gordo Taqueria"]
                                              ["La Tortilla"]]
                            :has_more_values false}
                           (fetch-values :rasta :name))))
                  (testing "A User with a *different* sandbox should see their own values"
                    (let [password (mt/random-name)]
                      (t2.with-temp/with-temp [User another-user {:password password}]
                        (met/with-gtaps-for-user! another-user {:gtaps      {:venues
                                                                             {:remappings
                                                                              {:cat
                                                                               [:dimension (mt/id :venues :category_id)]}}}
                                                                :attributes {:cat 5 #_BBQ}}
                          (is (= {:field_id        (mt/id :venues :name)
                                  :values          [["Baby Blues BBQ"]
                                                    ["Bludso's BBQ"]
                                                    ["Boneyard Bistro"]]
                                  :has_more_values false}
                                 (-> (mt/client {:username (:email another-user), :password password}
                                                :get 200
                                                (format "field/%d/values" (mt/id :venues :name)))
                                     (update :values (partial take 3))))))))))))))))))

(deftest human-readable-values-test
  (testing "GET /api/field/:id/values should returns correct human readable mapping if exists"
    (mt/with-temp-copy-of-db
      (let [field-id   (mt/id :venues :price)
            full-fv-id (t2/select-one-pk FieldValues :field_id field-id :type :full)]
        (t2/update! FieldValues full-fv-id
                    {:human_readable_values ["$" "$$" "$$$" "$$$$"]})
        ;; sanity test without gtap
        (is (= [[1 "$"] [2 "$$"] [3 "$$$"] [4 "$$$$"]]
               (:values (mt/user-http-request :rasta :get 200 (format "field/%d/values" field-id)))))
        (met/with-gtaps! {:gtaps      {:venues
                                       {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}}}
                          :attributes {:cat 4}}
          (is (= [[1 "$"] [3 "$$$"]]
                 (:values (mt/user-http-request :rasta :get 200 (format "field/%d/values" (mt/id :venues :price)))))))))))

(deftest search-test
  (testing "GET /api/field/:id/search/:search-id"
    (met/with-gtaps! {:gtaps      {:venues
                                   {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}
                                    :query      (mt.tu/restricted-column-query (mt/id))}}
                      :attributes {:cat 50}}
      (testing (str "Searching via the query builder needs to use a GTAP when the user has segmented permissions. "
                    "This tests out a field search on a table with segmented permissions")
        ;; Rasta Toucan is only allowed to see Venues that are in the "Mexican" category [category_id = 50]. So
        ;; searching whould only include venues in that category
        (let [url (format "field/%s/search/%s" (mt/id :venues :name) (mt/id :venues :name))]
          (is (= [["Gordo Taqueria"]
                  ["Tacos Villa Corona"]
                  ["Taqueria Los Coyotes"]
                  ["Taqueria San Francisco"]
                  ["Tito's Tacos"]
                  ["Yuca's Taqueria"]]
                 (mt/user-http-request :rasta :get 200 url :value "Ta"))))))))

(deftest caching-test
  (met/with-gtaps! {:gtaps
                    {:venues
                     {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}
                      :query      (mt.tu/restricted-column-query (mt/id))}}
                    :attributes {:cat 50}}
    (let [field (t2/select-one Field :id (mt/id :venues :name))]
      ;; Make sure FieldValues are populated
      (field-values/get-or-create-full-field-values! field)
      ;; Warm up the cache
      (mt/user-http-request :rasta :get 200 (str "field/" (:id field) "/values"))
      (testing "Do we use cached values when available?"
        (with-redefs [field-values/distinct-values (fn [_] (assert false "Should not be called"))]
          (is (some? (:values (mt/user-http-request :rasta :get 200 (str "field/" (:id field) "/values")))))
          (is (= 1 (t2/count FieldValues
                             :field_id (:id field)
                             :type :sandbox)))))

      (testing "Do different users has different sandbox FieldValues"
        (let [password (mt/random-name)]
          (t2.with-temp/with-temp [User another-user {:password password}]
            (met/with-gtaps-for-user! another-user {:gtaps      {:venues
                                                                 {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}
                                                                  :query      (mt.tu/restricted-column-query (mt/id))}}
                                                    :attributes {:cat 5}}
              (mt/user-http-request another-user :get 200 (str "field/" (:id field) "/values"))
              ;; create another one for the new user
              (is (= 2 (t2/count FieldValues
                                 :field_id (:id field)
                                 :type :sandbox)))))))

      (testing "Do we invalidate the cache when full FieldValues change"
        (try
          (let [ ;; Updating FieldValues which should invalidate the cache
                fv-id      (t2/select-one-pk FieldValues :field_id (:id field) :type :full)
                new-values ["foo" "bar"]]
            (testing "Sanity check: make sure FieldValues exist"
              (is (some? fv-id)))
            (t2/update! FieldValues fv-id
                        {:values new-values})
            (with-redefs [field-values/distinct-values (constantly {:values          (map vector new-values)
                                                                    :has_more_values false})]
              (is (= (map vector new-values)
                     (:values (mt/user-http-request :rasta :get 200 (str "field/" (:id field) "/values")))))))
          (finally
            ;; Put everything back as it was
            (field-values/get-or-create-full-field-values! field))))

      (testing "When a sandbox fieldvalues expired, do we delete it then create a new one?"
        (#'field-values/clear-advanced-field-values-for-field! field)
        ;; make sure we have a cache
        (mt/user-http-request :rasta :get 200 (str "field/" (:id field) "/values"))
        (let [old-sandbox-fv-id (t2/select-one-pk FieldValues :field_id (:id field) :type :sandbox)]
          (with-redefs [field-values/advanced-field-values-expired? (fn [fv]
                                                                      (= (:id fv) old-sandbox-fv-id))]
            (mt/user-http-request :rasta :get 200 (str "field/" (:id field) "/values"))
            ;; did the old one get deleted?
            (is (not (t2/exists? FieldValues :id old-sandbox-fv-id)))
            ;; make sure we created a new one
            (is (= 1 (t2/count FieldValues :field_id (:id field) :type :sandbox)))))))))

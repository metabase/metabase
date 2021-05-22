(ns metabase-enterprise.sandbox.api.field-test
  "Tests for special behavior of `/api/metabase/field` endpoints in the Metabase Enterprise Edition."
  (:require [clojure.test :refer :all]
            [metabase-enterprise.sandbox.test-util :as mt.tu]
            [metabase.models :refer [Field User]]
            [metabase.models.field-values :as field-values :refer [FieldValues]]
            [metabase.test :as mt]
            [toucan.db :as db]))

(deftest fetch-field-test
  (testing "GET /api/field/:id"
    (mt/with-gtaps {:gtaps      {:venues {:query      (mt.tu/restricted-column-query (mt/id))
                                          :remappings {:cat [:variable [:field-id (mt/id :venues :category_id)]]}}}
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
    (mt/with-gtaps {:gtaps      {:venues {:query      (mt.tu/restricted-column-query (mt/id))
                                          :remappings {:cat [:dimension (mt/id :venues :category_id)]}}}
                    :attributes {:cat 50}}
      (testing (str "When I call the FieldValues API endpoint for a Field that I have segmented table access only "
                    "for, will I get ad-hoc values?\n")
        (letfn [(fetch-values [user field]
                  (-> (mt/user-http-request user :get 200 (format "field/%d/values" (mt/id :venues field)))
                      (update :values (partial take 3))))]
          ;; Rasta Toucan is only allowed to see Venues that are in the "Mexican" category [category_id = 50]. So
          ;; fetching FieldValues for `venue.name` should do an ad-hoc fetch and only return the names of venues in
          ;; that category.
          (is (= {:field_id (mt/id :venues :name)
                  :values   [["Garaje"]
                             ["Gordo Taqueria"]
                             ["La Tortilla"]]}
                 (fetch-values :rasta :name)))

          (testing (str "Now in this case recall that the `restricted-column-query` GTAP we're using does *not* include "
                        "`venues.price` in the results. (Toucan isn't allowed to know the number of dollar signs!) So "
                        "make sure if we try to fetch the field values instead of seeing `[[1] [2] [3] [4]]` we get no "
                        "results")
            (is (= {:field_id (mt/id :venues :price)
                    :values   []}
                   (fetch-values :rasta :price))))

          (testing "Reset field values; if another User fetches them first, do I still see sandboxed values? (metabase/metaboat#128)"
            (field-values/clear-field-values! (mt/id :venues :name))
            ;; fetch Field values with an admin
            (testing "Admin should see all Field values"
              (is (= {:field_id (mt/id :venues :name)
                      :values   [["20th Century Cafe"]
                                 ["25°"]
                                 ["33 Taps"]]}
                     (fetch-values :crowberto :name))))
            (testing "Sandboxed User should still see only their values after an admin fetches the values"
              (is (= {:field_id (mt/id :venues :name)
                      :values   [["Garaje"]
                                 ["Gordo Taqueria"]
                                 ["La Tortilla"]]}
                     (fetch-values :rasta :name))))
            (testing "A User with a *different* sandbox should see their own values"
              (let [password (mt/random-name)]
                (mt/with-temp User [another-user {:password password}]
                  (mt/with-gtaps-for-user another-user {:gtaps      {:venues
                                                                     {:remappings
                                                                      {:cat
                                                                       [:dimension (mt/id :venues :category_id)]}}}
                                                        :attributes {:cat 5 #_BBQ}}
                    (is (= {:field_id (mt/id :venues :name)
                            :values   [["Baby Blues BBQ"]
                                       ["Bludso's BBQ"]
                                       ["Boneyard Bistro"]]}
                           (-> (mt/client {:username (:email another-user), :password password}
                                          :get 200
                                          (format "field/%d/values" (mt/id :venues :name)))
                               (update :values (partial take 3)))))))))))))))

(deftest search-test
  (testing "GET /api/field/:id/search/:search-id"
    (mt/with-gtaps {:gtaps      {:venues
                                 {:remappings {:cat [:variable [:field-id (mt/id :venues :category_id)]]}
                                  :query      (mt.tu/restricted-column-query (mt/id))}}
                    :attributes {:cat 50}}
      (testing (str "Searching via the query builder needs to use a GTAP when the user has segmented permissions. "
                    "This tests out a field search on a table with segmented permissions")
        ;; Rasta Toucan is only allowed to see Venues that are in the "Mexican" category [category_id = 50]. So
        ;; searching whould only include venues in that category
        (let [url (format "field/%s/search/%s" (mt/id :venues :name) (mt/id :venues :name))]
          (is (= [["Gordo Taqueria"         "Gordo Taqueria"]
                  ["Tacos Villa Corona"     "Tacos Villa Corona"]
                  ["Taqueria Los Coyotes"   "Taqueria Los Coyotes"]
                  ["Taqueria San Francisco" "Taqueria San Francisco"]
                  ["Tito's Tacos"           "Tito's Tacos"]
                  ["Yuca's Taqueria"        "Yuca's Taqueria"]]
                 (mt/user-http-request :rasta :get 200 url :value "Ta"))))))))

(deftest caching-test
  (mt/with-gtaps {:gtaps
                  {:venues
                   {:remappings {:cat [:variable [:field-id (mt/id :venues :category_id)]]}
                    :query      (mt.tu/restricted-column-query (mt/id))}}
                  :attributes {:cat 50}}
    (let [field (Field (mt/id :venues :name))]
      ;; Make sure FieldValues are populated
      (field-values/get-or-create-field-values! field)
      ;; Warm up the cache
      (mt/user-http-request :rasta :get 200 (str "field/" (mt/id :venues :name) "/values"))
      (testing "Do we use cached values when available?"
        (with-redefs [field-values/distinct-values (fn [_] (assert false "Should not be called"))]
          (is (some? (:values (mt/user-http-request :rasta :get 200 (str "field/" (mt/id :venues :name) "/values")))))))
      (testing "Do we invalidate the cache when FieldValues change"
        (try
          (let [ ;; Updating FieldValues which should invalidate the cache
                fv-id          (db/select-one-id FieldValues :field_id (mt/id :venues :name))
                old-updated-at (db/select-one-field :updated_at FieldValues :field_id (mt/id :venues :name))
                new-values     ["foo" "bar"]]
            (testing "Sanity check: make sure FieldValues exist"
              (is (some? fv-id)))
            (db/update! FieldValues fv-id
              {:values new-values})
            (testing "Sanity check: make sure updated_at has been updated"
              (is (not= (db/select-one-field :updated_at FieldValues :field_id (mt/id :venues :name))
                        old-updated-at)))
            (with-redefs [field-values/distinct-values (constantly new-values)]
              (is (= (map vector new-values)
                     (:values (mt/user-http-request :rasta :get 200 (str "field/" (mt/id :venues :name) "/values")))))))
          (finally
            ;; Put everything back as it was
            (field-values/get-or-create-field-values! field)))))))

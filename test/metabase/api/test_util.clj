(ns metabase.api.test-util
  "Utilities for writing API tests."
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn select-query-metadata-keys-for-debugging
  "Select a subset of keys from `query-metadata-result` to help debugging failed test assertions.

  `query-metadata-result` should be the result of some call to one of the query_metadata endpoints that return these
  keys: :fields, :databases, :tables.

  At time of writing, these endpoints include:

    GET  dashboard/:id/query_metadata
    GET  card/:id/query_metadata
    POST dataset/query_metadata"
  [query-metadata-result]
  (cond-> query-metadata-result
    ;; If query-metadata-result is not a map, then probably the API call that produced it failed and returned a
    ;; different type, like "Not found" for a 404. In such cases, don't attempt to update the keys, which will throw an
    ;; exception and obscure the true failure. If it is a map, select specific keys to make the output easier to debug.
    (map? query-metadata-result) (-> (update :fields #(map (fn [x] (select-keys x [:id])) %))
                                     (update :databases #(map (fn [x] (select-keys x [:id :engine])) %))
                                     (update :tables #(map (fn [x] (select-keys x [:id :name])) %)))))

(defn before-and-after-deleted-card
  "Helper for testing behavior before and after deleting a card.

  Performs the following actions:

  1. Archive `card-id`
  2. Run the `before-delete` thunk
  3. Delete `card-id`
  4. Run the `after-delete` thunk"
  [card-id
   before-delete
   after-delete]
  (testing "Archive card"
    (is (=?
         {:archived    true
          :can_delete  true
          :id          card-id}
         (-> (mt/user-http-request :crowberto :put 200 (str "card/" card-id) {:archived true})))))

  (before-delete)

  (testing "Delete card"
    (is (nil? (mt/user-http-request :crowberto :delete 204 (str "card/" card-id)))))

  (after-delete))

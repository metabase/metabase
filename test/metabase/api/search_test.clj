(ns metabase.api.search-test
  (:require [expectations :refer :all]
            [metabase.models
             [card :refer [Card]]
             [card-favorite :refer [CardFavorite]]
             [collection :as coll :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [dashboard-favorite :refer [DashboardFavorite]]
             [metric :refer [Metric]]
             [permissions :as perms]
             [permissions-group :as group]
             [pulse :refer [Pulse]]
             [segment :refer [Segment]]]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :as tu]
            [toucan.util.test :as tt]))

(def ^:private default-search-results
  (set (map #(merge {:description nil, :id true, :collection_id false,
                     :collection_position nil, :archived false, :favorited nil} %)
            [{:name "dashboard foo dashboard", :type "dashboard"}
             {:name "collection foo collection", :type "collection", :collection_id true}
             {:name "card foo card", :type "card"}
             {:name "pulse foo pulse", :type "pulse", :archived nil}
             {:name "metric foo metric", :description "Lookin' for a blueberry", :type "metric"}
             {:name "segment foo segment", :description "Lookin' for a blueberry", :type "segment"}])))

(def ^:private default-archived-results
  (set (for [result default-search-results
             :when (false? (:archived result))]
         (assoc result :archived true))))

(defn- on-search-types [types-set f coll]
  (set (for [search-item coll]
         (if (contains? types-set (:type search-item))
           (f search-item)
           search-item))))

(def ^:private default-results-with-collection
  (on-search-types #{"dashboard" "pulse" "card"}
                   #(assoc % :collection_id true)
                   default-search-results))

;; Basic search, should find 1 of each entity type
(expect
  default-search-results
  (tt/with-temp* [Card       [_ {:name "card foo card"}]
                  Dashboard  [_ {:name "dashboard foo dashboard"}]
                  Collection [_ {:name "collection foo collection"}]
                  Pulse      [_ {:name "pulse foo pulse"}]
                  Metric     [_ {:name "metric foo metric"}]
                  Segment    [_ {:name "segment foo segment"}]]
    (tu/boolean-ids-and-timestamps (set ((user->client :crowberto) :get 200 "search", :q "foo")))))

;; Favorites are per user, so other user's favorites don't cause search results to be favorited
(expect
  default-search-results
  (tt/with-temp* [Card       [{card-id :id} {:name "card foo card"}]
                  CardFavorite  [_ {:card_id card-id
                                    :owner_id (user->id :rasta)}]
                  Dashboard  [{dash-id :id} {:name "dashboard foo dashboard"}]
                  DashboardFavorite [_ {:dashboard_id dash-id
                                        :user_id (user->id :rasta)}]
                  Collection [_ {:name "collection foo collection"}]
                  Pulse      [_ {:name "pulse foo pulse"}]
                  Metric     [_ {:name "metric foo metric"}]
                  Segment    [_ {:name "segment foo segment"}]]
    (tu/boolean-ids-and-timestamps (set ((user->client :crowberto) :get 200 "search", :q "foo")))))

;; Basic search, should find 1 of each entity type and include favorites when available
(expect
  (on-search-types #{"dashboard" "card"}
                   #(assoc % :favorited true)
                   default-search-results)
  (tt/with-temp* [Card       [{card-id :id} {:name "card foo card"}]
                  CardFavorite  [_ {:card_id card-id
                                    :owner_id (user->id :crowberto)}]
                  Dashboard  [{dash-id :id} {:name "dashboard foo dashboard"}]
                  DashboardFavorite [_ {:dashboard_id dash-id
                                        :user_id (user->id :crowberto)}]
                  Collection [_ {:name "collection foo collection"}]
                  Pulse      [_ {:name "pulse foo pulse"}]
                  Metric     [_ {:name "metric foo metric"}]
                  Segment    [_ {:name "segment foo segment"}]]
    (tu/boolean-ids-and-timestamps (set ((user->client :crowberto) :get 200 "search", :q "foo")))))

;; Basic search should only return substring matches
(expect
  default-search-results
  (tt/with-temp* [Card       [_ {:name "card foo card"}]
                  Card       [_ {:name "card bar card"}]
                  Dashboard  [_ {:name "dashboard foo dashboard"}]
                  Dashboard  [_ {:name "dashboard bar dashboard"}]
                  Collection [_ {:name "collection foo collection"}]
                  Collection [_ {:name "collection bar collection"}]
                  Pulse      [_ {:name "pulse foo pulse"}]
                  Pulse      [_ {:name "pulse bar pulse"}]
                  Metric     [_ {:name "metric foo metric"}]
                  Metric     [_ {:name "metric bar metric"}]
                  Segment    [_ {:name "segment foo segment"}]
                  Segment    [_ {:name "segment bar segment"}]]
    (tu/boolean-ids-and-timestamps (set ((user->client :crowberto) :get 200 "search", :q "foo")))))

(defn- archived [m]
  (assoc m :archived true))

;; Should return unarchived results by default
(expect
  default-search-results
  (tt/with-temp* [Card       [_ {:name "card foo card"}]
                  Card       [_ (archived {:name "card foo card2"})]
                  Dashboard  [_ {:name "dashboard foo dashboard"}]
                  Dashboard  [_ (archived {:name "dashboard foo dashboard2"})]
                  Collection [_ {:name "collection foo collection"}]
                  Collection [_ (archived  {:name "collection foo collection2"})]
                  Pulse      [_ {:name "pulse foo pulse"}]
                  Metric     [_ {:name "metric foo metric"}]
                  Metric     [_ (archived {:name "metric foo metric2"})]
                  Segment    [_ {:name "segment foo segment"}]
                  Segment    [_ (archived {:name "segment foo segment2"})]]
    (tu/boolean-ids-and-timestamps (set ((user->client :crowberto) :get 200 "search", :q "foo")))))

;; Should return archived results when specified
(expect
  default-archived-results
  (tt/with-temp* [Card       [_ (archived {:name "card foo card"})]
                  Card       [_ {:name "card foo card2"}]
                  Dashboard  [_ (archived {:name "dashboard foo dashboard"})]
                  Dashboard  [_ {:name "dashboard foo dashboard2"}]
                  Collection [_ (archived {:name "collection foo collection"})]
                  Collection [_ {:name "collection foo collection2"}]
                  Pulse      [_ {:name "pulse foo pulse"}]
                  Metric     [_ (archived {:name "metric foo metric"})]
                  Metric     [_ {:name "metric foo metric2"}]
                  Segment    [_ (archived {:name "segment foo segment"})]
                  Segment    [_ {:name "segment foo segment2"}]]
    (tu/boolean-ids-and-timestamps (set ((user->client :crowberto) :get 200 "search",
                                         :q "foo", :archived "true")))))

;; Search within a collection will omit the collection, only return cards/dashboards/pulses in the collection
(expect
  ;; Metrics and segments don't have a collection, so they shouldn't be included in the results
  (set (remove (comp #{"collection" "metric" "segment"} :type) default-results-with-collection))
  (tt/with-temp* [Collection [{coll-id :id} {:name "collection foo collection"}]
                  Card       [_ {:name "card foo card", :collection_id coll-id}]
                  Card       [_ {:name "card foo card2"}]
                  Dashboard  [_ {:name "dashboard foo dashboard", :collection_id coll-id}]
                  Dashboard  [_ {:name "dashboard bar dashboard2"}]
                  Pulse      [_ {:name "pulse foo pulse", :collection_id coll-id}]
                  Pulse      [_ {:name "pulse foo pulse2"}]
                  Metric     [_ {:name "metric foo metric"}]
                  Segment    [_ {:name "segment foo segment"}]]
    (tu/boolean-ids-and-timestamps (set ((user->client :crowberto) :get 200 "search", :q "foo", :collection_id coll-id)))))

;; Querying for a collection you don't have access to just returns empty
(expect
  []
  (tt/with-temp* [Collection [coll-1          {:name "collection 1"}]
                  Collection [{coll-2-id :id} {:name "collection 2"}]]
    (perms/grant-collection-read-permissions! (group/all-users) coll-1)
    ((user->client :rasta) :get 200 "search", :q "foo", :collection_id coll-2-id)))

;; Users with access to a collection should be able to search it
(expect
  ;; Metrics and segments don't have a collection, so they shouldn't be included in the results
  (set (remove (comp #{"collection" "metric" "segment"} :type) default-results-with-collection))
  (tt/with-temp* [Collection [{coll-id :id, :as coll} {:name "collection foo collection"}]
                  Card       [_ {:name "card foo card", :collection_id coll-id}]
                  Card       [_ {:name "card foo card2"}]
                  Dashboard  [_ {:name "dashboard foo dashboard", :collection_id coll-id}]
                  Dashboard  [_ {:name "dashboard bar dashboard2"}]
                  Pulse      [_ {:name "pulse foo pulse", :collection_id coll-id}]
                  Pulse      [_ {:name "pulse foo pulse2"}]
                  Metric     [_ {:name "metric foo metric"}]
                  Segment    [_ {:name "segment foo segment"}]]
    (perms/grant-collection-read-permissions! (group/all-users) coll)
    (tu/boolean-ids-and-timestamps (set ((user->client :rasta) :get 200 "search", :q "foo", :collection_id coll-id)))))

;; Collections a user doesn't have access to are automatically omitted from the results
(expect
  default-results-with-collection
  (tt/with-temp* [Collection [{coll-id-1 :id, :as coll-1} {:name "collection foo collection"}]
                  Collection [{coll-id-2 :id, :as coll-2} {:name "collection foo collection2"}]
                  Card       [_ {:name "card foo card", :collection_id coll-id-1}]
                  Card       [_ {:name "card foo card2", :collection_id coll-id-2}]
                  Dashboard  [_ {:name "dashboard foo dashboard", :collection_id coll-id-1}]
                  Dashboard  [_ {:name "dashboard bar dashboard2", :collection_id coll-id-2}]
                  Pulse      [_ {:name "pulse foo pulse", :collection_id coll-id-1}]
                  Pulse      [_ {:name "pulse foo pulse2", :collection_id coll-id-2}]
                  Metric     [_ {:name "metric foo metric"}]
                  Segment    [_ {:name "segment foo segment"}]]
    (perms/grant-collection-read-permissions! (group/all-users) coll-1)
    (tu/boolean-ids-and-timestamps (set ((user->client :rasta) :get 200 "search", :q "foo")))))

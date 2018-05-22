(ns metabase.query-processor.expand-resolve-test
  "Tests query expansion/resolution"
  (:require [clojure.string :as str]
            [expectations :refer :all]
            [metabase
             [query-processor :as qp]
             [util :as u]]
            [metabase.query-processor.middleware
             [expand :as ql]
             [resolve :as resolve]
             [source-table :as source-table]]
            [metabase.query-processor-test :as qpt]
            [metabase.test
             [data :as data :refer :all]
             [util :as tu]]
            [metabase.test.data.dataset-definitions :as defs]
            [metabase.util.date :as du]))

;; this is here because expectations has issues comparing and object w/ a map and most of the output
;; below has objects for the various place holders in the expanded/resolved query
(defn- obj->map [o]
  (cond
    (sequential? o) (vec (for [v o]
                           (obj->map v)))
    (set? o)        (set (for [v o]
                           (obj->map v)))
    (map? o)        (into {} (for [[k v] o]
                               {k (obj->map v)}))
    :else           o))

(def ^:private resolve'
  "Testing the resolve middleware requires that the source table be
  resolved before calling the resolve function. In the query pipeline
  this is two separate steps. This function combines the function for
  resolving the source table and the middleware that resolves the rest
  of the expanded query into a single function to make tests more
  concise."
  (comp resolve/resolve (source-table/resolve-source-table-middleware identity)))

(def ^:private field-ph-defaults
  {:fk-field-id        nil
   :datetime-unit      nil
   :remapped-from      nil
   :remapped-to        nil
   :field-display-name nil
   :binning-strategy   nil
   :binning-param      nil})

(def ^:private field-defaults
  {:fk-field-id     nil
   :visibility-type :normal
   :position        nil
   :description     nil
   :parent-id       nil
   :parent          nil
   :schema-name     nil
   :remapped-from   nil
   :remapped-to     nil
   :dimensions      []
   :values          []})

(def ^:private price-field-values
  {:field-value-id        true
   :created-at            true
   :updated-at            true
   :values                [1 2 3 4]
   :human-readable-values {}
   :field-id              true})

;; basic rows query w/ filter
(expect
  [ ;; expanded form
   {:database (id)
    :type     :query
    :query    {:source-table (id :venues)
               :filter       {:filter-type :>
                              :field       (merge field-ph-defaults
                                                  {:field-id true})
                              :value       {:field-placeholder (merge field-ph-defaults
                                                                      {:field-id true})
                                            :value             1}}}}
   ;; resolved form
   {:database (id)
    :type     :query
    :query    {:source-table {:schema "PUBLIC"
                              :name   "VENUES"
                              :id     true}
               :filter       {:filter-type :>
                              :field       (merge field-defaults
                                                  {:field-id           true
                                                   :field-name         "PRICE"
                                                   :field-display-name "Price"
                                                   :database-type      "INTEGER"
                                                   :base-type          :type/Integer
                                                   :special-type       :type/Category
                                                   :table-id           (id :venues)
                                                   :schema-name        "PUBLIC"
                                                   :table-name         "VENUES"
                                                   :values             price-field-values
                                                   :fingerprint        {:global {:distinct-count 4}
                                                                        :type   {:type/Number {:min 1, :max 4, :avg 2.03}}}})
                              :value       {:value 1
                                            :field (merge field-defaults
                                                          {:field-id           true
                                                           :field-name         "PRICE"
                                                           :field-display-name "Price"
                                                           :database-type      "INTEGER"
                                                           :base-type          :type/Integer
                                                           :special-type       :type/Category
                                                           :table-id           (id :venues)
                                                           :schema-name        "PUBLIC"
                                                           :table-name         "VENUES"
                                                           :values             price-field-values
                                                           :fingerprint        {:global {:distinct-count 4}
                                                                                :type   {:type/Number {:min 1, :max 4, :avg 2.03}}}})}}


               :join-tables nil}
    :fk-field-ids #{}
    :table-ids    #{(id :venues)}}]
  (let [expanded-form (ql/expand (wrap-inner-query (query venues
                                                     (ql/filter (ql/and (ql/> $price 1))))))]
    (tu/boolean-ids-and-timestamps
     (mapv obj->map [expanded-form
                     (resolve' expanded-form)]))))

(def category-field-values
  {:values                (defs/field-values defs/test-data-map "categories" "name")
   :human-readable-values {}
   :field-value-id        true
   :field-id              true
   :created-at            true
   :updated-at            true})

;; basic rows query w/ FK filter
(expect
  [ ;; expanded form
   {:database (id)
    :type     :query
    :query    {:source-table (id :venues)
               :filter       {:filter-type :=
                              :field       (merge field-ph-defaults
                                                  {:field-id    true
                                                   :fk-field-id (id :venues :category_id)})
                              :value       {:field-placeholder (merge field-ph-defaults
                                                                      {:field-id    true
                                                                       :fk-field-id (id :venues :category_id)})
                                            :value             "abc"}}}}
   ;; resolved form
   {:database     (id)
    :type         :query
    :query        {:source-table {:schema "PUBLIC"
                                  :name   "VENUES"
                                  :id     true}
                   :filter       {:filter-type :=
                                  :field       (merge field-defaults
                                                      {:field-id           true
                                                       :fk-field-id        (id :venues :category_id)
                                                       :field-name         "NAME"
                                                       :field-display-name "Name"
                                                       :database-type      "VARCHAR"
                                                       :base-type          :type/Text
                                                       :special-type       :type/Name
                                                       :table-id           (id :categories)
                                                       :table-name         "CATEGORIES__via__CATEGORY_ID"
                                                       :values             category-field-values
                                                       :fingerprint        {:global {:distinct-count 75}
                                                                            :type   {:type/Text {:percent-json   0.0
                                                                                                 :percent-url    0.0
                                                                                                 :percent-email  0.0
                                                                                                 :average-length 8.333333333333334}}}})
                                  :value       {:value "abc"
                                                :field (merge field-defaults
                                                              {:field-id           true
                                                               :fk-field-id        (id :venues :category_id)
                                                               :field-name         "NAME"
                                                               :field-display-name "Name"
                                                               :database-type      "VARCHAR"
                                                               :base-type          :type/Text
                                                               :special-type       :type/Name
                                                               :table-id           (id :categories)
                                                               :table-name         "CATEGORIES__via__CATEGORY_ID"
                                                               :values             category-field-values
                                                               :fingerprint        {:global {:distinct-count 75}
                                                                                    :type   {:type/Text {:percent-json   0.0
                                                                                                         :percent-url    0.0
                                                                                                         :percent-email  0.0
                                                                                                         :average-length 8.333333333333334}}}})}}
                   :join-tables  [{:source-field {:field-id   true
                                                  :field-name "CATEGORY_ID"}
                                   :pk-field     {:field-id   true
                                                  :field-name "ID"}
                                   :table-id     (id :categories)
                                   :table-name   "CATEGORIES"
                                   :schema       "PUBLIC"
                                   :join-alias   "CATEGORIES__via__CATEGORY_ID"}]}
    :fk-field-ids #{(id :venues :category_id)}
    :table-ids    #{(id :categories)}}]
  (tu/boolean-ids-and-timestamps
   (let [expanded-form (ql/expand (wrap-inner-query (query venues
                                                           (ql/filter (ql/= $category_id->categories.name
                                                                            "abc")))))]
     (mapv obj->map [expanded-form
                     (resolve' expanded-form)]))))


;; basic rows query w/ FK filter on datetime
(expect
  [ ;; expanded form
   {:database (id)
    :type     :query
    :query    {:source-table (id :checkins)
               :filter       {:filter-type :>
                              :field       (merge field-ph-defaults
                                                  {:field-id      (id :users :last_login)
                                                   :fk-field-id   (id :checkins :user_id)
                                                   :datetime-unit :year})
                              :value       {:field-placeholder (merge field-ph-defaults
                                                                      {:field-id      (id :users :last_login)
                                                                       :fk-field-id   (id :checkins :user_id)
                                                                       :datetime-unit :year})
                                            :value             "1980-01-01"}}}}
   ;; resolved form
   {:database     (id)
    :type         :query
    :query        {:source-table {:schema "PUBLIC"
                                  :name   "CHECKINS"
                                  :id     (id :checkins)}
                   :filter       {:filter-type :>
                                  :field       {:field (merge field-defaults
                                                              {:field-id           (id :users :last_login)
                                                               :fk-field-id        (id :checkins :user_id)
                                                               :field-name         "LAST_LOGIN"
                                                               :field-display-name "Last Login"
                                                               :database-type      "TIMESTAMP"
                                                               :base-type          :type/DateTime
                                                               :special-type       nil
                                                               :table-id           (id :users)
                                                               :table-name         "USERS__via__USER_ID"
                                                               :fingerprint        {:global {:distinct-count 11}
                                                                                    :type   {:type/DateTime {:earliest "2014-01-01T00:00:00.000Z"
                                                                                                             :latest   "2014-12-05T00:00:00.000Z"}}}})
                                                :unit  :year}
                                  :value       {:value (du/->Timestamp #inst "1980-01-01")
                                                :field {:field
                                                        (merge field-defaults
                                                               {:field-id           (id :users :last_login)
                                                                :fk-field-id        (id :checkins :user_id)
                                                                :field-name         "LAST_LOGIN"
                                                                :field-display-name "Last Login"
                                                                :database-type      "TIMESTAMP"
                                                                :base-type          :type/DateTime
                                                                :special-type       nil
                                                                :visibility-type    :normal
                                                                :table-id           (id :users)
                                                                :table-name         "USERS__via__USER_ID"
                                                                :fingerprint        {:global {:distinct-count 11}
                                                                                     :type   {:type/DateTime {:earliest "2014-01-01T00:00:00.000Z"
                                                                                                              :latest   "2014-12-05T00:00:00.000Z"}}}})
                                                        :unit :year}}}
                   :join-tables  [{:source-field {:field-id   (id :checkins :user_id)
                                                  :field-name "USER_ID"}
                                   :pk-field     {:field-id   (id :users :id)
                                                  :field-name "ID"}
                                   :table-id     (id :users)
                                   :table-name   "USERS"
                                   :schema       "PUBLIC"
                                   :join-alias   "USERS__via__USER_ID"}]}
    :fk-field-ids #{(id :checkins :user_id)}
    :table-ids    #{(id :users)}}]
  (qpt/with-h2-db-timezone
    (let [expanded-form (ql/expand (wrap-inner-query (query checkins
                                                       (ql/filter (ql/> (ql/datetime-field $user_id->users.last_login :year)
                                                                        "1980-01-01")))))]
      (mapv obj->map [expanded-form (resolve' expanded-form)]))))


;; sum aggregation w/ datetime breakout
(expect
  [ ;; expanded form
   {:database (id)
    :type     :query
    :query    {:source-table (id :checkins)
               :aggregation  [{:aggregation-type :sum
                               :custom-name      nil
                               :field            (merge field-ph-defaults
                                                        {:field-id    true
                                                         :fk-field-id (id :checkins :venue_id)})}]
               :breakout     [(merge field-ph-defaults
                                     {:field-id      true
                                      :datetime-unit :day-of-week})]}}
   ;; resolved form
   {:database     (id)
    :type         :query
    :query        {:source-table {:schema "PUBLIC"
                                  :name   "CHECKINS"
                                  :id     true}
                   :aggregation  [{:aggregation-type :sum
                                   :custom-name      nil
                                   :field            (merge field-defaults
                                                            {:database-type      "INTEGER"
                                                             :base-type          :type/Integer
                                                             :table-id           (id :venues)
                                                             :special-type       :type/Category
                                                             :field-name         "PRICE"
                                                             :field-display-name "Price"
                                                             :field-id           true
                                                             :fk-field-id        (id :checkins :venue_id)
                                                             :table-name         "VENUES__via__VENUE_ID"
                                                             :values             price-field-values
                                                             :fingerprint        {:global {:distinct-count 4}
                                                                                  :type   {:type/Number {:min 1, :max 4, :avg 2.03}}}})}]
                   :breakout     [{:field (merge field-defaults
                                                 {:database-type      "DATE"
                                                  :base-type          :type/Date
                                                  :table-id           (id :checkins)
                                                  :special-type       nil
                                                  :field-name         "DATE"
                                                  :field-display-name "Date"
                                                  :field-id           true
                                                  :table-name         "CHECKINS"
                                                  :schema-name        "PUBLIC"
                                                  :fingerprint        {:global {:distinct-count 618}
                                                                       :type   {:type/DateTime {:earliest "2013-01-03T00:00:00.000Z"
                                                                                                :latest   "2015-12-29T00:00:00.000Z"}}}})
                                   :unit  :day-of-week}]
                   :join-tables  [{:source-field {:field-id   true
                                                  :field-name "VENUE_ID"}
                                   :pk-field     {:field-id   true
                                                  :field-name "ID"}
                                   :table-id     (id :venues)
                                   :table-name   "VENUES"
                                   :schema       "PUBLIC"
                                   :join-alias   "VENUES__via__VENUE_ID"}]}
    :fk-field-ids #{(id :checkins :venue_id)}
    :table-ids    #{(id :venues) (id :checkins)}}]
  (let [expanded-form (ql/expand (wrap-inner-query (query checkins
                                                          (ql/aggregation (ql/sum $venue_id->venues.price))
                                                          (ql/breakout (ql/datetime-field $checkins.date :day-of-week)))))]
    (tu/boolean-ids-and-timestamps
     (mapv obj->map [expanded-form
                     (resolve' expanded-form)]))))

;; check that a schema invalidation error produces a reasonably-sized exception, < 50 lines.
;; previously the entire schema was being dumped which resulted in a ~5200 line exception (#5978)
(expect
  (-> (qp/process-query
        {:database (data/id)
         :type     :query
         :query    {:source-table (data/id :venues)
                    :filter       [:and nil]}})
      u/pprint-to-str
      str/split-lines
      count
      (< 50)))

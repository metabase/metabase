(ns metabase.query-processor.expand-resolve-test
  "Tests query expansion/resolution"
  (:require [expectations :refer :all]
            (metabase.query-processor [expand :as ql]
                                      [resolve :as resolve])
            [metabase.test.data :refer :all]
            [metabase.util :as u]))


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


;; basic rows query w/ filter
(expect
  [ ;; expanded form
   {:database (id)
    :type     :query
    :query    {:source-table (id :venues)
               :filter       {:filter-type :>
                              :field       {:field-id      (id :venues :price)
                                            :fk-field-id   nil
                                            :datetime-unit nil}
                              :value       {:field-placeholder {:field-id      (id :venues :price)
                                                                :fk-field-id   nil
                                                                :datetime-unit nil}
                                            :value             1}}}}
   ;; resolved form
   {:database     (id)
    :type         :query
    :query        {:source-table {:schema "PUBLIC"
                                  :name   "VENUES"
                                  :id     (id :venues)}
                   :filter       {:filter-type :>
                                  :field       {:field-id           (id :venues :price)
                                                :fk-field-id        nil
                                                :field-name         "PRICE"
                                                :field-display-name "Price"
                                                :base-type          :type/Integer
                                                :special-type       :type/Category
                                                :visibility-type    :normal
                                                :table-id           (id :venues)
                                                :schema-name        "PUBLIC"
                                                :table-name         "VENUES"
                                                :position           nil
                                                :description        nil
                                                :parent-id          nil
                                                :parent             nil}
                                  :value       {:value 1
                                                :field {:field-id           (id :venues :price)
                                                        :fk-field-id        nil
                                                        :field-name         "PRICE"
                                                        :field-display-name "Price"
                                                        :base-type          :type/Integer
                                                        :special-type       :type/Category
                                                        :visibility-type    :normal
                                                        :table-id           (id :venues)
                                                        :schema-name        "PUBLIC"
                                                        :table-name         "VENUES"
                                                        :position           nil
                                                        :description        nil
                                                        :parent-id          nil
                                                        :parent             nil}}}
                   :join-tables  nil}
    :fk-field-ids #{}
    :table-ids    #{(id :venues)}}]
  (let [expanded-form (ql/expand (wrap-inner-query (query venues
                                                        (ql/filter (ql/and (ql/> $price 1))))))]
    (mapv obj->map [expanded-form
                    (resolve/resolve expanded-form)])))


;; basic rows query w/ FK filter
(expect
  [ ;; expanded form
   {:database (id)
    :type     :query
    :query    {:source-table (id :venues)
               :filter       {:filter-type :=
                              :field       {:field-id      (id :categories :name)
                                            :fk-field-id   (id :venues :category_id)
                                            :datetime-unit nil}
                              :value       {:field-placeholder {:field-id      (id :categories :name)
                                                                :fk-field-id   (id :venues :category_id)
                                                                :datetime-unit nil}
                                            :value             "abc"}}}}
   ;; resolved form
   {:database     (id)
    :type         :query
    :query        {:source-table {:schema "PUBLIC"
                                  :name   "VENUES"
                                  :id     (id :venues)}
                   :filter       {:filter-type :=
                                  :field       {:field-id           (id :categories :name)
                                                :fk-field-id        (id :venues :category_id)
                                                :field-name         "NAME"
                                                :field-display-name "Name"
                                                :base-type          :type/Text
                                                :special-type       :type/Name
                                                :visibility-type    :normal
                                                :table-id           (id :categories)
                                                :schema-name        nil
                                                :table-name         "CATEGORIES__via__CATEGORY_ID"
                                                :position           nil
                                                :description        nil
                                                :parent-id          nil
                                                :parent             nil}
                                  :value       {:value "abc"
                                                :field {:field-id           (id :categories :name)
                                                        :fk-field-id        (id :venues :category_id)
                                                        :field-name         "NAME"
                                                        :field-display-name "Name"
                                                        :base-type          :type/Text
                                                        :special-type       :type/Name
                                                        :visibility-type    :normal
                                                        :table-id           (id :categories)
                                                        :schema-name        nil
                                                        :table-name         "CATEGORIES__via__CATEGORY_ID"
                                                        :position           nil
                                                        :description        nil
                                                        :parent-id          nil
                                                        :parent             nil}}}
                   :join-tables  [{:source-field {:field-id   (id :venues :category_id)
                                                  :field-name "CATEGORY_ID"}
                                   :pk-field     {:field-id   (id :categories :id)
                                                  :field-name "ID"}
                                   :table-id     (id :categories)
                                   :table-name   "CATEGORIES"
                                   :schema       "PUBLIC"
                                   :join-alias   "CATEGORIES__via__CATEGORY_ID"}]}
    :fk-field-ids #{(id :venues :category_id)}
    :table-ids    #{(id :categories)}}]
  (let [expanded-form (ql/expand (wrap-inner-query (query venues
                                                        (ql/filter (ql/= $category_id->categories.name
                                                                         "abc")))))]
    (mapv obj->map [expanded-form
                    (resolve/resolve expanded-form)])))


;; basic rows query w/ FK filter on datetime
(expect
  [ ;; expanded form
   {:database (id)
    :type     :query
    :query    {:source-table (id :checkins)
               :filter       {:filter-type :>
                              :field       {:field-id      (id :users :last_login)
                                            :fk-field-id   (id :checkins :user_id)
                                            :datetime-unit :year}
                              :value       {:field-placeholder {:field-id      (id :users :last_login)
                                                                :fk-field-id   (id :checkins :user_id)
                                                                :datetime-unit :year}
                                            :value             "1980-01-01"}}}}
   ;; resolved form
   {:database     (id)
    :type         :query
    :query        {:source-table {:schema "PUBLIC"
                                  :name   "CHECKINS"
                                  :id     (id :checkins)}
                   :filter       {:filter-type :>
                                  :field       {:field {:field-id           (id :users :last_login)
                                                        :fk-field-id        (id :checkins :user_id)
                                                        :field-name         "LAST_LOGIN"
                                                        :field-display-name "Last Login"
                                                        :base-type          :type/DateTime
                                                        :special-type       nil
                                                        :visibility-type    :normal
                                                        :table-id           (id :users)
                                                        :schema-name        nil
                                                        :table-name         "USERS__via__USER_ID"
                                                        :position           nil
                                                        :description        nil
                                                        :parent-id          nil
                                                        :parent             nil}
                                                :unit  :year}
                                  :value       {:value (u/->Timestamp "1980-01-01")
                                                :field {:field {:field-id           (id :users :last_login)
                                                                :fk-field-id        (id :checkins :user_id)
                                                                :field-name         "LAST_LOGIN"
                                                                :field-display-name "Last Login"
                                                                :base-type          :type/DateTime
                                                                :special-type       nil
                                                                :visibility-type    :normal
                                                                :table-id           (id :users)
                                                                :schema-name        nil
                                                                :table-name         "USERS__via__USER_ID"
                                                                :position           nil
                                                                :description        nil
                                                                :parent-id          nil
                                                                :parent             nil}
                                                        :unit  :year}}}
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
  (let [expanded-form (ql/expand (wrap-inner-query (query checkins
                                                        (ql/filter (ql/> (ql/datetime-field $user_id->users.last_login :year)
                                                                         "1980-01-01")))))]
    (mapv obj->map [expanded-form
                    (resolve/resolve expanded-form)])))


;; sum aggregation w/ datetime breakout
(expect
  [ ;; expanded form
   {:database (id)
    :type     :query
    :query    {:source-table (id :checkins)
               :aggregation  [{:aggregation-type :sum
                               :custom-name      nil
                               :field            {:field-id      (id :venues :price)
                                                  :fk-field-id   (id :checkins :venue_id)
                                                  :datetime-unit nil}}]
               :breakout     [{:field-id      (id :checkins :date)
                               :fk-field-id   nil
                               :datetime-unit :day-of-week}]}}
   ;; resolved form
   {:database     (id)
    :type         :query
    :query        {:source-table {:schema "PUBLIC"
                                  :name   "CHECKINS"
                                  :id     (id :checkins)}
                   :aggregation  [{:aggregation-type :sum
                                   :custom-name      nil
                                   :field            {:description        nil
                                                      :base-type          :type/Integer
                                                      :parent             nil
                                                      :table-id           (id :venues)
                                                      :special-type       :type/Category
                                                      :field-name         "PRICE"
                                                      :field-display-name "Price"
                                                      :parent-id          nil
                                                      :visibility-type    :normal
                                                      :position           nil
                                                      :field-id           (id :venues :price)
                                                      :fk-field-id        (id :checkins :venue_id)
                                                      :table-name         "VENUES__via__VENUE_ID"
                                                      :schema-name        nil}}]
                   :breakout     [{:field {:description        nil
                                           :base-type          :type/Date
                                           :parent             nil
                                           :table-id           (id :checkins)
                                           :special-type       nil
                                           :field-name         "DATE"
                                           :field-display-name "Date"
                                           :parent-id          nil
                                           :visibility-type    :normal
                                           :position           nil
                                           :field-id           (id :checkins :date)
                                           :fk-field-id        nil
                                           :table-name         "CHECKINS"
                                           :schema-name        "PUBLIC"}
                                   :unit  :day-of-week}]
                   :join-tables  [{:source-field {:field-id   (id :checkins :venue_id)
                                                  :field-name "VENUE_ID"}
                                   :pk-field     {:field-id   (id :venues :id)
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
    (mapv obj->map [expanded-form
                    (resolve/resolve expanded-form)])))

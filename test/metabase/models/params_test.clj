(ns metabase.models.params-test
  "Tests for the utility functions for dealing with parameters in `metabase.models.params`."
  (:require [expectations :refer :all]
            [metabase.api.public-test :as public-test]
            [metabase.models
             [card :refer [Card]]
             [field :refer [Field]]]
            [metabase.test.data :as data]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
            [toucan.util.test :as tt]))

;;; ---------------------------------------------- name_field hydration ----------------------------------------------

;; make sure that we can hydrate the `name_field` property for PK Fields
(expect
  {:name         "ID"
   :table_id     (data/id :venues)
   :special_type :type/PK
   :name_field   {:id               (data/id :venues :name)
                  :table_id         (data/id :venues)
                  :display_name     "Name"
                  :base_type        :type/Text
                  :special_type     :type/Name
                  :has_field_values :list}}
  (-> (db/select-one [Field :name :table_id :special_type], :id (data/id :venues :id))
      (hydrate :name_field)))

;; make sure it works for multiple fields efficiently. Should only require one DB call to hydrate many Fields
(expect
  1
  (let [venues-fields (db/select Field :table_id (data/id :venues))]
    (db/with-call-counting [call-count]
      (hydrate venues-fields :name_field)
      (call-count))))

;; It shouldn't hydrate for Fields that aren't PKs
(expect
  {:name         "PRICE"
   :table_id     (data/id :venues)
   :special_type :type/Category
   :name_field   nil}
  (-> (db/select-one [Field :name :table_id :special_type], :id (data/id :venues :price))
      (hydrate :name_field)))

;; Or if it *is* a PK, but no name Field is available for that Table, it shouldn't hydrate
(expect
  {:name         "ID"
   :table_id     (data/id :checkins)
   :special_type :type/PK
   :name_field   nil}
  (-> (db/select-one [Field :name :table_id :special_type], :id (data/id :checkins :id))
      (hydrate :name_field)))


;;; -------------------------------------------------- param_fields --------------------------------------------------

;; check that we can hydrate param_fields for a Card
(expect
  {(data/id :venues :id) {:id               (data/id :venues :id)
                          :table_id         (data/id :venues)
                          :display_name     "ID"
                          :base_type        :type/BigInteger
                          :special_type     :type/PK
                          :has_field_values :none
                          :name_field       {:id               (data/id :venues :name)
                                             :table_id         (data/id :venues)
                                             :display_name     "Name"
                                             :base_type        :type/Text
                                             :special_type     :type/Name
                                             :has_field_values :list}
                          :dimensions       []}}
  (tt/with-temp Card [card {:dataset_query
                            {:database (data/id)
                             :type     :native
                             :native   {:query         "SELECT COUNT(*) FROM VENUES WHERE {{x}}"
                                        :template_tags {:name {:name         :name
                                                               :display_name "Name"
                                                               :type         :dimension
                                                               :dimension    [:field-id (data/id :venues :id)]}}}}}]
   (-> (hydrate card :param_fields)
       :param_fields)))

;; check that we can hydrate param_fields for a Dashboard
(expect
  {(data/id :venues :id) {:id               (data/id :venues :id)
                          :table_id         (data/id :venues)
                          :display_name     "ID"
                          :base_type        :type/BigInteger
                          :special_type     :type/PK
                          :has_field_values :none
                          :name_field       {:id               (data/id :venues :name)
                                             :table_id         (data/id :venues)
                                             :display_name     "Name"
                                             :base_type        :type/Text
                                             :special_type     :type/Name
                                             :has_field_values :list}
                          :dimensions       []}}
  (public-test/with-sharing-enabled-and-temp-dashcard-referencing :venues :id [dashboard]
    (-> (hydrate dashboard :param_fields)
        :param_fields)))

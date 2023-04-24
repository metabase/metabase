(ns metabase.lib.test-metadata
  "Test metadata that we can test the new Metadata lib with. This was captured from the same API endpoints that the frontend
  Query Builder hits to power its UI.

  This is captured and hardcoded to make it easy to test the new Metabase lib in ClojureScript land without relying on
  an application database and REST API to provide the metadata. One downside is that changes to the REST API response
  will not be reflected here, for example if we add new information to the metadata. We'll have to manually update
  these things if that happens and Metabase lib is meant to consume it."
  (:require
   [metabase.lib.test-metadata.graph-provider :as meta.graph-provider]))

(defonce ^:private ^{:doc "Generate a random prefix to add to all of the [[id]]s below, so that they change between
  test runs to catch places where people are hardcoding IDs rather than using [[id]]."}
  random-id-offset
  (* (rand-int 100) 1000))

(defn id
  "Get the ID associated with the test metadata Database, one of its Tables, or one of its Fields.

    ;; Database ID
    (id) => 1

    ;; Table ID
    (id :venues) => 40

    ;; Field ID
    (id :venues :id) => 401

  This is here so we don't have to hardcode opaque integer IDs in tests that use this test metadata, and get something
  that actually meaningfully represents the Field we're talking about instead.

  These numbers are randomly generated on every run just to make sure no one is trying to hardcode IDs in tests."
  ;; Not that this should matter to anyone, but:
  ;;
  ;; * Database ID is ends in xx001
  ;;
  ;; * Table ID ends in a multiple of 10, e.g. xx010
  ;;
  ;; * Field ID is starts with the same number the corresponding Table ID starts with. E.g.
  ;; * `venues` is table xx040, and `venues.name` is Field xx401.
  ([]
   (+ random-id-offset 1))

  ([table-name]
   (+ random-id-offset
      (case table-name
        :categories 10
        :checkins   20
        :users      30
        :venues     40
        :products   50
        :orders     60
        :people     70
        :reviews    80)))

  ([table-name field-name]
   (+ random-id-offset
      (case table-name
        :categories (case field-name       ;
                      :id   100            ; :type/BigInteger
                      :name 101)           ; :type/Text
        :checkins   (case field-name       ;
                      :id       200        ; :type/BigInteger
                      :date     201        ; :type/Date
                      :user-id  202        ; :type/Integer
                      :venue-id 203)       ; :type/Integer
        :users      (case field-name       ;
                      :id         300      ; :type/BigInteger
                      :name       301      ; :type/Text
                      :last-login 302      ; :type/DateTime
                      :password   303)     ; :type/Text
        :venues     (case field-name       ;
                      :id          400     ; :type/BigInteger
                      :name        401     ; :type/Text
                      :category-id 402     ; :type/Integer
                      :latitude    403     ; :type/Float
                      :longitude   404     ; :type/Float
                      :price       405)    ; :type/Integer
        :products   (case field-name       ;
                      :id         500      ; :type/BigInteger
                      :rating     501      ; :type/Float
                      :category   502      ; :type/Text
                      :price      503      ; :type/Float
                      :title      504      ; :type/Text
                      :created-at 505      ; :type/DateTimeWithLocalTZ
                      :vendor     506      ; :type/Text
                      :ean        507)     ; :type/Text
        :orders     (case field-name       ;
                      :id         600      ; :type/BigInteger
                      :subtotal   601      ; :type/Float
                      :total      602      ; :type/Float
                      :tax        603      ; :type/Float
                      :discount   604      ; :type/Float
                      :quantity   605      ; :type/Integer
                      :created-at 606      ; :type/DateTimeWithLocalTZ
                      :product-id 607      ; :type/Integer
                      :user-id    608)     ; :type/Integer
        :people     (case field-name       ;
                      :id         700      ; :type/BigInteger
                      :state      701      ; :type/Text
                      :city       702      ; :type/Text
                      :address    703      ; :type/Text
                      :name       704      ; :type/Text
                      :source     705      ; :type/Text
                      :zip        706      ; :type/Text
                      :latitude   707      ; :type/Float
                      :password   708      ; :type/Text
                      :birth-date 709      ; :type/Date
                      :longitude  710      ; :type/Float
                      :email      711      ; :type/Text
                      :created-at 712)     ; :type/DateTimeWithLocalTZ
        :reviews    (case field-name       ;
                      :id         800      ; :type/BigInteger
                      :created-at 801      ; :type/DateTimeWithLocalTZ
                      :rating     802      ; :type/Integer
                      :reviewer   803      ; :type/Text
                      :body       804      ; :type/Text
                      :product-id 805))))) ; :type/Integer

(defmulti table-metadata
  "Get Table metadata for a one of the `test-data` Tables in the test metadata, e.g. `:venues`. This is here so you can
  test things that should consume Table metadata.

  Metadata returned by this method matches the [[metabase.lib.metadata/TableMetadata]] schema."
  {:arglists '([table-name])}
  keyword)

(defmulti field-metadata
  "Get Field metadata for one of the `test-data` Fields in the test metadata, e.g. `:venues` `:name`. This is here so
  you can test things that should consume Field metadata.

  Metadata returned by this method matches the [[metabase.lib.metadata/ColumMetadata]] schema."
  {:arglists '([table-name field-name])}
  (fn [table-name field-name]
    [(keyword table-name) (keyword field-name)]))

(defmethod field-metadata [:categories :id]
  [_table-name _field-name]
  {:description         nil
   :database_type       "BIGINT"
   :semantic_type       :type/PK
   :table_id            (id :categories)
   :coercion_strategy   nil
   :name                "ID"
   :fingerprint_version 0
   :has_field_values    :none
   :settings            nil
   :caveats             nil
   :fk_target_field_id  nil
   :custom_position     0
   :effective_type      :type/BigInteger
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :categories :id)
   :position            0
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "ID"
   :database_position   0
   :database_required   false
   :fingerprint         nil
   :base_type           :type/BigInteger
   :points_of_interest  nil
   :lib/type            :metadata/field})

(defmethod field-metadata [:categories :name]
  [_table-name _field-name]
  {:description         nil
   :database_type       "CHARACTER VARYING"
   :semantic_type       :type/Name
   :table_id            (id :categories)
   :coercion_strategy   nil
   :name                "NAME"
   :fingerprint_version 5
   :has_field_values    :list
   :settings            nil
   :caveats             nil
   :fk_target_field_id  nil
   :custom_position     0
   :effective_type      :type/Text
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :categories :name)
   :position            1
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "Name"
   :database_position   1
   :database_required   true
   :fingerprint
   {:global {:distinct-count 75, :nil% 0.0}
    :type   {:type/Text {:percent-json   0.0
                         :percent-url    0.0
                         :percent-email  0.0
                         :percent-state  0.0
                         :average-length 8.333333333333334}}}
   :base_type           :type/Text
   :points_of_interest  nil
   :lib/type            :metadata/field})

(defmethod table-metadata :categories
  [_table-name]
  {:description             nil
   :entity_type             :entity/GenericTable
   :schema                  "PUBLIC"
   :show_in_getting_started false
   :name                    "CATEGORIES"
   :fields                  [(field-metadata :categories :id)
                             (field-metadata :categories :name)]
   :caveats                 nil
   :segments                []
   :active                  true
   :id                      (id :categories)
   :db_id                   (id)
   :visibility_type         nil
   :field_order             :database
   :initial_sync_status     "complete"
   :display_name            "Categories"
   :metrics                 []
   :points_of_interest      nil
   :lib/type                :metadata/table})

(defmethod field-metadata [:checkins :id]
  [_table-name _field-name]
  {:description         nil
   :database_type       "BIGINT"
   :semantic_type       :type/PK
   :table_id            (id :checkins)
   :coercion_strategy   nil
   :name                "ID"
   :fingerprint_version 0
   :has_field_values    :none
   :settings            nil
   :caveats             nil
   :fk_target_field_id  nil
   :custom_position     0
   :effective_type      :type/BigInteger
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :checkins :id)
   :position            0
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "ID"
   :database_position   0
   :database_required   false
   :fingerprint         nil
   :base_type           :type/BigInteger
   :points_of_interest  nil
   :lib/type            :metadata/field})

(defmethod field-metadata [:checkins :date]
  [_table-name _field-name]
  {:description         nil
   :database_type       "DATE"
   :semantic_type       nil
   :table_id            (id :checkins)
   :coercion_strategy   nil
   :name                "DATE"
   :fingerprint_version 5
   :has_field_values    :none
   :settings            nil
   :caveats             nil
   :fk_target_field_id  nil
   :custom_position     0
   :effective_type      :type/Date
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :checkins :date)
   :position            1
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "Date"
   :database_position   1
   :database_required   false
   :fingerprint         {:global {:distinct-count 618, :nil% 0.0}
                         :type   #:type{:DateTime {:earliest "2013-01-03", :latest "2015-12-29"}}}
   :base_type           :type/Date
   :points_of_interest  nil
   :lib/type            :metadata/field})

(defmethod field-metadata [:checkins :user-id]
  [_table-name _field-name]
  {:description         nil
   :database_type       "INTEGER"
   :semantic_type       :type/FK
   :table_id            (id :checkins)
   :coercion_strategy   nil
   :name                "USER_ID"
   :fingerprint_version 5
   :has_field_values    :none
   :settings            nil
   :caveats             nil
   :fk_target_field_id  (id :users :id)
   :custom_position     0
   :effective_type      :type/Integer
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :checkins :user-id)
   :position            2
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "User ID"
   :database_position   2
   :database_required   false
   :fingerprint         {:global {:distinct-count 15, :nil% 0.0}}
   :base_type           :type/Integer
   :points_of_interest  nil
   :lib/type            :metadata/field})

(defmethod field-metadata [:checkins :venue-id]
  [_table-name _field-name]
  {:description         nil
   :database_type       "INTEGER"
   :semantic_type       :type/FK
   :table_id            (id :checkins)
   :coercion_strategy   nil
   :name                "VENUE_ID"
   :fingerprint_version 5
   :has_field_values    :none
   :settings            nil
   :caveats             nil
   :fk_target_field_id  (id :venues :id)
   :custom_position     0
   :effective_type      :type/Integer
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :checkins :venue-id)
   :position            3
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "Venue ID"
   :database_position   3
   :database_required   false
   :fingerprint         {:global {:distinct-count 100, :nil% 0.0}}
   :base_type           :type/Integer
   :points_of_interest  nil
   :lib/type            :metadata/field})

(defmethod table-metadata :checkins
  [_table-name]
  {:description             nil
   :entity_type             :entity/EventTable
   :schema                  "PUBLIC"
   :show_in_getting_started false
   :name                    "CHECKINS"
   :fields                  [(field-metadata :checkins :id)
                             (field-metadata :checkins :date)
                             (field-metadata :checkins :user-id)
                             (field-metadata :checkins :venue-id)]
   :caveats                 nil
   :segments                []
   :active                  true
   :id                      (id :checkins)
   :db_id                   (id)
   :visibility_type         nil
   :field_order             :database
   :initial_sync_status     "complete"
   :display_name            "Checkins"
   :metrics                 []
   :points_of_interest      nil
   :lib/type                :metadata/table})

(defmethod field-metadata [:users :id]
  [_table-name _field-name]
  {:description         nil
   :database_type       "BIGINT"
   :semantic_type       :type/PK
   :table_id            (id :users)
   :coercion_strategy   nil
   :name                "ID"
   :fingerprint_version 0
   :has_field_values    :none
   :settings            nil
   :caveats             nil
   :fk_target_field_id  nil
   :custom_position     0
   :effective_type      :type/BigInteger
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :users :id)
   :position            0
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "ID"
   :database_position   0
   :database_required   false
   :fingerprint         nil
   :base_type           :type/BigInteger
   :points_of_interest  nil
   :lib/type            :metadata/field})

(defmethod field-metadata [:users :name]
  [_table-name _field-name]
  {:description         nil
   :database_type       "CHARACTER VARYING"
   :semantic_type       :type/Name
   :table_id            (id :users)
   :coercion_strategy   nil
   :name                "NAME"
   :fingerprint_version 5
   :has_field_values    :list
   :settings            nil
   :caveats             nil
   :fk_target_field_id  nil
   :custom_position     0
   :effective_type      :type/Text
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :users :name)
   :position            1
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "Name"
   :database_position   1
   :database_required   false
   :fingerprint         {:global {:distinct-count 15, :nil% 0.0}
                         :type   #:type{:Text
                                        {:percent-json   0.0
                                         :percent-url    0.0
                                         :percent-email  0.0
                                         :percent-state  0.0
                                         :average-length 13.266666666666667}}}
   :base_type           :type/Text
   :points_of_interest  nil
   :lib/type            :metadata/field})

(defmethod field-metadata [:users :last-login]
  [_table-name _field-name]
  {:description         nil
   :database_type       "TIMESTAMP"
   :semantic_type       nil
   :table_id            (id :users)
   :coercion_strategy   nil
   :name                "LAST_LOGIN"
   :fingerprint_version 5
   :has_field_values    :none
   :settings            nil
   :caveats             nil
   :fk_target_field_id  nil
   :custom_position     0
   :effective_type      :type/DateTime
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :users :last-login)
   :position            2
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "Last Login"
   :database_position   2
   :database_required   false
   :fingerprint         {:global {:distinct-count 15, :nil% 0.0}
                         :type   #:type{:DateTime {:earliest "2014-01-01T08:30:00Z", :latest "2014-12-05T15:15:00Z"}}}
   :base_type           :type/DateTime
   :points_of_interest  nil
   :lib/type            :metadata/field})

(defmethod field-metadata [:users :password]
  [_table-name _field-name]
  {:description         nil
   :database_type       "CHARACTER VARYING"
   :semantic_type       :type/Category
   :table_id            (id :users)
   :coercion_strategy   nil
   :name                "PASSWORD"
   :fingerprint_version 5
   :has_field_values    :list
   :settings            nil
   :caveats             nil
   :fk_target_field_id  nil
   :custom_position     0
   :effective_type      :type/Text
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :users :password)
   :position            3
   :visibility_type     :sensitive
   :target              nil
   :preview_display     true
   :display_name        "Password"
   :database_position   3
   :database_required   false
   :fingerprint         {:global {:distinct-count 15, :nil% 0.0}
                         :type   #:type{:Text
                                        {:percent-json   0.0
                                         :percent-url    0.0
                                         :percent-email  0.0
                                         :percent-state  0.0
                                         :average-length 36.0}}}
   :base_type           :type/Text
   :points_of_interest  nil
   :lib/type            :metadata/field})

(defmethod table-metadata :users
  [_table-name]
  {:description             nil
   :entity_type             :entity/UserTable
   :schema                  "PUBLIC"
   :show_in_getting_started false
   :name                    "USERS"
   :fields                  [(field-metadata :users :id)
                             (field-metadata :users :name)
                             (field-metadata :users :last-login)
                             (field-metadata :users :password)]
   :caveats                 nil
   :segments                []
   :active                  true
   :id                      (id :users)
   :db_id                   (id)
   :visibility_type         nil
   :field_order             :database
   :initial_sync_status     "complete"
   :display_name            "Users"
   :metrics                 []
   :points_of_interest      nil
   :lib/type                :metadata/table})

(defmethod field-metadata [:venues :id]
  [_table-name _field-name]
  {:description         nil
   :database_type       "BIGINT"
   :semantic_type       :type/PK
   :table_id            (id :venues)
   :coercion_strategy   nil
   :name                "ID"
   :fingerprint_version 0
   :has_field_values    :none
   :settings            nil
   :caveats             nil
   :fk_target_field_id  nil
   :custom_position     0
   :effective_type      :type/BigInteger
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :venues :id)
   :position            0
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "ID"
   :database_position   0
   :database_required   false
   :fingerprint         nil
   :base_type           :type/BigInteger
   :points_of_interest  nil
   :lib/type            :metadata/field})

(defmethod field-metadata [:venues :name]
  [_table-name _field-name]
  {:description         nil
   :database_type       "CHARACTER VARYING"
   :semantic_type       :type/Name
   :table_id            (id :venues)
   :coercion_strategy   nil
   :name                "NAME"
   :fingerprint_version 5
   :has_field_values    :list
   :settings            nil
   :caveats             nil
   :fk_target_field_id  nil
   :custom_position     0
   :effective_type      :type/Text
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :venues :name)
   :position            1
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "Name"
   :database_position   1
   :database_required   false
   :fingerprint         {:global {:distinct-count 100, :nil% 0.0}
                         :type   #:type{:Text
                                        {:percent-json   0.0
                                         :percent-url    0.0
                                         :percent-email  0.0
                                         :percent-state  0.0
                                         :average-length 15.63}}}
   :base_type           :type/Text
   :points_of_interest  nil
   :lib/type            :metadata/field})

(defmethod field-metadata [:venues :category-id]
  [_table-name _field-name]
  {:description         nil
   :database_type       "INTEGER"
   :semantic_type       :type/FK
   :table_id            (id :venues)
   :coercion_strategy   nil
   :name                "CATEGORY_ID"
   :fingerprint_version 5
   :has_field_values    :none
   :settings            nil
   :caveats             nil
   :fk_target_field_id  (id :categories :id)
   :custom_position     0
   :effective_type      :type/Integer
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :venues :category-id)
   :position            2
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "Category ID"
   :database_position   2
   :database_required   false
   :fingerprint         {:global {:distinct-count 28, :nil% 0.0}}
   :base_type           :type/Integer
   :points_of_interest  nil
   :lib/type            :metadata/field})

(defmethod field-metadata [:venues :latitude]
  [_table-name _field-name]
  {:description         nil
   :database_type       "DOUBLE PRECISION"
   :semantic_type       :type/Latitude
   :table_id            (id :venues)
   :coercion_strategy   nil
   :name                "LATITUDE"
   :fingerprint_version 5
   :has_field_values    :none
   :settings            nil
   :caveats             nil
   :fk_target_field_id  nil
   :custom_position     0
   :effective_type      :type/Float
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :venues :latitude)
   :position            3
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "Latitude"
   :database_position   3
   :database_required   false
   :fingerprint         {:global {:distinct-count 94, :nil% 0.0}
                         :type   #:type{:Number
                                        {:min 10.0646
                                         :q1  34.06098873016278
                                         :q3  37.77185
                                         :max 40.7794
                                         :sd  3.4346725397190827
                                         :avg 35.505891999999996}}}
   :base_type           :type/Float
   :points_of_interest  nil
   :lib/type            :metadata/field})

(defmethod field-metadata [:venues :longitude]
  [_table-name _field-name]
  {:description         nil
   :database_type       "DOUBLE PRECISION"
   :semantic_type       :type/Longitude
   :table_id            (id :venues)
   :coercion_strategy   nil
   :name                "LONGITUDE"
   :fingerprint_version 5
   :has_field_values    :none
   :settings            nil
   :caveats             nil
   :fk_target_field_id  nil
   :custom_position     0
   :effective_type      :type/Float
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :venues :longitude)
   :position            4
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "Longitude"
   :database_position   4
   :database_required   false
   :fingerprint
   {:global {:distinct-count 84, :nil% 0.0}
    :type
    #:type{:Number
           {:min -165.374
            :q1  -122.40857106781186
            :q3  -118.2635
            :max -73.9533
            :sd  14.162810671348238
            :avg -115.99848699999998}}}
   :base_type           :type/Float
   :points_of_interest  nil
   :lib/type            :metadata/field})

(defmethod field-metadata [:venues :price]
  [_table-name _field-name]
  {:description         nil
   :database_type       "INTEGER"
   :semantic_type       :type/Category
   :table_id            (id :venues)
   :coercion_strategy   nil
   :name                "PRICE"
   :fingerprint_version 5
   :has_field_values    :list
   :settings            {:is_priceless true}
   :caveats             nil
   :fk_target_field_id  nil
   :custom_position     0
   :effective_type      :type/Integer
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :venues :price)
   :position            5
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "Price"
   :database_position   5
   :database_required   false
   :fingerprint         {:global {:distinct-count 4, :nil% 0.0}
                         :type   #:type{:Number
                                        {:min 1.0
                                         :q1  1.4591129021415095
                                         :q3  2.493086095768049
                                         :max 4.0
                                         :sd  0.7713951678941896
                                         :avg 2.03}}}
   :base_type           :type/Integer
   :points_of_interest  nil
   :lib/type            :metadata/field})

(defmethod table-metadata :venues
  [_table-name]
  {:description             nil
   :entity_type             :entity/GenericTable
   :schema                  "PUBLIC"
   :show_in_getting_started false
   :name                    "VENUES"
   :fields                  [(field-metadata :venues :id)
                             (field-metadata :venues :name)
                             (field-metadata :venues :category-id)
                             (field-metadata :venues :latitude)
                             (field-metadata :venues :longitude)
                             (field-metadata :venues :price)]
   :caveats                 nil
   :segments                []
   :active                  true
   :id                      (id :venues)
   :db_id                   (id)
   :visibility_type         nil
   :field_order             :database
   :initial_sync_status     "complete"
   :display_name            "Venues"
   :metrics                 []
   :points_of_interest      nil
   :lib/type                :metadata/table})

 (defmethod field-metadata [:products :id]
  [_table-name _field-name]
   {:description                nil
    :database_type              "BIGINT"
    :semantic_type              :type/PK
    :table_id                   (id :products)
    :coercion_strategy          nil
    :name                       "ID"
    :fingerprint_version        0
    :has_field_values           nil
    :settings                   nil
    :caveats                    nil
    :fk_target_field_id         nil
    :custom_position            0
    :effective_type             :type/BigInteger
    :active                     true
    :nfc_path                   nil
    :parent_id                  nil
    :id                         (id :products :id)
    :database_is_auto_increment true
    :position                   0
    :visibility_type            :normal
    :preview_display            true
    :display_name               "ID"
    :database_position          0
    :database_required          false
    :fingerprint                nil
    :base_type                  :type/BigInteger
    :points_of_interest         nil
    :lib/type                   :metadata/field})

(defmethod field-metadata [:products :rating]
  [_table-name _field-name]
  {:description                nil
   :database_type              "DOUBLE PRECISION"
   :semantic_type              :type/Score
   :table_id                   (id :products)
   :coercion_strategy          nil
   :name                       "RATING"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Float
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :products :rating)
   :database_is_auto_increment false
   :position                   6
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Rating"
   :database_position          6
   :database_required          false
   :fingerprint                {:global {:distinct-count 23, :nil% 0.0}
                                :type   {:type/Number {:min 0.0
                                                       :q1  3.5120465053408525
                                                       :q3  4.216124969497314
                                                       :max 5.0
                                                       :sd  1.3605488657451452
                                                       :avg 3.4715}}}
   :base_type                  :type/Float
   :points_of_interest         nil
   :lib/type                   :metadata/field})

 (defmethod field-metadata [:products :category]
   [_table-name _field-name]
   {:description                nil
    :database_type              "CHARACTER VARYING"
    :semantic_type              :type/Category
    :table_id                   (id :products)
    :coercion_strategy          nil
    :name                       "CATEGORY"
    :fingerprint_version        5
    :has_field_values           :auto-list
    :settings                   nil
    :caveats                    nil
    :fk_target_field_id         nil
    :custom_position            0
    :effective_type             :type/Text
    :active                     true
    :nfc_path                   nil
    :parent_id                  nil
    :id                         (id :products :category)
    :database_is_auto_increment false
    :position                   3
    :visibility_type            :normal
    :preview_display            true
    :display_name               "Category"
    :database_position          3
    :database_required          false
    :fingerprint                {:global {:distinct-count 4, :nil% 0.0}
                                 :type   {:type/Text {:percent-json   0.0
                                                      :percent-url    0.0
                                                      :percent-email  0.0
                                                      :percent-state  0.0
                                                      :average-length 6.375}}}
    :base_type                  :type/Text
    :points_of_interest         nil
    :lib/type                   :metadata/field})

(defmethod field-metadata [:products :price]
  [_table-name _field-name]
  {:description                nil
   :database_type              "DOUBLE PRECISION"
   :semantic_type              nil
   :table_id                   (id :products)
   :coercion_strategy          nil
   :name                       "PRICE"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Float
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :products :price)
   :database_is_auto_increment false
   :position                   5
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Price"
   :database_position          5
   :database_required          false
   :fingerprint                {:global {:distinct-count 168, :nil% 0.0}
                                :type   {:type/Number {:min 15.69
                                                       :q1  37.139492751669884
                                                       :q3  75.46063889947193
                                                       :max 98.82
                                                       :sd  21.711152906916283
                                                       :avg 55.746399999999994}}}
   :base_type                  :type/Float
   :points_of_interest         nil
   :lib/type                   :metadata/field})

 (defmethod field-metadata [:products :title]
   [_table-name _field-name]
   {:description                nil
    :database_type              "CHARACTER VARYING"
    :semantic_type              :type/Title
    :table_id                   (id :products)
    :coercion_strategy          nil
    :name                       "TITLE"
    :fingerprint_version        5
    :has_field_values           :auto-list
    :settings                   nil
    :caveats                    nil
    :fk_target_field_id         nil
    :custom_position            0
    :effective_type             :type/Text
    :active                     true
    :nfc_path                   nil
    :parent_id                  nil
    :id                         (id :products :title)
    :database_is_auto_increment false
    :position                   2
    :visibility_type            :normal
    :preview_display            true
    :display_name               "Title"
    :database_position          2
    :database_required          false
    :fingerprint                {:global {:distinct-count 199, :nil% 0.0}
                                 :type   {:type/Text {:percent-json   0.0
                                                      :percent-url    0.0
                                                      :percent-email  0.0
                                                      :percent-state  0.0
                                                      :average-length 21.495}}}
    :base_type                  :type/Text
    :points_of_interest         nil
    :lib/type                   :metadata/field})

(defmethod field-metadata [:products :created-at]
  [_table-name _field-name]
  {:description                nil
   :database_type              "TIMESTAMP WITH TIME ZONE"
   :semantic_type              :type/CreationTimestamp
   :table_id                   (id :products)
   :coercion_strategy          nil
   :name                       "CREATED_AT"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/DateTimeWithLocalTZ
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :products :created-at)
   :database_is_auto_increment false
   :position                   7
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Created At"
   :database_position          7
   :database_required          false
   :fingerprint                {:global {:distinct-count 200, :nil% 0.0}
                                :type   {:type/DateTime {:earliest "2016-04-26T19:29:55.147Z"
                                                         :latest   "2019-04-15T13:34:19.931Z"}}}
   :base_type                  :type/DateTimeWithLocalTZ
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:products :vendor]
  [_table-name _field-name]
  {:description                nil
   :database_type              "CHARACTER VARYING"
   :semantic_type              :type/Company
   :table_id                   (id :products)
   :coercion_strategy          nil
   :name                       "VENDOR"
   :fingerprint_version        5
   :has_field_values           :auto-list
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Text
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :products :vendor)
   :database_is_auto_increment false
   :position                   4
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Vendor"
   :database_position          4
   :database_required          false
   :fingerprint                {:global {:distinct-count 200, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  0.0
                                                     :average-length 20.6}}}
   :base_type                  :type/Text
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:products :ean]
  [_table-name _field-name]
  {:description                nil
   :database_type              "CHARACTER VARYING"
   :semantic_type              nil
   :table_id                   (id :products)
   :coercion_strategy          nil
   :name                       "EAN"
   :fingerprint_version        5
   :has_field_values           :auto-list
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Text
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :products :ean)
   :database_is_auto_increment false
   :position                   1
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Ean"
   :database_position          1
   :database_required          false
   :fingerprint                {:global {:distinct-count 200, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  0.0
                                                     :average-length 13.0}}}
   :base_type                  :type/Text
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod table-metadata :products
  [_table-name]
  {:description             nil
   :entity_type             :entity/ProductTable
   :schema                  "PUBLIC"
   :show_in_getting_started false
   :name                    "PRODUCTS"
   :caveats                 nil
   :active                  true
   :id                      (id :products)
   :db_id                   (id)
   :visibility_type         nil
   :field_order             :database
   :initial_sync_status     "complete"
   :display_name            "Products"
   :points_of_interest      nil
   :lib/type                :metadata/table
   :fields                  [(field-metadata :products :id)
                             (field-metadata :products :rating)
                             (field-metadata :products :category)
                             (field-metadata :products :price)
                             (field-metadata :products :title)
                             (field-metadata :products :created-at)
                             (field-metadata :products :vendor)
                             (field-metadata :products :ean)]})

(defmethod field-metadata [:orders :id]
  [_table-name _field-name]
  {:description                nil
   :database_type              "BIGINT"
   :semantic_type              :type/PK
   :table_id                   (id :orders)
   :coercion_strategy          nil
   :name                       "ID"
   :fingerprint_version        0
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/BigInteger
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :orders :id)
   :database_is_auto_increment true
   :position                   0
   :visibility_type            :normal
   :preview_display            true
   :display_name               "ID"
   :database_position          0
   :database_required          false
   :fingerprint                nil
   :base_type                  :type/BigInteger
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:orders :subtotal]
  [_table-name _field-name]
  {:description                nil
   :database_type              "DOUBLE PRECISION"
   :semantic_type              nil
   :table_id                   (id :orders)
   :coercion_strategy          nil
   :name                       "SUBTOTAL"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Float
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :orders :subtotal)
   :database_is_auto_increment false
   :position                   3
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Subtotal"
   :database_position          3
   :database_required          false
   :fingerprint                {:global {:distinct-count 334, :nil% 0.0}
                                :type   {:type/Number
                                         {:min 15.69
                                          :q1  49.74982947753719
                                          :q3  105.42859575924612
                                          :max 148.23
                                          :sd  32.536819823931104
                                          :avg 77.012717}}}
   :base_type                  :type/Float
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:orders :total]
  [_table-name _field-name]
  {:description                nil
   :database_type              "DOUBLE PRECISION"
   :semantic_type              nil
   :table_id                   (id :orders)
   :coercion_strategy          nil
   :name                       "TOTAL"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Float
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :orders :total)
   :database_is_auto_increment false
   :position                   5
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Total"
   :database_position          5
   :database_required          false
   :fingerprint                {:global {:distinct-count 3710, :nil% 0.0}
                                :type   {:type/Number
                                         {:min 8.94
                                          :q1  51.34487926008301
                                          :q3  110.29697257770795
                                          :max 159.35
                                          :sd  34.264752087910324
                                          :avg 80.35850400000001}}}
   :base_type                  :type/Float
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:orders :tax]
  [_table-name _field-name]
  {:description                nil
   :database_type              "DOUBLE PRECISION"
   :semantic_type              nil
   :table_id                   (id :orders)
   :coercion_strategy          nil
   :name                       "TAX"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Float
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :orders :tax)
   :database_is_auto_increment false
   :position                   4
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Tax"
   :database_position          4
   :database_required          false
   :fingerprint                {:global {:distinct-count 797, :nil% 0.0}
                                :type   {:type/Number
                                         {:min 0.0
                                          :q1  2.273340386603857
                                          :q3  5.337275338216307
                                          :max 11.12
                                          :sd  2.3206651358900316
                                          :avg 3.8722100000000004}}}
   :base_type                  :type/Float
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:orders :discount]
  [_table-name _field-name]
  {:description                nil
   :database_type              "DOUBLE PRECISION"
   :semantic_type              :type/Discount
   :table_id                   (id :orders)
   :coercion_strategy          nil
   :name                       "DISCOUNT"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Float
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :orders :discount)
   :database_is_auto_increment false
   :position                   6
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Discount"
   :database_position          6
   :database_required          false
   :fingerprint                {:global {:distinct-count 479, :nil% 0.898}
                                :type   {:type/Number {:min 0.17
                                                       :q1  2.978591571097236
                                                       :q3  7.337323315325942
                                                       :max 61.7
                                                       :sd  3.053736975739119
                                                       :avg 5.161009803921569}}}
   :base_type                  :type/Float
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:orders :quantity]
  [_table-name _field-name]
  {:description                nil
   :database_type              "INTEGER"
   :semantic_type              :type/Quantity
   :table_id                   (id :orders)
   :coercion_strategy          nil
   :name                       "QUANTITY"
   :fingerprint_version        5
   :has_field_values           :auto-list
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Integer
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :orders :quantity)
   :database_is_auto_increment false
   :position                   8
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Quantity"
   :database_position          8
   :database_required          false
   :fingerprint                {:global {:distinct-count 62, :nil% 0.0}
                                :type   {:type/Number {:min 0.0
                                                       :q1  1.755882607764982
                                                       :q3  4.882654507928044
                                                       :max 100.0
                                                       :sd  4.214258386403798
                                                       :avg 3.7015}}}
   :base_type                  :type/Integer
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:orders :created-at]
  [_table-name _field-name]
  {:description                nil
   :database_type              "TIMESTAMP WITH TIME ZONE"
   :semantic_type              :type/CreationTimestamp
   :table_id                   (id :orders)
   :coercion_strategy          nil
   :name                       "CREATED_AT"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/DateTimeWithLocalTZ
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :orders :created-at)
   :database_is_auto_increment false
   :position                   7
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Created At"
   :database_position          7
   :database_required          false
   :fingerprint                {:global {:distinct-count 10000, :nil% 0.0}
                                :type   {:type/DateTime {:earliest "2016-04-30T18:56:13.352Z"
                                                         :latest   "2020-04-19T14:07:15.657Z"}}}
   :base_type                  :type/DateTimeWithLocalTZ
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:orders :product-id]
  [_table-name _field-name]
  {:description                nil
   :database_type              "INTEGER"
   :semantic_type              :type/FK
   :table_id                   (id :orders)
   :coercion_strategy          nil
   :name                       "PRODUCT_ID"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         (id :products :id)
   :custom_position            0
   :effective_type             :type/Integer
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :orders :product-id)
   :database_is_auto_increment false
   :position                   2
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Product ID"
   :database_position          2
   :database_required          false
   :fingerprint                {:global {:distinct-count 200, :nil% 0.0}}
   :base_type                  :type/Integer
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:orders :user-id]
  [_table-name _field-name]
  {:description                nil
   :database_type              "INTEGER"
   :semantic_type              :type/FK
   :table_id                   (id :orders)
   :coercion_strategy          nil
   :name                       "USER_ID"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         (id :people :id)
   :custom_position            0
   :effective_type             :type/Integer
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :orders :user-id)
   :database_is_auto_increment false
   :position                   1
   :visibility_type            :normal
   :preview_display            true
   :display_name               "User ID"
   :database_position          1
   :database_required          false
   :fingerprint                {:global {:distinct-count 929, :nil% 0.0}}
   :base_type                  :type/Integer
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod table-metadata :orders
  [_table-name]
  {:description             nil
   :entity_type             :entity/TransactionTable
   :schema                  "PUBLIC"
   :show_in_getting_started false
   :name                    "ORDERS"
   :caveats                 nil
   :active                  true
   :id                      (id :orders)
   :db_id                   (id)
   :visibility_type         nil
   :field_order             :database
   :initial_sync_status     "complete"
   :display_name            "Orders"
   :points_of_interest      nil
   :lib/type                :metadata/table
   :fields                  [(field-metadata :orders :id)
                             (field-metadata :orders :subtotal)
                             (field-metadata :orders :total)
                             (field-metadata :orders :tax)
                             (field-metadata :orders :discount)
                             (field-metadata :orders :quantity)
                             (field-metadata :orders :created-at)
                             (field-metadata :orders :product-id)
                             (field-metadata :orders :user-id)]})

(defmethod field-metadata [:people :id]
  [_table-name _field-name]
  {:description                nil
   :database_type              "BIGINT"
   :semantic_type              :type/PK
   :table_id                   (id :people)
   :coercion_strategy          nil
   :name                       "ID"
   :fingerprint_version        0
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/BigInteger
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :people :id)
   :database_is_auto_increment true
   :position                   0
   :visibility_type            :normal
   :preview_display            true
   :display_name               "ID"
   :database_position          0
   :database_required          false
   :fingerprint                nil
   :base_type                  :type/BigInteger
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :state]
  [_table-name _field-name]
  {:description                nil
   :database_type              "CHARACTER VARYING"
   :semantic_type              :type/State
   :table_id                   (id :people)
   :coercion_strategy          nil
   :name                       "STATE"
   :fingerprint_version        5
   :has_field_values           :auto-list
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Text
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :people :state)
   :database_is_auto_increment false
   :position                   7
   :visibility_type            :normal
   :preview_display            true
   :display_name               "State"
   :database_position          7
   :database_required          false
   :fingerprint                {:global {:distinct-count 49, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  1.0
                                                     :average-length 2.0}}}
   :base_type                  :type/Text
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :city]
  [_table-name _field-name]
  {:description                nil
   :database_type              "CHARACTER VARYING"
   :semantic_type              :type/City
   :table_id                   (id :people)
   :coercion_strategy          nil
   :name                       "CITY"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Text
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :people :city)
   :database_is_auto_increment false
   :position                   5
   :visibility_type            :normal
   :preview_display            true
   :display_name               "City"
   :database_position          5
   :database_required          false
   :fingerprint                {:global {:distinct-count 1966, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  0.002
                                                     :average-length 8.284}}}
   :base_type                  :type/Text
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :address]
  [_table-name _field-name]
  {:description                nil
   :database_type              "CHARACTER VARYING"
   :semantic_type              nil
   :table_id                   (id :people)
   :coercion_strategy          nil
   :name                       "ADDRESS"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Text
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :people :address)
   :database_is_auto_increment false
   :position                   1
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Address"
   :database_position          1
   :database_required          false
   :fingerprint                {:global {:distinct-count 2490, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  0.0
                                                     :average-length 20.85}}}
   :base_type                  :type/Text
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :name]
  [_table-name _field-name]
  {:description                nil
   :database_type              "CHARACTER VARYING"
   :semantic_type              :type/Name
   :table_id                   (id :people)
   :coercion_strategy          nil
   :name                       "NAME"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Text
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :people :name)
   :database_is_auto_increment false
   :position                   4
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Name"
   :database_position          4
   :database_required          false
   :fingerprint                {:global {:distinct-count 2499, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  0.0
                                                     :average-length 13.532}}}
   :base_type                  :type/Text
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :source]
  [_table-name _field-name]
  {:description                nil
   :database_type              "CHARACTER VARYING"
   :semantic_type              :type/Source
   :table_id                   (id :people)
   :coercion_strategy          nil
   :name                       "SOURCE"
   :fingerprint_version        5
   :has_field_values           :auto-list
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Text
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :people :source)
   :database_is_auto_increment false
   :position                   8
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Source"
   :database_position          8
   :database_required          false
   :fingerprint                {:global {:distinct-count 5, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  0.0
                                                     :average-length 7.4084}}}
   :base_type                  :type/Text
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :zip]
  [_table-name _field-name]
  {:description                nil
   :database_type              "CHARACTER VARYING"
   :semantic_type              nil
   :table_id                   (id :people)
   :coercion_strategy          nil
   :name                       "ZIP"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Text
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :people :zip)
   :database_is_auto_increment false
   :position                   10
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Zip"
   :database_position          10
   :database_required          false
   :fingerprint                {:global {:distinct-count 2234, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  0.0
                                                     :average-length 5.0}}}
   :base_type                  :type/Text
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :latitude]
  [_table-name _field-name]
  {:description                nil
   :database_type              "DOUBLE PRECISION"
   :semantic_type              :type/Latitude
   :table_id                   (id :people)
   :coercion_strategy          nil
   :name                       "LATITUDE"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Float
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :people :latitude)
   :database_is_auto_increment false
   :position                   11
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Latitude"
   :database_position          11
   :database_required          false
   :fingerprint                {:global {:distinct-count 2491, :nil% 0.0}
                                :type   {:type/Number {:min 25.775827
                                                       :q1  35.302705923023126
                                                       :q3  43.773802584662
                                                       :max 70.6355001
                                                       :sd  6.390832341883712
                                                       :avg 39.87934670484002}}}
   :base_type                  :type/Float
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :password]
  [_table-name _field-name]
  {:description                nil
   :database_type              "CHARACTER VARYING"
   :semantic_type              nil
   :table_id                   (id :people)
   :coercion_strategy          nil
   :name                       "PASSWORD"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Text
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :people :password)
   :database_is_auto_increment false
   :position                   3
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Password"
   :database_position          3
   :database_required          false
   :fingerprint                {:global {:distinct-count 2500, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  0.0
                                                     :average-length 36.0}}}
   :base_type                  :type/Text
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :birth-date]
  [_table-name _field-name]
  {:description                nil
   :database_type              "DATE"
   :semantic_type              nil
   :table_id                   (id :people)
   :coercion_strategy          nil
   :name                       "BIRTH_DATE"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Date
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :people :birth-date)
   :database_is_auto_increment false
   :position                   9
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Birth Date"
   :database_position          9
   :database_required          false
   :fingerprint
   {:global {:distinct-count 2308, :nil% 0.0}
    :type   {:type/DateTime {:earliest "1958-04-26", :latest "2000-04-03"}}}
   :base_type                  :type/Date
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :longitude]
  [_table-name _field-name]
  {:description                nil
   :database_type              "DOUBLE PRECISION"
   :semantic_type              :type/Longitude
   :table_id                   (id :people)
   :coercion_strategy          nil
   :name                       "LONGITUDE"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Float
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :people :longitude)
   :database_is_auto_increment false
   :position                   6
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Longitude"
   :database_position          6
   :database_required          false
   :fingerprint                {:global {:distinct-count 2491, :nil% 0.0}
                                :type   {:type/Number {:min -166.5425726
                                                       :q1  -101.58350792373135
                                                       :q3  -84.65289348288829
                                                       :max -67.96735199999999
                                                       :sd  15.399698968175663
                                                       :avg -95.18741780363999}}}
   :base_type                  :type/Float
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :email]
  [_table-name _field-name]
  {:description                nil
   :database_type              "CHARACTER VARYING"
   :semantic_type              :type/Email
   :table_id                   (id :people)
   :coercion_strategy          nil
   :name                       "EMAIL"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Text
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :people :email)
   :database_is_auto_increment false
   :position                   2
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Email"
   :database_position          2
   :database_required          false
   :fingerprint                {:global {:distinct-count 2500, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  1.0
                                                     :percent-state  0.0
                                                     :average-length 24.1824}}}
   :base_type                  :type/Text
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :created-at]
  [_table-name _field-name]
  {:description                nil
   :database_type              "TIMESTAMP WITH TIME ZONE"
   :semantic_type              :type/CreationTimestamp
   :table_id                   (id :people)
   :coercion_strategy          nil
   :name                       "CREATED_AT"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/DateTimeWithLocalTZ
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :people :created-at)
   :database_is_auto_increment false
   :position                   12
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Created At"
   :database_position          12
   :database_required          false
   :fingerprint                {:global {:distinct-count 2499, :nil% 0.0}
                                :type   {:type/DateTime {:earliest "2016-04-19T21:35:18.752Z"
                                                         :latest   "2019-04-19T14:06:27.3Z"}}}
   :base_type                  :type/DateTimeWithLocalTZ
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod table-metadata :people
  [_table-name]
  {:description             nil
   :entity_type             :entity/UserTable
   :schema                  "PUBLIC"
   :show_in_getting_started false
   :name                    "PEOPLE"
   :caveats                 nil
   :active                  true
   :id                      (id :people)
   :db_id                   (id)
   :visibility_type         nil
   :field_order             :database
   :initial_sync_status     "complete"
   :display_name            "People"
   :points_of_interest      nil
   :lib/type                :metadata/table
   :fields                  [(field-metadata :people :id)
                             (field-metadata :people :state)
                             (field-metadata :people :city)
                             (field-metadata :people :address)
                             (field-metadata :people :name)
                             (field-metadata :people :source)
                             (field-metadata :people :zip)
                             (field-metadata :people :latitude)
                             (field-metadata :people :password)
                             (field-metadata :people :birth-date)
                             (field-metadata :people :longitude)
                             (field-metadata :people :email)
                             (field-metadata :people :created-at)]})

(defmethod field-metadata [:reviews :id]
  [_table-name _field-name]
  {:description                nil
   :database_type              "BIGINT"
   :semantic_type              :type/PK
   :table_id                   (id :reviews)
   :coercion_strategy          nil
   :name                       "ID"
   :fingerprint_version        0
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/BigInteger
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :reviews :id)
   :database_is_auto_increment true
   :position                   0
   :visibility_type            :normal
   :preview_display            true
   :display_name               "ID"
   :database_position          0
   :database_required          false
   :fingerprint                nil
   :base_type                  :type/BigInteger
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:reviews :created-at]
  [_table-name _field-name]
  {:description                nil
   :database_type              "TIMESTAMP WITH TIME ZONE"
   :semantic_type              :type/CreationTimestamp
   :table_id                   (id :reviews)
   :coercion_strategy          nil
   :name                       "CREATED_AT"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/DateTimeWithLocalTZ
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :reviews :created-at)
   :database_is_auto_increment false
   :position                   5
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Created At"
   :database_position          5
   :database_required          false
   :fingerprint                {:global {:distinct-count 1112, :nil% 0.0}
                                :type   {:type/DateTime {:earliest "2016-06-03T00:37:05.818Z"
                                                         :latest   "2020-04-19T14:15:25.677Z"}}}
   :base_type                  :type/DateTimeWithLocalTZ
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:reviews :rating]
  [_table-name _field-name]
  {:description                nil
   :database_type              "INTEGER"
   :semantic_type              :type/Score
   :table_id                   (id :reviews)
   :coercion_strategy          nil
   :name                       "RATING"
   :fingerprint_version        5
   :has_field_values           :auto-list
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Integer
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :reviews :rating)
   :database_is_auto_increment false
   :position                   3
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Rating"
   :database_position          3
   :database_required          false
   :fingerprint                {:global {:distinct-count 5, :nil% 0.0}
                                :type   {:type/Number {:min 1.0
                                                       :q1  3.54744353181696
                                                       :q3  4.764807071650455
                                                       :max 5.0
                                                       :sd  1.0443899855660577
                                                       :avg 3.987410071942446}}}
   :base_type                  :type/Integer
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:reviews :reviewer]
  [_table-name _field-name]
  {:description                nil
   :database_type              "CHARACTER VARYING"
   :semantic_type              nil
   :table_id                   (id :reviews)
   :coercion_strategy          nil
   :name                       "REVIEWER"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Text
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :reviews :reviewer)
   :database_is_auto_increment false
   :position                   2
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Reviewer"
   :database_position          2
   :database_required          false
   :fingerprint                {:global {:distinct-count 1076, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  0.001798561151079137
                                                     :average-length 9.972122302158274}}}
   :base_type                  :type/Text
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:reviews :body]
  [_table-name _field-name]
  {:description                nil
   :database_type              "CHARACTER VARYING"
   :semantic_type              nil
   :table_id                   (id :reviews)
   :coercion_strategy          nil
   :name                       "BODY"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         nil
   :custom_position            0
   :effective_type             :type/Text
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :reviews :body)
   :database_is_auto_increment false
   :position                   4
   :visibility_type            :normal
   :preview_display            false
   :display_name               "Body"
   :database_position          4
   :database_required          false
   :fingerprint                {:global {:distinct-count 1112, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  0.0
                                                     :average-length 177.41996402877697}}}
   :base_type                  :type/Text
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod field-metadata [:reviews :product-id]
  [_table-name _field-name]
  {:description                nil
   :database_type              "INTEGER"
   :semantic_type              :type/FK
   :table_id                   (id :reviews)
   :coercion_strategy          nil
   :name                       "PRODUCT_ID"
   :fingerprint_version        5
   :has_field_values           nil
   :settings                   nil
   :caveats                    nil
   :fk_target_field_id         (id :products :id)
   :custom_position            0
   :effective_type             :type/Integer
   :active                     true
   :nfc_path                   nil
   :parent_id                  nil
   :id                         (id :reviews :product-id)
   :database_is_auto_increment false
   :position                   1
   :visibility_type            :normal
   :preview_display            true
   :display_name               "Product ID"
   :database_position          1
   :database_required          false
   :fingerprint                {:global {:distinct-count 176, :nil% 0.0}}
   :base_type                  :type/Integer
   :points_of_interest         nil
   :lib/type                   :metadata/field})

(defmethod table-metadata :reviews
  [_table-name]
  {:description             nil
   :entity_type             :entity/GenericTable
   :schema                  "PUBLIC"
   :show_in_getting_started false
   :name                    "REVIEWS"
   :caveats                 nil
   :active                  true
   :id                      (id :reviews)
   :db_id                   (id)
   :visibility_type         nil
   :field_order             :database
   :initial_sync_status     "complete"
   :display_name            "Reviews"
   :points_of_interest      nil
   :lib/type                :metadata/table
   :fields                  [(field-metadata :reviews :id)
                             (field-metadata :reviews :created-at)
                             (field-metadata :reviews :rating)
                             (field-metadata :reviews :reviewer)
                             (field-metadata :reviews :body)
                             (field-metadata :reviews :product-id)]})

(def metadata
  "Complete Database metadata for testing, captured from a call to `GET /api/database/:id/metadata`. For the H2 version
  of `test-data`. This is a representative example of the metadata the FE Query Builder would have available to it.
  Here so we can test things that should consume Database metadata without relying on having a REST API
  available (i.e., in Cljs tests).

  This metadata matches the [[metabase.lib.metadata/DatabaseMetadata]] schema."
  {:description                 nil
   :features                    #{:actions
                                  :actions/custom
                                  :advanced-math-expressions
                                  :basic-aggregations
                                  :binning
                                  :case-sensitivity-string-filter-options
                                  :date-arithmetics
                                  :datetime-diff
                                  :expression-aggregations
                                  :expressions
                                  :foreign-keys
                                  :inner-join
                                  :left-join
                                  :native-parameters
                                  :nested-queries
                                  :now
                                  :regex
                                  :right-join
                                  :standard-deviation-aggregations
                                  :temporal-extract}
   :cache_field_values_schedule "0 50 0 * * ? *"
   :timezone                    "UTC"
   :auto_run_queries            true
   :metadata_sync_schedule      "0 50 * * * ? *"
   :name                        "test-data"
   :settings                    nil
   :caveats                     nil
   :tables                      [(table-metadata :categories)
                                 (table-metadata :checkins)
                                 (table-metadata :users)
                                 (table-metadata :venues)
                                 (table-metadata :products)
                                 (table-metadata :orders)
                                 (table-metadata :people)
                                 (table-metadata :reviews)]
   :creator_id                  nil
   :is_full_sync                true
   :cache_ttl                   nil
   :is_sample                   false
   :id                          (id)
   :is_on_demand                false
   :options                     nil
   :engine                      :h2
   :initial_sync_status         "complete"
   :dbms_version                {:flavor "H2", :version "2.1.212 (2022-04-09)", :semantic-version [2 1]}
   :refingerprint               nil
   :points_of_interest          nil
   :lib/type                    :metadata/database})

(def metadata-provider
  "[[metabase.lib.metadata.protocols/MetadataProvider]] using the test [[metadata]]."
  (meta.graph-provider/->SimpleGraphMetadataProvider metadata))

(def results-metadata
  "Capture of the `data.results_metadata` that would come back when running `SELECT * FROM VENUES;` with the Query
  Processor, or saved as `Card.result_metadata` for a Saved Question.

  IRL queries actually come back with both `data.cols` and `data.results_metadata.columns`, which are slightly
  different from one another; the frontend merges these together into one unified metadata map. This is both icky and
  silly. I'm hoping we can get away with just using one or the other in the future. So let's try to use just the stuff
  here and see how far we get. If it turns out we need something in `data.cols` that's missing from here, let's just
  add it to `data.results_metadata.columns` in QP results, and add it here as well, so we can start moving toward a
  world where we don't have two versions of the metadata in query responses."
  {:lib/type :metadata/results
   :columns  [{:lib/type       :metadata/field
               :display_name   "ID"
               :name           "ID"
               :base_type      :type/BigInteger
               :effective_type :type/BigInteger
               :semantic_type  :type/PK
               :fingerprint    nil}
              {:lib/type       :metadata/field
               :display_name   "NAME" ; TODO -- these display names are icky
               :name           "NAME"
               :base_type      :type/Text
               :effective_type :type/Text
               :semantic_type  :type/Name
               :fingerprint    {:global {:distinct-count 100, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  0.0
                                                     :average-length 15.63}}}}
              {:lib/type       :metadata/field
               :display_name   "CATEGORY_ID"
               :name           "CATEGORY_ID"
               :base_type      :type/Integer
               :effective_type :type/Integer
               :semantic_type  nil
               :fingerprint    {:global {:distinct-count 28, :nil% 0.0}
                                :type   {:type/Number
                                         {:min 2.0
                                          :q1  6.89564392373896
                                          :q3  49.240253073352044
                                          :max 74.0
                                          :sd  23.058108414099443
                                          :avg 29.98}}}}
              {:lib/type       :metadata/field
               :display_name   "LATITUDE"
               :name           "LATITUDE"
               :base_type      :type/Float
               :effective_type :type/Float
               :semantic_type  :type/Latitude
               :fingerprint
               {:global {:distinct-count 94, :nil% 0.0}
                :type   {:type/Number {:min 10.0646
                                       :q1  34.06098873016278
                                       :q3  37.77185
                                       :max 40.7794
                                       :sd  3.4346725397190827
                                       :avg 35.505891999999996}}}}
              {:lib/type       :metadata/field
               :display_name   "LONGITUDE"
               :name           "LONGITUDE"
               :base_type      :type/Float
               :effective_type :type/Float
               :semantic_type  :type/Longitude
               :fingerprint    {:global {:distinct-count 84, :nil% 0.0}
                                :type   {:type/Number
                                         {:min -165.374
                                          :q1  -122.40857106781186
                                          :q3  -118.2635
                                          :max -73.9533
                                          :sd  14.162810671348238
                                          :avg -115.99848699999998}}}}
              {:lib/type       :metadata/field
               :display_name   "PRICE"
               :name           "PRICE"
               :base_type      :type/Integer
               :effective_type :type/Integer
               :semantic_type  nil
               :fingerprint    {:global {:distinct-count 4, :nil% 0.0}
                                :type   {:type/Number
                                         {:min 1.0
                                          :q1  1.4591129021415095
                                          :q3  2.493086095768049
                                          :max 4.0
                                          :sd  0.7713951678941896
                                          :avg 2.03}}}}]})

(def saved-question
  "An representative Saved Question, with [[results-metadata]]. For testing queries that use a Saved Question as their
  source."
  {:dataset_query   {:database (id)
                     :type     :query
                     :query    {:source-table (id :venues)}}
   :result_metadata results-metadata})

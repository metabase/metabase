(ns metabase.lib.test-metadata)

(defn id
  ([]
   1)

  ([table-name]
   (case table-name
     :categories 10
     :checkins   20
     :users      30
     :venues     40))

  ([table-name field-name]
   (case table-name
     :categories (case field-name
                   :id   100
                   :name 101)
     :checkins   (case field-name
                   :id       200
                   :date     201
                   :user-id  202
                   :venue-id 203)
     :users      (case field-name
                   :id         300
                   :name       301
                   :last-login 302
                   :password   303)
     :venues     (case field-name
                   :id          400
                   :name        401
                   :category-id 402
                   :latitude    403
                   :longitude   404
                   :price       405))))

(defmulti table-metadata
  {:arglists '([table-name])}
  (fn [table-name]
    (keyword table-name)))

(defmulti field-metadata
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
   :updated_at          #t "2023-02-22T00:30:40.798565Z"
   :custom_position     0
   :effective_type      :type/BigInteger
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :categories :id)
   :last_analyzed       nil
   :position            0
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "ID"
   :database_position   0
   :database_required   false
   :fingerprint         nil
   :created_at          #t "2023-02-22T00:30:40.798565Z"
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
   :updated_at          #t "2023-02-22T00:30:41.784724Z"
   :custom_position     0
   :effective_type      :type/Text
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :categories :name)
   :last_analyzed       #t "2023-02-22T00:30:41.861759Z"
   :position            1
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "Name"
   :database_position   1
   :database_required   true
   :fingerprint
   {:global {:distinct-count 75, :nil% 0.0}
    :type
    #:type{:Text
           {:percent-json   0.0
            :percent-url    0.0
            :percent-email  0.0
            :percent-state  0.0
            :average-length 8.333333333333334}}}
   :created_at          #t "2023-02-22T00:30:40.798565Z"
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
   :updated_at              #t "2023-02-22T00:30:41.825045Z"
   :active                  true
   :id                      (id :categories)
   :db_id                   (id)
   :visibility_type         nil
   :field_order             :database
   :initial_sync_status     "complete"
   :display_name            "Categories"
   :metrics                 []
   :created_at              #t "2023-02-22T00:30:40.747734Z"
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
   :updated_at          #t "2023-02-22T00:30:40.821286Z"
   :custom_position     0
   :effective_type      :type/BigInteger
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :checkins :id)
   :last_analyzed       nil
   :position            0
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "ID"
   :database_position   0
   :database_required   false
   :fingerprint         nil
   :created_at          #t "2023-02-22T00:30:40.821286Z"
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
   :updated_at          #t "2023-02-22T00:30:41.662673Z"
   :custom_position     0
   :effective_type      :type/Date
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :checkins :date)
   :last_analyzed       #t "2023-02-22T00:30:41.861759Z"
   :position            1
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "Date"
   :database_position   1
   :database_required   false
   :fingerprint         {:global {:distinct-count 618, :nil% 0.0}
                         :type   #:type{:DateTime {:earliest "2013-01-03", :latest "2015-12-29"}}}
   :created_at          #t "2023-02-22T00:30:40.821286Z"
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
   :updated_at          #t "2023-02-22T00:30:41.667867Z"
   :custom_position     0
   :effective_type      :type/Integer
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :checkins :user-id)
   :last_analyzed       #t "2023-02-22T00:30:41.861759Z"
   :position            2
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "User ID"
   :database_position   2
   :database_required   false
   :fingerprint         {:global {:distinct-count 15, :nil% 0.0}}
   :created_at          #t "2023-02-22T00:30:40.821286Z"
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
   :updated_at          #t "2023-02-22T00:30:41.665413Z"
   :custom_position     0
   :effective_type      :type/Integer
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :checkins :venue-id)
   :last_analyzed       #t "2023-02-22T00:30:41.861759Z"
   :position            3
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "Venue ID"
   :database_position   3
   :database_required   false
   :fingerprint         {:global {:distinct-count 100, :nil% 0.0}}
   :created_at          #t "2023-02-22T00:30:40.821286Z"
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
   :updated_at              #t "2023-02-22T00:30:41.829964Z"
   :active                  true
   :id                      (id :checkins)
   :db_id                   (id)
   :visibility_type         nil
   :field_order             :database
   :initial_sync_status     "complete"
   :display_name            "Checkins"
   :metrics                 []
   :created_at              #t "2023-02-22T00:30:40.741351Z"
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
   :updated_at          #t "2023-02-22T00:30:40.831985Z"
   :custom_position     0
   :effective_type      :type/BigInteger
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :users :id)
   :last_analyzed       nil
   :position            0
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "ID"
   :database_position   0
   :database_required   false
   :fingerprint         nil
   :created_at          #t "2023-02-22T00:30:40.831985Z"
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
   :updated_at          #t "2023-02-22T00:30:41.794462Z"
   :custom_position     0
   :effective_type      :type/Text
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :users :name)
   :last_analyzed       #t "2023-02-22T00:30:41.861759Z"
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
   :created_at          #t "2023-02-22T00:30:40.831985Z"
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
   :updated_at          #t "2023-02-22T00:30:41.711716Z"
   :custom_position     0
   :effective_type      :type/DateTime
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :users :last-login)
   :last_analyzed       #t "2023-02-22T00:30:41.861759Z"
   :position            2
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "Last Login"
   :database_position   2
   :database_required   false
   :fingerprint         {:global {:distinct-count 15, :nil% 0.0}
                         :type   #:type{:DateTime {:earliest "2014-01-01T08:30:00Z", :latest "2014-12-05T15:15:00Z"}}}
   :created_at          #t "2023-02-22T00:30:40.831985Z"
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
   :updated_at          #t "2023-02-22T00:30:42.072887Z"
   :custom_position     0
   :effective_type      :type/Text
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :users :password)
   :last_analyzed       #t "2023-02-22T00:30:41.861759Z"
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
   :created_at          #t "2023-02-22T00:30:40.831985Z"
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
   :updated_at              #t "2023-02-22T00:30:41.833214Z"
   :active                  true
   :id                      (id :users)
   :db_id                   (id)
   :visibility_type         nil
   :field_order             :database
   :initial_sync_status     "complete"
   :display_name            "Users"
   :metrics                 []
   :created_at              #t "2023-02-22T00:30:40.734907Z"
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
   :updated_at          #t "2023-02-22T00:30:40.845644Z"
   :custom_position     0
   :effective_type      :type/BigInteger
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :venues :id)
   :last_analyzed       nil
   :position            0
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "ID"
   :database_position   0
   :database_required   false
   :fingerprint         nil
   :created_at          #t "2023-02-22T00:30:40.845644Z"
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
   :updated_at          #t "2023-02-22T00:30:41.818202Z"
   :custom_position     0
   :effective_type      :type/Text
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :venues :name)
   :last_analyzed       #t "2023-02-22T00:30:41.861759Z"
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
   :created_at          #t "2023-02-22T00:30:40.845644Z"
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
   :updated_at          #t "2023-02-22T00:30:41.757152Z"
   :custom_position     0
   :effective_type      :type/Integer
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :venues :category-id)
   :last_analyzed       #t "2023-02-22T00:30:41.861759Z"
   :position            2
   :visibility_type     :normal
   :target              nil
   :preview_display     true
   :display_name        "Category ID"
   :database_position   2
   :database_required   false
   :fingerprint         {:global {:distinct-count 28, :nil% 0.0}}
   :created_at          #t "2023-02-22T00:30:40.845644Z"
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
   :updated_at          #t "2023-02-22T00:30:42.079049Z"
   :custom_position     0
   :effective_type      :type/Float
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :venues :latitude)
   :last_analyzed       #t "2023-02-22T00:30:41.861759Z"
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
   :created_at          #t "2023-02-22T00:30:40.845644Z"
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
   :updated_at          #t "2023-02-22T00:30:42.082865Z"
   :custom_position     0
   :effective_type      :type/Float
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :venues :longitude)
   :last_analyzed       #t "2023-02-22T00:30:41.861759Z"
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
   :created_at          #t "2023-02-22T00:30:40.845644Z"
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
   :settings            nil
   :caveats             nil
   :fk_target_field_id  nil
   :updated_at          #t "2023-02-22T00:30:42.086325Z"
   :custom_position     0
   :effective_type      :type/Integer
   :active              true
   :nfc_path            nil
   :parent_id           nil
   :id                  (id :venues :price)
   :last_analyzed       #t "2023-02-22T00:30:41.861759Z"
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
   :created_at          #t "2023-02-22T00:30:40.845644Z"
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
   :updated_at              #t "2023-02-22T00:30:41.837179Z"
   :active                  true
   :id                      (id :venues)
   :db_id                   (id)
   :visibility_type         nil
   :field_order             :database
   :initial_sync_status     "complete"
   :display_name            "Venues"
   :metrics                 []
   :created_at              #t "2023-02-22T00:30:40.718208Z"
   :points_of_interest      nil
   :lib/type                :metadata/table})

(def metadata
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
                                 (table-metadata :venues)]
   :creator_id                  nil
   :is_full_sync                true
   :updated_at                  #t "2023-02-22T00:30:40.508908Z"
   :cache_ttl                   nil
   :is_sample                   false
   :id                          (id)
   :is_on_demand                false
   :options                     nil
   :engine                      :h2
   :initial_sync_status         "complete"
   :dbms_version                {:flavor "H2", :version "2.1.212 (2022-04-09)", :semantic-version [2 1]}
   :refingerprint               nil
   :created_at                  #t "2023-02-22T00:30:40.508908Z"
   :points_of_interest          nil
   :lib/type                    :metadata/database})

(def results-metadata
  "The results of running `SELECT * FROM VENUES;`"
  {:lib/type :metadata/results
   :columns  [{:lib/type       :metadata/field
               :display_name   "ID"
               :field_ref      [:field "ID" {:base-type :type/BigInteger}]
               :name           "ID"
               :base_type      :type/BigInteger
               :effective_type :type/BigInteger
               :semantic_type  :type/PK
               :fingerprint    nil}
              {:lib/type       :metadata/field
               :display_name   "NAME"
               :field_ref      [:field "NAME" {:base-type :type/Text}]
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
               :field_ref      [:field "CATEGORY_ID" {:base-type :type/Integer}]
               :name           "CATEGORY_ID"
               :base_type      :type/Integer
               :effective_type :type/Integer
               :semantic_type  nil
               :fingerprint    {:global {:distinct-count 28, :nil% 0.0}
                                :type   {:type/Number
                                         {:min 2.0, :q1 6.89564392373896, :q3 49.240253073352044, :max 74.0, :sd 23.058108414099443, :avg 29.98}}}}
              {:lib/type       :metadata/field
               :display_name   "LATITUDE"
               :field_ref      [:field "LATITUDE" {:base-type :type/Float}]
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
               :field_ref      [:field "LONGITUDE" {:base-type :type/Float}]
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
               :field_ref      [:field "PRICE" {:base-type :type/Integer}]
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
  "An example saved question."
  {:dataset_query   {:database (id)
                     :type     :query
                     :query    {:source-table (id :venues)}}
   :result_metadata results-metadata})

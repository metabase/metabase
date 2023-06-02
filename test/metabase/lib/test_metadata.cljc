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
   :database-type       "BIGINT"
   :semantic-type       :type/PK
   :table-id            (id :categories)
   :coercion-strategy   nil
   :name                "ID"
   :fingerprint-version 0
   :has-field-values    :none
   :settings            nil
   :fk-target-field-id  nil
   :custom-position     0
   :effective-type      :type/BigInteger
   :active              true
   :nfc-path            nil
   :parent-id           nil
   :id                  (id :categories :id)
   :position            0
   :visibility-type     :normal
   :target              nil
   :preview-display     true
   :display-name        "ID"
   :database-position   0
   :database-required   false
   :fingerprint         nil
   :base-type           :type/BigInteger
   :lib/type            :metadata/field})

(defmethod field-metadata [:categories :name]
  [_table-name _field-name]
  {:description         nil
   :database-type       "CHARACTER VARYING"
   :semantic-type       :type/Name
   :table-id            (id :categories)
   :coercion-strategy   nil
   :name                "NAME"
   :fingerprint-version 5
   :has-field-values    :list
   :settings            nil
   :fk-target-field-id  nil
   :custom-position     0
   :effective-type      :type/Text
   :active              true
   :nfc-path            nil
   :parent-id           nil
   :id                  (id :categories :name)
   :position            1
   :visibility-type     :normal
   :target              nil
   :preview-display     true
   :display-name        "Name"
   :database-position   1
   :database-required   true
   :fingerprint
   {:global {:distinct-count 75, :nil% 0.0}
    :type   {:type/Text {:percent-json   0.0
                         :percent-url    0.0
                         :percent-email  0.0
                         :percent-state  0.0
                         :average-length 8.333333333333334}}}
   :base-type           :type/Text
   :lib/type            :metadata/field})

(defmethod table-metadata :categories
  [_table-name]
  {:description             nil
   :entity-type             :entity/GenericTable
   :schema                  "PUBLIC"
   :show-in-getting-started false
   :name                    "CATEGORIES"
   :fields                  [(field-metadata :categories :id)
                             (field-metadata :categories :name)]
   :segments                []
   :active                  true
   :id                      (id :categories)
   :db-id                   (id)
   :visibility-type         nil
   :field-order             :database
   :initial-sync-status     "complete"
   :display-name            "Categories"
   :metrics                 []
   :lib/type                :metadata/table})

(defmethod field-metadata [:checkins :id]
  [_table-name _field-name]
  {:description         nil
   :database-type       "BIGINT"
   :semantic-type       :type/PK
   :table-id            (id :checkins)
   :coercion-strategy   nil
   :name                "ID"
   :fingerprint-version 0
   :has-field-values    :none
   :settings            nil
   :fk-target-field-id  nil
   :custom-position     0
   :effective-type      :type/BigInteger
   :active              true
   :nfc-path            nil
   :parent-id           nil
   :id                  (id :checkins :id)
   :position            0
   :visibility-type     :normal
   :target              nil
   :preview-display     true
   :display-name        "ID"
   :database-position   0
   :database-required   false
   :fingerprint         nil
   :base-type           :type/BigInteger
   :lib/type            :metadata/field})

(defmethod field-metadata [:checkins :date]
  [_table-name _field-name]
  {:description         nil
   :database-type       "DATE"
   :semantic-type       nil
   :table-id            (id :checkins)
   :coercion-strategy   nil
   :name                "DATE"
   :fingerprint-version 5
   :has-field-values    :none
   :settings            nil
   :fk-target-field-id  nil
   :custom-position     0
   :effective-type      :type/Date
   :active              true
   :nfc-path            nil
   :parent-id           nil
   :id                  (id :checkins :date)
   :position            1
   :visibility-type     :normal
   :target              nil
   :preview-display     true
   :display-name        "Date"
   :database-position   1
   :database-required   false
   :fingerprint         {:global {:distinct-count 618, :nil% 0.0}
                         :type   #:type{:DateTime {:earliest "2013-01-03", :latest "2015-12-29"}}}
   :base-type           :type/Date
   :lib/type            :metadata/field})

(defmethod field-metadata [:checkins :user-id]
  [_table-name _field-name]
  {:description         nil
   :database-type       "INTEGER"
   :semantic-type       :type/FK
   :table-id            (id :checkins)
   :coercion-strategy   nil
   :name                "USER_ID"
   :fingerprint-version 5
   :has-field-values    :none
   :settings            nil
   :fk-target-field-id  (id :users :id)
   :custom-position     0
   :effective-type      :type/Integer
   :active              true
   :nfc-path            nil
   :parent-id           nil
   :id                  (id :checkins :user-id)
   :position            2
   :visibility-type     :normal
   :target              nil
   :preview-display     true
   :display-name        "User ID"
   :database-position   2
   :database-required   false
   :fingerprint         {:global {:distinct-count 15, :nil% 0.0}}
   :base-type           :type/Integer
   :lib/type            :metadata/field})

(defmethod field-metadata [:checkins :venue-id]
  [_table-name _field-name]
  {:description         nil
   :database-type       "INTEGER"
   :semantic-type       :type/FK
   :table-id            (id :checkins)
   :coercion-strategy   nil
   :name                "VENUE_ID"
   :fingerprint-version 5
   :has-field-values    :none
   :settings            nil
   :fk-target-field-id  (id :venues :id)
   :custom-position     0
   :effective-type      :type/Integer
   :active              true
   :nfc-path            nil
   :parent-id           nil
   :id                  (id :checkins :venue-id)
   :position            3
   :visibility-type     :normal
   :target              nil
   :preview-display     true
   :display-name        "Venue ID"
   :database-position   3
   :database-required   false
   :fingerprint         {:global {:distinct-count 100, :nil% 0.0}}
   :base-type           :type/Integer
   :lib/type            :metadata/field})

(defmethod table-metadata :checkins
  [_table-name]
  {:description             nil
   :entity-type             :entity/EventTable
   :schema                  "PUBLIC"
   :show-in-getting-started false
   :name                    "CHECKINS"
   :fields                  [(field-metadata :checkins :id)
                             (field-metadata :checkins :date)
                             (field-metadata :checkins :user-id)
                             (field-metadata :checkins :venue-id)]
   :segments                []
   :active                  true
   :id                      (id :checkins)
   :db-id                   (id)
   :visibility-type         nil
   :field-order             :database
   :initial-sync-status     "complete"
   :display-name            "Checkins"
   :metrics                 []
   :lib/type                :metadata/table})

(defmethod field-metadata [:users :id]
  [_table-name _field-name]
  {:description         nil
   :database-type       "BIGINT"
   :semantic-type       :type/PK
   :table-id            (id :users)
   :coercion-strategy   nil
   :name                "ID"
   :fingerprint-version 0
   :has-field-values    :none
   :settings            nil
   :fk-target-field-id  nil
   :custom-position     0
   :effective-type      :type/BigInteger
   :active              true
   :nfc-path            nil
   :parent-id           nil
   :id                  (id :users :id)
   :position            0
   :visibility-type     :normal
   :target              nil
   :preview-display     true
   :display-name        "ID"
   :database-position   0
   :database-required   false
   :fingerprint         nil
   :base-type           :type/BigInteger
   :lib/type            :metadata/field})

(defmethod field-metadata [:users :name]
  [_table-name _field-name]
  {:description         nil
   :database-type       "CHARACTER VARYING"
   :semantic-type       :type/Name
   :table-id            (id :users)
   :coercion-strategy   nil
   :name                "NAME"
   :fingerprint-version 5
   :has-field-values    :list
   :settings            nil
   :fk-target-field-id  nil
   :custom-position     0
   :effective-type      :type/Text
   :active              true
   :nfc-path            nil
   :parent-id           nil
   :id                  (id :users :name)
   :position            1
   :visibility-type     :normal
   :target              nil
   :preview-display     true
   :display-name        "Name"
   :database-position   1
   :database-required   false
   :fingerprint         {:global {:distinct-count 15, :nil% 0.0}
                         :type   #:type{:Text
                                        {:percent-json   0.0
                                         :percent-url    0.0
                                         :percent-email  0.0
                                         :percent-state  0.0
                                         :average-length 13.266666666666667}}}
   :base-type           :type/Text
   :lib/type            :metadata/field})

(defmethod field-metadata [:users :last-login]
  [_table-name _field-name]
  {:description         nil
   :database-type       "TIMESTAMP"
   :semantic-type       nil
   :table-id            (id :users)
   :coercion-strategy   nil
   :name                "LAST_LOGIN"
   :fingerprint-version 5
   :has-field-values    :none
   :settings            nil
   :fk-target-field-id  nil
   :custom-position     0
   :effective-type      :type/DateTime
   :active              true
   :nfc-path            nil
   :parent-id           nil
   :id                  (id :users :last-login)
   :position            2
   :visibility-type     :normal
   :target              nil
   :preview-display     true
   :display-name        "Last Login"
   :database-position   2
   :database-required   false
   :fingerprint         {:global {:distinct-count 15, :nil% 0.0}
                         :type   #:type{:DateTime {:earliest "2014-01-01T08:30:00Z", :latest "2014-12-05T15:15:00Z"}}}
   :base-type           :type/DateTime
   :lib/type            :metadata/field})

(defmethod field-metadata [:users :password]
  [_table-name _field-name]
  {:description         nil
   :database-type       "CHARACTER VARYING"
   :semantic-type       :type/Category
   :table-id            (id :users)
   :coercion-strategy   nil
   :name                "PASSWORD"
   :fingerprint-version 5
   :has-field-values    :list
   :settings            nil
   :fk-target-field-id  nil
   :custom-position     0
   :effective-type      :type/Text
   :active              true
   :nfc-path            nil
   :parent-id           nil
   :id                  (id :users :password)
   :position            3
   :visibility-type     :sensitive
   :target              nil
   :preview-display     true
   :display-name        "Password"
   :database-position   3
   :database-required   false
   :fingerprint         {:global {:distinct-count 15, :nil% 0.0}
                         :type   #:type{:Text
                                        {:percent-json   0.0
                                         :percent-url    0.0
                                         :percent-email  0.0
                                         :percent-state  0.0
                                         :average-length 36.0}}}
   :base-type           :type/Text
   :lib/type            :metadata/field})

(defmethod table-metadata :users
  [_table-name]
  {:description             nil
   :entity-type             :entity/UserTable
   :schema                  "PUBLIC"
   :show-in-getting-started false
   :name                    "USERS"
   :fields                  [(field-metadata :users :id)
                             (field-metadata :users :name)
                             (field-metadata :users :last-login)
                             (field-metadata :users :password)]
   :segments                []
   :active                  true
   :id                      (id :users)
   :db-id                   (id)
   :visibility-type         nil
   :field-order             :database
   :initial-sync-status     "complete"
   :display-name            "Users"
   :metrics                 []
   :lib/type                :metadata/table})

(defmethod field-metadata [:venues :id]
  [_table-name _field-name]
  {:description         nil
   :database-type       "BIGINT"
   :semantic-type       :type/PK
   :table-id            (id :venues)
   :coercion-strategy   nil
   :name                "ID"
   :fingerprint-version 0
   :has-field-values    :none
   :settings            nil
   :fk-target-field-id  nil
   :custom-position     0
   :effective-type      :type/BigInteger
   :active              true
   :nfc-path            nil
   :parent-id           nil
   :id                  (id :venues :id)
   :position            0
   :visibility-type     :normal
   :target              nil
   :preview-display     true
   :display-name        "ID"
   :database-position   0
   :database-required   false
   :fingerprint         nil
   :base-type           :type/BigInteger
   :lib/type            :metadata/field})

(defmethod field-metadata [:venues :name]
  [_table-name _field-name]
  {:description         nil
   :database-type       "CHARACTER VARYING"
   :semantic-type       :type/Name
   :table-id            (id :venues)
   :coercion-strategy   nil
   :name                "NAME"
   :fingerprint-version 5
   :has-field-values    :list
   :settings            nil
   :fk-target-field-id  nil
   :custom-position     0
   :effective-type      :type/Text
   :active              true
   :nfc-path            nil
   :parent-id           nil
   :id                  (id :venues :name)
   :position            1
   :visibility-type     :normal
   :target              nil
   :preview-display     true
   :display-name        "Name"
   :database-position   1
   :database-required   false
   :fingerprint         {:global {:distinct-count 100, :nil% 0.0}
                         :type   #:type{:Text
                                        {:percent-json   0.0
                                         :percent-url    0.0
                                         :percent-email  0.0
                                         :percent-state  0.0
                                         :average-length 15.63}}}
   :base-type           :type/Text
   :lib/type            :metadata/field})

(defmethod field-metadata [:venues :category-id]
  [_table-name _field-name]
  {:description         nil
   :database-type       "INTEGER"
   :semantic-type       :type/FK
   :table-id            (id :venues)
   :coercion-strategy   nil
   :name                "CATEGORY_ID"
   :fingerprint-version 5
   :has-field-values    :none
   :settings            nil
   :fk-target-field-id  (id :categories :id)
   :custom-position     0
   :effective-type      :type/Integer
   :active              true
   :nfc-path            nil
   :parent-id           nil
   :id                  (id :venues :category-id)
   :position            2
   :visibility-type     :normal
   :target              nil
   :preview-display     true
   :display-name        "Category ID"
   :database-position   2
   :database-required   false
   :fingerprint         {:global {:distinct-count 28, :nil% 0.0}}
   :base-type           :type/Integer
   :lib/type            :metadata/field})

(defmethod field-metadata [:venues :latitude]
  [_table-name _field-name]
  {:description         nil
   :database-type       "DOUBLE PRECISION"
   :semantic-type       :type/Latitude
   :table-id            (id :venues)
   :coercion-strategy   nil
   :name                "LATITUDE"
   :fingerprint-version 5
   :has-field-values    :none
   :settings            nil
   :fk-target-field-id  nil
   :custom-position     0
   :effective-type      :type/Float
   :active              true
   :nfc-path            nil
   :parent-id           nil
   :id                  (id :venues :latitude)
   :position            3
   :visibility-type     :normal
   :target              nil
   :preview-display     true
   :display-name        "Latitude"
   :database-position   3
   :database-required   false
   :fingerprint         {:global {:distinct-count 94, :nil% 0.0}
                         :type   #:type{:Number
                                        {:min 10.0646
                                         :q1  34.06098873016278
                                         :q3  37.77185
                                         :max 40.7794
                                         :sd  3.4346725397190827
                                         :avg 35.505891999999996}}}
   :base-type           :type/Float
   :lib/type            :metadata/field})

(defmethod field-metadata [:venues :longitude]
  [_table-name _field-name]
  {:description         nil
   :database-type       "DOUBLE PRECISION"
   :semantic-type       :type/Longitude
   :table-id            (id :venues)
   :coercion-strategy   nil
   :name                "LONGITUDE"
   :fingerprint-version 5
   :has-field-values    :none
   :settings            nil
   :fk-target-field-id  nil
   :custom-position     0
   :effective-type      :type/Float
   :active              true
   :nfc-path            nil
   :parent-id           nil
   :id                  (id :venues :longitude)
   :position            4
   :visibility-type     :normal
   :target              nil
   :preview-display     true
   :display-name        "Longitude"
   :database-position   4
   :database-required   false
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
   :base-type           :type/Float
   :lib/type            :metadata/field})

(defmethod field-metadata [:venues :price]
  [_table-name _field-name]
  {:description         nil
   :database-type       "INTEGER"
   :semantic-type       :type/Category
   :table-id            (id :venues)
   :coercion-strategy   nil
   :name                "PRICE"
   :fingerprint-version 5
   :has-field-values    :list
   :settings            {:is_priceless true}
   :fk-target-field-id  nil
   :custom-position     0
   :effective-type      :type/Integer
   :active              true
   :nfc-path            nil
   :parent-id           nil
   :id                  (id :venues :price)
   :position            5
   :visibility-type     :normal
   :target              nil
   :preview-display     true
   :display-name        "Price"
   :database-position   5
   :database-required   false
   :fingerprint         {:global {:distinct-count 4, :nil% 0.0}
                         :type   #:type{:Number
                                        {:min 1.0
                                         :q1  1.4591129021415095
                                         :q3  2.493086095768049
                                         :max 4.0
                                         :sd  0.7713951678941896
                                         :avg 2.03}}}
   :base-type           :type/Integer
   :lib/type            :metadata/field})

(defmethod table-metadata :venues
  [_table-name]
  {:description             nil
   :entity-type             :entity/GenericTable
   :schema                  "PUBLIC"
   :show-in-getting-started false
   :name                    "VENUES"
   :fields                  [(field-metadata :venues :id)
                             (field-metadata :venues :name)
                             (field-metadata :venues :category-id)
                             (field-metadata :venues :latitude)
                             (field-metadata :venues :longitude)
                             (field-metadata :venues :price)]
   :segments                []
   :active                  true
   :id                      (id :venues)
   :db-id                   (id)
   :visibility-type         nil
   :field-order             :database
   :initial-sync-status     "complete"
   :display-name            "Venues"
   :metrics                 []
   :lib/type                :metadata/table})

 (defmethod field-metadata [:products :id]
  [_table-name _field-name]
   {:description                nil
    :database-type              "BIGINT"
    :semantic-type              :type/PK
    :table-id                   (id :products)
    :coercion-strategy          nil
    :name                       "ID"
    :fingerprint-version        0
    :has-field-values           nil
    :settings                   nil
    :fk-target-field-id         nil
    :custom-position            0
    :effective-type             :type/BigInteger
    :active                     true
    :nfc-path                   nil
    :parent-id                  nil
    :id                         (id :products :id)
    :database-is-auto-increment true
    :position                   0
    :visibility-type            :normal
    :preview-display            true
    :display-name               "ID"
    :database-position          0
    :database-required          false
    :fingerprint                nil
    :base-type                  :type/BigInteger
    :lib/type                   :metadata/field})

(defmethod field-metadata [:products :rating]
  [_table-name _field-name]
  {:description                nil
   :database-type              "DOUBLE PRECISION"
   :semantic-type              :type/Score
   :table-id                   (id :products)
   :coercion-strategy          nil
   :name                       "RATING"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Float
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :products :rating)
   :database-is-auto-increment false
   :position                   6
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Rating"
   :database-position          6
   :database-required          false
   :fingerprint                {:global {:distinct-count 23, :nil% 0.0}
                                :type   {:type/Number {:min 0.0
                                                       :q1  3.5120465053408525
                                                       :q3  4.216124969497314
                                                       :max 5.0
                                                       :sd  1.3605488657451452
                                                       :avg 3.4715}}}
   :base-type                  :type/Float
   :lib/type                   :metadata/field})

 (defmethod field-metadata [:products :category]
   [_table-name _field-name]
   {:description                nil
    :database-type              "CHARACTER VARYING"
    :semantic-type              :type/Category
    :table-id                   (id :products)
    :coercion-strategy          nil
    :name                       "CATEGORY"
    :fingerprint-version        5
    :has-field-values           :auto-list
    :settings                   nil
    :fk-target-field-id         nil
    :custom-position            0
    :effective-type             :type/Text
    :active                     true
    :nfc-path                   nil
    :parent-id                  nil
    :id                         (id :products :category)
    :database-is-auto-increment false
    :position                   3
    :visibility-type            :normal
    :preview-display            true
    :display-name               "Category"
    :database-position          3
    :database-required          false
    :fingerprint                {:global {:distinct-count 4, :nil% 0.0}
                                 :type   {:type/Text {:percent-json   0.0
                                                      :percent-url    0.0
                                                      :percent-email  0.0
                                                      :percent-state  0.0
                                                      :average-length 6.375}}}
    :base-type                  :type/Text
    :lib/type                   :metadata/field})

(defmethod field-metadata [:products :price]
  [_table-name _field-name]
  {:description                nil
   :database-type              "DOUBLE PRECISION"
   :semantic-type              nil
   :table-id                   (id :products)
   :coercion-strategy          nil
   :name                       "PRICE"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Float
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :products :price)
   :database-is-auto-increment false
   :position                   5
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Price"
   :database-position          5
   :database-required          false
   :fingerprint                {:global {:distinct-count 168, :nil% 0.0}
                                :type   {:type/Number {:min 15.69
                                                       :q1  37.139492751669884
                                                       :q3  75.46063889947193
                                                       :max 98.82
                                                       :sd  21.711152906916283
                                                       :avg 55.746399999999994}}}
   :base-type                  :type/Float
   :lib/type                   :metadata/field})

 (defmethod field-metadata [:products :title]
   [_table-name _field-name]
   {:description                nil
    :database-type              "CHARACTER VARYING"
    :semantic-type              :type/Title
    :table-id                   (id :products)
    :coercion-strategy          nil
    :name                       "TITLE"
    :fingerprint-version        5
    :has-field-values           :auto-list
    :settings                   nil
    :fk-target-field-id         nil
    :custom-position            0
    :effective-type             :type/Text
    :active                     true
    :nfc-path                   nil
    :parent-id                  nil
    :id                         (id :products :title)
    :database-is-auto-increment false
    :position                   2
    :visibility-type            :normal
    :preview-display            true
    :display-name               "Title"
    :database-position          2
    :database-required          false
    :fingerprint                {:global {:distinct-count 199, :nil% 0.0}
                                 :type   {:type/Text {:percent-json   0.0
                                                      :percent-url    0.0
                                                      :percent-email  0.0
                                                      :percent-state  0.0
                                                      :average-length 21.495}}}
    :base-type                  :type/Text
    :lib/type                   :metadata/field})

(defmethod field-metadata [:products :created-at]
  [_table-name _field-name]
  {:description                nil
   :database-type              "TIMESTAMP WITH TIME ZONE"
   :semantic-type              :type/CreationTimestamp
   :table-id                   (id :products)
   :coercion-strategy          nil
   :name                       "CREATED_AT"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/DateTimeWithLocalTZ
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :products :created-at)
   :database-is-auto-increment false
   :position                   7
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Created At"
   :database-position          7
   :database-required          false
   :fingerprint                {:global {:distinct-count 200, :nil% 0.0}
                                :type   {:type/DateTime {:earliest "2016-04-26T19:29:55.147Z"
                                                         :latest   "2019-04-15T13:34:19.931Z"}}}
   :base-type                  :type/DateTimeWithLocalTZ
   :lib/type                   :metadata/field})

(defmethod field-metadata [:products :vendor]
  [_table-name _field-name]
  {:description                nil
   :database-type              "CHARACTER VARYING"
   :semantic-type              :type/Company
   :table-id                   (id :products)
   :coercion-strategy          nil
   :name                       "VENDOR"
   :fingerprint-version        5
   :has-field-values           :auto-list
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Text
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :products :vendor)
   :database-is-auto-increment false
   :position                   4
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Vendor"
   :database-position          4
   :database-required          false
   :fingerprint                {:global {:distinct-count 200, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  0.0
                                                     :average-length 20.6}}}
   :base-type                  :type/Text
   :lib/type                   :metadata/field})

(defmethod field-metadata [:products :ean]
  [_table-name _field-name]
  {:description                nil
   :database-type              "CHARACTER VARYING"
   :semantic-type              nil
   :table-id                   (id :products)
   :coercion-strategy          nil
   :name                       "EAN"
   :fingerprint-version        5
   :has-field-values           :auto-list
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Text
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :products :ean)
   :database-is-auto-increment false
   :position                   1
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Ean"
   :database-position          1
   :database-required          false
   :fingerprint                {:global {:distinct-count 200, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  0.0
                                                     :average-length 13.0}}}
   :base-type                  :type/Text
   :lib/type                   :metadata/field})

(defmethod table-metadata :products
  [_table-name]
  {:description             nil
   :entity-type             :entity/ProductTable
   :schema                  "PUBLIC"
   :show-in-getting-started false
   :name                    "PRODUCTS"
   :active                  true
   :id                      (id :products)
   :db-id                   (id)
   :visibility-type         nil
   :field-order             :database
   :initial-sync-status     "complete"
   :display-name            "Products"
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
   :database-type              "BIGINT"
   :semantic-type              :type/PK
   :table-id                   (id :orders)
   :coercion-strategy          nil
   :name                       "ID"
   :fingerprint-version        0
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/BigInteger
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :orders :id)
   :database-is-auto-increment true
   :position                   0
   :visibility-type            :normal
   :preview-display            true
   :display-name               "ID"
   :database-position          0
   :database-required          false
   :fingerprint                nil
   :base-type                  :type/BigInteger
   :lib/type                   :metadata/field})

(defmethod field-metadata [:orders :subtotal]
  [_table-name _field-name]
  {:description                nil
   :database-type              "DOUBLE PRECISION"
   :semantic-type              nil
   :table-id                   (id :orders)
   :coercion-strategy          nil
   :name                       "SUBTOTAL"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Float
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :orders :subtotal)
   :database-is-auto-increment false
   :position                   3
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Subtotal"
   :database-position          3
   :database-required          false
   :fingerprint                {:global {:distinct-count 334, :nil% 0.0}
                                :type   {:type/Number
                                         {:min 15.69
                                          :q1  49.74982947753719
                                          :q3  105.42859575924612
                                          :max 148.23
                                          :sd  32.536819823931104
                                          :avg 77.012717}}}
   :base-type                  :type/Float
   :lib/type                   :metadata/field})

(defmethod field-metadata [:orders :total]
  [_table-name _field-name]
  {:description                nil
   :database-type              "DOUBLE PRECISION"
   :semantic-type              nil
   :table-id                   (id :orders)
   :coercion-strategy          nil
   :name                       "TOTAL"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Float
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :orders :total)
   :database-is-auto-increment false
   :position                   5
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Total"
   :database-position          5
   :database-required          false
   :fingerprint                {:global {:distinct-count 3710, :nil% 0.0}
                                :type   {:type/Number
                                         {:min 8.94
                                          :q1  51.34487926008301
                                          :q3  110.29697257770795
                                          :max 159.35
                                          :sd  34.264752087910324
                                          :avg 80.35850400000001}}}
   :base-type                  :type/Float
   :lib/type                   :metadata/field})

(defmethod field-metadata [:orders :tax]
  [_table-name _field-name]
  {:description                nil
   :database-type              "DOUBLE PRECISION"
   :semantic-type              nil
   :table-id                   (id :orders)
   :coercion-strategy          nil
   :name                       "TAX"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Float
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :orders :tax)
   :database-is-auto-increment false
   :position                   4
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Tax"
   :database-position          4
   :database-required          false
   :fingerprint                {:global {:distinct-count 797, :nil% 0.0}
                                :type   {:type/Number
                                         {:min 0.0
                                          :q1  2.273340386603857
                                          :q3  5.337275338216307
                                          :max 11.12
                                          :sd  2.3206651358900316
                                          :avg 3.8722100000000004}}}
   :base-type                  :type/Float
   :lib/type                   :metadata/field})

(defmethod field-metadata [:orders :discount]
  [_table-name _field-name]
  {:description                nil
   :database-type              "DOUBLE PRECISION"
   :semantic-type              :type/Discount
   :table-id                   (id :orders)
   :coercion-strategy          nil
   :name                       "DISCOUNT"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Float
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :orders :discount)
   :database-is-auto-increment false
   :position                   6
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Discount"
   :database-position          6
   :database-required          false
   :fingerprint                {:global {:distinct-count 479, :nil% 0.898}
                                :type   {:type/Number {:min 0.17
                                                       :q1  2.978591571097236
                                                       :q3  7.337323315325942
                                                       :max 61.7
                                                       :sd  3.053736975739119
                                                       :avg 5.161009803921569}}}
   :base-type                  :type/Float
   :lib/type                   :metadata/field})

(defmethod field-metadata [:orders :quantity]
  [_table-name _field-name]
  {:description                nil
   :database-type              "INTEGER"
   :semantic-type              :type/Quantity
   :table-id                   (id :orders)
   :coercion-strategy          nil
   :name                       "QUANTITY"
   :fingerprint-version        5
   :has-field-values           :auto-list
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Integer
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :orders :quantity)
   :database-is-auto-increment false
   :position                   8
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Quantity"
   :database-position          8
   :database-required          false
   :fingerprint                {:global {:distinct-count 62, :nil% 0.0}
                                :type   {:type/Number {:min 0.0
                                                       :q1  1.755882607764982
                                                       :q3  4.882654507928044
                                                       :max 100.0
                                                       :sd  4.214258386403798
                                                       :avg 3.7015}}}
   :base-type                  :type/Integer
   :lib/type                   :metadata/field})

(defmethod field-metadata [:orders :created-at]
  [_table-name _field-name]
  {:description                nil
   :database-type              "TIMESTAMP WITH TIME ZONE"
   :semantic-type              :type/CreationTimestamp
   :table-id                   (id :orders)
   :coercion-strategy          nil
   :name                       "CREATED_AT"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/DateTimeWithLocalTZ
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :orders :created-at)
   :database-is-auto-increment false
   :position                   7
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Created At"
   :database-position          7
   :database-required          false
   :fingerprint                {:global {:distinct-count 10000, :nil% 0.0}
                                :type   {:type/DateTime {:earliest "2016-04-30T18:56:13.352Z"
                                                         :latest   "2020-04-19T14:07:15.657Z"}}}
   :base-type                  :type/DateTimeWithLocalTZ
   :lib/type                   :metadata/field})

(defmethod field-metadata [:orders :product-id]
  [_table-name _field-name]
  {:description                nil
   :database-type              "INTEGER"
   :semantic-type              :type/FK
   :table-id                   (id :orders)
   :coercion-strategy          nil
   :name                       "PRODUCT_ID"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         (id :products :id)
   :custom-position            0
   :effective-type             :type/Integer
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :orders :product-id)
   :database-is-auto-increment false
   :position                   2
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Product ID"
   :database-position          2
   :database-required          false
   :fingerprint                {:global {:distinct-count 200, :nil% 0.0}}
   :base-type                  :type/Integer
   :lib/type                   :metadata/field})

(defmethod field-metadata [:orders :user-id]
  [_table-name _field-name]
  {:description                nil
   :database-type              "INTEGER"
   :semantic-type              :type/FK
   :table-id                   (id :orders)
   :coercion-strategy          nil
   :name                       "USER_ID"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         (id :people :id)
   :custom-position            0
   :effective-type             :type/Integer
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :orders :user-id)
   :database-is-auto-increment false
   :position                   1
   :visibility-type            :normal
   :preview-display            true
   :display-name               "User ID"
   :database-position          1
   :database-required          false
   :fingerprint                {:global {:distinct-count 929, :nil% 0.0}}
   :base-type                  :type/Integer
   :lib/type                   :metadata/field})

(defmethod table-metadata :orders
  [_table-name]
  {:description             nil
   :entity-type             :entity/TransactionTable
   :schema                  "PUBLIC"
   :show-in-getting-started false
   :name                    "ORDERS"
   :active                  true
   :id                      (id :orders)
   :db-id                   (id)
   :visibility-type         nil
   :field-order             :database
   :initial-sync-status     "complete"
   :display-name            "Orders"
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
   :database-type              "BIGINT"
   :semantic-type              :type/PK
   :table-id                   (id :people)
   :coercion-strategy          nil
   :name                       "ID"
   :fingerprint-version        0
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/BigInteger
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :people :id)
   :database-is-auto-increment true
   :position                   0
   :visibility-type            :normal
   :preview-display            true
   :display-name               "ID"
   :database-position          0
   :database-required          false
   :fingerprint                nil
   :base-type                  :type/BigInteger
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :state]
  [_table-name _field-name]
  {:description                nil
   :database-type              "CHARACTER VARYING"
   :semantic-type              :type/State
   :table-id                   (id :people)
   :coercion-strategy          nil
   :name                       "STATE"
   :fingerprint-version        5
   :has-field-values           :auto-list
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Text
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :people :state)
   :database-is-auto-increment false
   :position                   7
   :visibility-type            :normal
   :preview-display            true
   :display-name               "State"
   :database-position          7
   :database-required          false
   :fingerprint                {:global {:distinct-count 49, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  1.0
                                                     :average-length 2.0}}}
   :base-type                  :type/Text
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :city]
  [_table-name _field-name]
  {:description                nil
   :database-type              "CHARACTER VARYING"
   :semantic-type              :type/City
   :table-id                   (id :people)
   :coercion-strategy          nil
   :name                       "CITY"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Text
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :people :city)
   :database-is-auto-increment false
   :position                   5
   :visibility-type            :normal
   :preview-display            true
   :display-name               "City"
   :database-position          5
   :database-required          false
   :fingerprint                {:global {:distinct-count 1966, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  0.002
                                                     :average-length 8.284}}}
   :base-type                  :type/Text
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :address]
  [_table-name _field-name]
  {:description                nil
   :database-type              "CHARACTER VARYING"
   :semantic-type              nil
   :table-id                   (id :people)
   :coercion-strategy          nil
   :name                       "ADDRESS"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Text
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :people :address)
   :database-is-auto-increment false
   :position                   1
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Address"
   :database-position          1
   :database-required          false
   :fingerprint                {:global {:distinct-count 2490, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  0.0
                                                     :average-length 20.85}}}
   :base-type                  :type/Text
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :name]
  [_table-name _field-name]
  {:description                nil
   :database-type              "CHARACTER VARYING"
   :semantic-type              :type/Name
   :table-id                   (id :people)
   :coercion-strategy          nil
   :name                       "NAME"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Text
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :people :name)
   :database-is-auto-increment false
   :position                   4
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Name"
   :database-position          4
   :database-required          false
   :fingerprint                {:global {:distinct-count 2499, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  0.0
                                                     :average-length 13.532}}}
   :base-type                  :type/Text
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :source]
  [_table-name _field-name]
  {:description                nil
   :database-type              "CHARACTER VARYING"
   :semantic-type              :type/Source
   :table-id                   (id :people)
   :coercion-strategy          nil
   :name                       "SOURCE"
   :fingerprint-version        5
   :has-field-values           :auto-list
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Text
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :people :source)
   :database-is-auto-increment false
   :position                   8
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Source"
   :database-position          8
   :database-required          false
   :fingerprint                {:global {:distinct-count 5, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  0.0
                                                     :average-length 7.4084}}}
   :base-type                  :type/Text
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :zip]
  [_table-name _field-name]
  {:description                nil
   :database-type              "CHARACTER VARYING"
   :semantic-type              nil
   :table-id                   (id :people)
   :coercion-strategy          nil
   :name                       "ZIP"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Text
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :people :zip)
   :database-is-auto-increment false
   :position                   10
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Zip"
   :database-position          10
   :database-required          false
   :fingerprint                {:global {:distinct-count 2234, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  0.0
                                                     :average-length 5.0}}}
   :base-type                  :type/Text
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :latitude]
  [_table-name _field-name]
  {:description                nil
   :database-type              "DOUBLE PRECISION"
   :semantic-type              :type/Latitude
   :table-id                   (id :people)
   :coercion-strategy          nil
   :name                       "LATITUDE"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Float
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :people :latitude)
   :database-is-auto-increment false
   :position                   11
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Latitude"
   :database-position          11
   :database-required          false
   :fingerprint                {:global {:distinct-count 2491, :nil% 0.0}
                                :type   {:type/Number {:min 25.775827
                                                       :q1  35.302705923023126
                                                       :q3  43.773802584662
                                                       :max 70.6355001
                                                       :sd  6.390832341883712
                                                       :avg 39.87934670484002}}}
   :base-type                  :type/Float
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :password]
  [_table-name _field-name]
  {:description                nil
   :database-type              "CHARACTER VARYING"
   :semantic-type              nil
   :table-id                   (id :people)
   :coercion-strategy          nil
   :name                       "PASSWORD"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Text
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :people :password)
   :database-is-auto-increment false
   :position                   3
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Password"
   :database-position          3
   :database-required          false
   :fingerprint                {:global {:distinct-count 2500, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  0.0
                                                     :average-length 36.0}}}
   :base-type                  :type/Text
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :birth-date]
  [_table-name _field-name]
  {:description                nil
   :database-type              "DATE"
   :semantic-type              nil
   :table-id                   (id :people)
   :coercion-strategy          nil
   :name                       "BIRTH_DATE"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Date
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :people :birth-date)
   :database-is-auto-increment false
   :position                   9
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Birth Date"
   :database-position          9
   :database-required          false
   :fingerprint
   {:global {:distinct-count 2308, :nil% 0.0}
    :type   {:type/DateTime {:earliest "1958-04-26", :latest "2000-04-03"}}}
   :base-type                  :type/Date
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :longitude]
  [_table-name _field-name]
  {:description                nil
   :database-type              "DOUBLE PRECISION"
   :semantic-type              :type/Longitude
   :table-id                   (id :people)
   :coercion-strategy          nil
   :name                       "LONGITUDE"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Float
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :people :longitude)
   :database-is-auto-increment false
   :position                   6
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Longitude"
   :database-position          6
   :database-required          false
   :fingerprint                {:global {:distinct-count 2491, :nil% 0.0}
                                :type   {:type/Number {:min -166.5425726
                                                       :q1  -101.58350792373135
                                                       :q3  -84.65289348288829
                                                       :max -67.96735199999999
                                                       :sd  15.399698968175663
                                                       :avg -95.18741780363999}}}
   :base-type                  :type/Float
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :email]
  [_table-name _field-name]
  {:description                nil
   :database-type              "CHARACTER VARYING"
   :semantic-type              :type/Email
   :table-id                   (id :people)
   :coercion-strategy          nil
   :name                       "EMAIL"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Text
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :people :email)
   :database-is-auto-increment false
   :position                   2
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Email"
   :database-position          2
   :database-required          false
   :fingerprint                {:global {:distinct-count 2500, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  1.0
                                                     :percent-state  0.0
                                                     :average-length 24.1824}}}
   :base-type                  :type/Text
   :lib/type                   :metadata/field})

(defmethod field-metadata [:people :created-at]
  [_table-name _field-name]
  {:description                nil
   :database-type              "TIMESTAMP WITH TIME ZONE"
   :semantic-type              :type/CreationTimestamp
   :table-id                   (id :people)
   :coercion-strategy          nil
   :name                       "CREATED_AT"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/DateTimeWithLocalTZ
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :people :created-at)
   :database-is-auto-increment false
   :position                   12
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Created At"
   :database-position          12
   :database-required          false
   :fingerprint                {:global {:distinct-count 2499, :nil% 0.0}
                                :type   {:type/DateTime {:earliest "2016-04-19T21:35:18.752Z"
                                                         :latest   "2019-04-19T14:06:27.3Z"}}}
   :base-type                  :type/DateTimeWithLocalTZ
   :lib/type                   :metadata/field})

(defmethod table-metadata :people
  [_table-name]
  {:description             nil
   :entity-type             :entity/UserTable
   :schema                  "PUBLIC"
   :show-in-getting-started false
   :name                    "PEOPLE"
   :active                  true
   :id                      (id :people)
   :db-id                   (id)
   :visibility-type         nil
   :field-order             :database
   :initial-sync-status     "complete"
   :display-name            "People"
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
   :database-type              "BIGINT"
   :semantic-type              :type/PK
   :table-id                   (id :reviews)
   :coercion-strategy          nil
   :name                       "ID"
   :fingerprint-version        0
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/BigInteger
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :reviews :id)
   :database-is-auto-increment true
   :position                   0
   :visibility-type            :normal
   :preview-display            true
   :display-name               "ID"
   :database-position          0
   :database-required          false
   :fingerprint                nil
   :base-type                  :type/BigInteger
   :lib/type                   :metadata/field})

(defmethod field-metadata [:reviews :created-at]
  [_table-name _field-name]
  {:description                nil
   :database-type              "TIMESTAMP WITH TIME ZONE"
   :semantic-type              :type/CreationTimestamp
   :table-id                   (id :reviews)
   :coercion-strategy          nil
   :name                       "CREATED_AT"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/DateTimeWithLocalTZ
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :reviews :created-at)
   :database-is-auto-increment false
   :position                   5
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Created At"
   :database-position          5
   :database-required          false
   :fingerprint                {:global {:distinct-count 1112, :nil% 0.0}
                                :type   {:type/DateTime {:earliest "2016-06-03T00:37:05.818Z"
                                                         :latest   "2020-04-19T14:15:25.677Z"}}}
   :base-type                  :type/DateTimeWithLocalTZ
   :lib/type                   :metadata/field})

(defmethod field-metadata [:reviews :rating]
  [_table-name _field-name]
  {:description                nil
   :database-type              "INTEGER"
   :semantic-type              :type/Score
   :table-id                   (id :reviews)
   :coercion-strategy          nil
   :name                       "RATING"
   :fingerprint-version        5
   :has-field-values           :auto-list
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Integer
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :reviews :rating)
   :database-is-auto-increment false
   :position                   3
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Rating"
   :database-position          3
   :database-required          false
   :fingerprint                {:global {:distinct-count 5, :nil% 0.0}
                                :type   {:type/Number {:min 1.0
                                                       :q1  3.54744353181696
                                                       :q3  4.764807071650455
                                                       :max 5.0
                                                       :sd  1.0443899855660577
                                                       :avg 3.987410071942446}}}
   :base-type                  :type/Integer
   :lib/type                   :metadata/field})

(defmethod field-metadata [:reviews :reviewer]
  [_table-name _field-name]
  {:description                nil
   :database-type              "CHARACTER VARYING"
   :semantic-type              nil
   :table-id                   (id :reviews)
   :coercion-strategy          nil
   :name                       "REVIEWER"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Text
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :reviews :reviewer)
   :database-is-auto-increment false
   :position                   2
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Reviewer"
   :database-position          2
   :database-required          false
   :fingerprint                {:global {:distinct-count 1076, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  0.001798561151079137
                                                     :average-length 9.972122302158274}}}
   :base-type                  :type/Text
   :lib/type                   :metadata/field})

(defmethod field-metadata [:reviews :body]
  [_table-name _field-name]
  {:description                nil
   :database-type              "CHARACTER VARYING"
   :semantic-type              nil
   :table-id                   (id :reviews)
   :coercion-strategy          nil
   :name                       "BODY"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         nil
   :custom-position            0
   :effective-type             :type/Text
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :reviews :body)
   :database-is-auto-increment false
   :position                   4
   :visibility-type            :normal
   :preview-display            false
   :display-name               "Body"
   :database-position          4
   :database-required          false
   :fingerprint                {:global {:distinct-count 1112, :nil% 0.0}
                                :type   {:type/Text {:percent-json   0.0
                                                     :percent-url    0.0
                                                     :percent-email  0.0
                                                     :percent-state  0.0
                                                     :average-length 177.41996402877697}}}
   :base-type                  :type/Text
   :lib/type                   :metadata/field})

(defmethod field-metadata [:reviews :product-id]
  [_table-name _field-name]
  {:description                nil
   :database-type              "INTEGER"
   :semantic-type              :type/FK
   :table-id                   (id :reviews)
   :coercion-strategy          nil
   :name                       "PRODUCT_ID"
   :fingerprint-version        5
   :has-field-values           nil
   :settings                   nil
   :fk-target-field-id         (id :products :id)
   :custom-position            0
   :effective-type             :type/Integer
   :active                     true
   :nfc-path                   nil
   :parent-id                  nil
   :id                         (id :reviews :product-id)
   :database-is-auto-increment false
   :position                   1
   :visibility-type            :normal
   :preview-display            true
   :display-name               "Product ID"
   :database-position          1
   :database-required          false
   :fingerprint                {:global {:distinct-count 176, :nil% 0.0}}
   :base-type                  :type/Integer
   :lib/type                   :metadata/field})

(defmethod table-metadata :reviews
  [_table-name]
  {:description             nil
   :entity-type             :entity/GenericTable
   :schema                  "PUBLIC"
   :show-in-getting-started false
   :name                    "REVIEWS"
   :active                  true
   :id                      (id :reviews)
   :db-id                   (id)
   :visibility-type         nil
   :field-order             :database
   :initial-sync-status     "complete"
   :display-name            "Reviews"
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
   :cache-field-values-schedule "0 50 0 * * ? *"
   :timezone                    "UTC"
   :auto-run-queries            true
   :metadata-sync-schedule      "0 50 * * * ? *"
   :name                        "test-data"
   :settings                    nil
   :tables                      [(table-metadata :categories)
                                 (table-metadata :checkins)
                                 (table-metadata :users)
                                 (table-metadata :venues)
                                 (table-metadata :products)
                                 (table-metadata :orders)
                                 (table-metadata :people)
                                 (table-metadata :reviews)]
   :creator-id                  nil
   :is-full-sync                true
   :cache-ttl                   nil
   :is-sample                   false
   :id                          (id)
   :is-on-demand                false
   :options                     nil
   :engine                      :h2
   :initial-sync-status         "complete"
   :dbms-version                {:flavor "H2", :version "2.1.212 (2022-04-09)", :semantic-version [2 1]}
   :refingerprint               nil
   :lib/type                    :metadata/database})

(def metadata-provider
  "[[metabase.lib.metadata.protocols/MetadataProvider]] using the test [[metadata]]."
  (meta.graph-provider/->SimpleGraphMetadataProvider metadata))

(def card-results-metadata
  "Capture of the `result_metadata` saved with a Card with a `SELECT * FROM VENUES;` query. Actually this is a little
  different because this is pre-massaged into the MLv2 shape (it has `:lib/type` and uses `kebab-case` keys), to make
  it easier to use in tests. It should not make a difference because transformation to the MLv2 shape is idempotent...
  and at some point we'll probably update the backend to store stuff in this shape anyway."
  [{:lib/type       :metadata/field
    :display-name   "ID"
    :name           "ID"
    :base-type      :type/BigInteger
    :effective-type :type/BigInteger
    :semantic-type  :type/PK
    :fingerprint    nil}
   {:lib/type       :metadata/field
    :display-name   "NAME"              ; TODO -- these display names are icky
    :name           "NAME"
    :base-type      :type/Text
    :effective-type :type/Text
    :semantic-type  :type/Name
    :fingerprint    {:global {:distinct-count 100, :nil% 0.0}
                     :type   {:type/Text {:percent-json   0.0
                                          :percent-url    0.0
                                          :percent-email  0.0
                                          :percent-state  0.0
                                          :average-length 15.63}}}}
   {:lib/type       :metadata/field
    :display-name   "CATEGORY_ID"
    :name           "CATEGORY_ID"
    :base-type      :type/Integer
    :effective-type :type/Integer
    :semantic-type  :type/FK
    :fingerprint    {:global {:distinct-count 28, :nil% 0.0}
                     :type   {:type/Number
                              {:min 2.0
                               :q1  6.89564392373896
                               :q3  49.240253073352044
                               :max 74.0
                               :sd  23.058108414099443
                               :avg 29.98}}}}
   {:lib/type       :metadata/field
    :display-name   "LATITUDE"
    :name           "LATITUDE"
    :base-type      :type/Float
    :effective-type :type/Float
    :semantic-type  :type/Latitude
    :fingerprint
    {:global {:distinct-count 94, :nil% 0.0}
     :type   {:type/Number {:min 10.0646
                            :q1  34.06098873016278
                            :q3  37.77185
                            :max 40.7794
                            :sd  3.4346725397190827
                            :avg 35.505891999999996}}}}
   {:lib/type       :metadata/field
    :display-name   "LONGITUDE"
    :name           "LONGITUDE"
    :base-type      :type/Float
    :effective-type :type/Float
    :semantic-type  :type/Longitude
    :fingerprint    {:global {:distinct-count 84, :nil% 0.0}
                     :type   {:type/Number
                              {:min -165.374
                               :q1  -122.40857106781186
                               :q3  -118.2635
                               :max -73.9533
                               :sd  14.162810671348238
                               :avg -115.99848699999998}}}}
   {:lib/type       :metadata/field
    :display-name   "PRICE"
    :name           "PRICE"
    :base-type      :type/Integer
    :effective-type :type/Integer
    :semantic-type  nil
    :fingerprint    {:global {:distinct-count 4, :nil% 0.0}
                     :type   {:type/Number
                              {:min 1.0
                               :q1  1.4591129021415095
                               :q3  2.493086095768049
                               :max 4.0
                               :sd  0.7713951678941896
                               :avg 2.03}}}}])

(def qp-results-metadata
  "Capture of the `data.results_metadata` that would come back when running `SELECT * FROM VENUES;` with the Query
  Processor.

  IRL queries actually come back with both `data.cols` and `data.results_metadata.columns`, which are slightly
  different from one another; the frontend merges these together into one unified metadata map. This is both icky and
  silly. I'm hoping we can get away with just using one or the other in the future. So let's try to use just the stuff
  here and see how far we get. If it turns out we need something in `data.cols` that's missing from here, let's just
  add it to `data.results_metadata.columns` in QP results, and add it here as well, so we can start moving toward a
  world where we don't have two versions of the metadata in query responses."
  {:lib/type :metadata/results
   :columns  card-results-metadata})

(def saved-question
  "An representative Saved Question, with [[results-metadata]], against `VENUES`. For testing queries that use a Saved
  Question as their source. See also [[saved-question-CardMetadata]] below."
  {:dataset-query   {:database (id)
                     :type     :query
                     :query    {:source-table (id :venues)}}
   :result-metadata card-results-metadata})

(def saved-question-CardMetadata
  "Mock [[metabase.lib.metadata/CardMetadata]] with a query against `VENUES`."
  (assoc saved-question
         :lib/type :metadata/card
         :id       1
         :name     "Card 1"))

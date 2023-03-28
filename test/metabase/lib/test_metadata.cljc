(ns metabase.lib.test-metadata
  "Test metadata that we can test the new Metadata lib with. This was captured from the same API endpoints that the frontend
  Query Builder hits to power its UI.

  This is captured and hardcoded to make it easy to test the new Metabase lib in ClojureScript land without relying on
  an application database and REST API to provide the metadata. One downside is that changes to the REST API response
  will not be reflected here, for example if we add new information to the metadata. We'll have to manually update
  these things if that happens and Metabase lib is meant to consume it."
  (:require
   [metabase.lib.metadata.graph-provider :as lib.metadata.graph-provider]))

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
        :venues     40)))

  ([table-name field-name]
   (+ random-id-offset
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
                      :price       405)))))

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
   :settings            nil
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
                                 (table-metadata :venues)]
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
  (lib.metadata.graph-provider/->SimpleGraphMetadataProvider metadata))

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
               :field_ref      [:field "ID" {:base-type :type/BigInteger}]
               :name           "ID"
               :base_type      :type/BigInteger
               :effective_type :type/BigInteger
               :semantic_type  :type/PK
               :fingerprint    nil}
              {:lib/type       :metadata/field
               :display_name   "NAME" ; TODO -- these display names are icky
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
  "An representative Saved Question, with [[results-metadata]]. For testing queries that use a Saved Question as their
  source."
  {:dataset_query   {:database (id)
                     :type     :query
                     :query    {:source-table (id :venues)}}
   :result_metadata results-metadata})

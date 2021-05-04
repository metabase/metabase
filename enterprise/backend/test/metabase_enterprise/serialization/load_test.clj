(ns metabase-enterprise.serialization.load-test
  (:refer-clojure :exclude [load])
  (:require [clojure.data :as diff]
            [clojure.java.io :as io]
            [clojure.test :refer [deftest is testing]]
            [metabase-enterprise.serialization.cmd :refer [dump load]]
            [metabase-enterprise.serialization.test-util :as ts]
            [metabase.models :refer [Card Collection Dashboard DashboardCard DashboardCardSeries Database Dependency
                                     Dimension Field FieldValues Metric Pulse PulseCard PulseChannel Segment Table
                                     User]]
            [metabase.test.data.users :as test-users]
            [metabase.util :as u]
            [toucan.db :as db]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.permissions :as qp.perms]
            [metabase.shared.models.visualization-settings :as mb.viz]
            [metabase.shared.util.log :as log]
            [metabase.test :as mt]
            [metabase.util.i18n :refer [deferred-trs trs]])
  (:import org.apache.commons.io.FileUtils))

(defn- delete-directory!
  [file-or-filename]
  (FileUtils/deleteDirectory (io/file file-or-filename)))

(def ^:private dump-dir "test-dump")

(defn- world-snapshot
  []
  (into {} (for [model [Database Table Field Metric Segment Collection Dashboard DashboardCard Pulse
                        Card DashboardCardSeries FieldValues Dimension Dependency PulseCard PulseChannel User]]
             [model (db/select-field :id model)])))

(defmacro with-world-cleanup
  [& body]
  `(let [snapshot# (world-snapshot)]
     (try
       ~@body
       (finally
         (doseq [[model# ids#] (second (diff/diff snapshot# (world-snapshot)))]
           (some->> ids#
                    not-empty
                    (vector :in)
                    (db/delete! model# :id)))))))

(defn- card-query-results [card]
  (let [query (:dataset_query card)]
    (binding [qp.perms/*card-id* nil]
      (qp/process-query (assoc query :async? false) {:card-id (:id card)}))))

(defn- query-res-match
  "Checks that the queries for a card match between original (pre-dump) and new (after load). For now, just checks the
  native form, not actual data, since some of the statements don't have an ordering (thus the rows won't be stable)."
  [orig-results loaded-card]
  (let [card-name   (:name loaded-card)
        orig-result (get orig-results card-name)]
    (try
      (let [new-result  (card-query-results loaded-card)]
        (is (some? orig-result) (format "No original query result found for card: %s" card-name))
        (is (some? new-result) (format "No results produced for loaded card: %s" card-name))
        (is
         (apply = (map #(get-in % [:data :native_form :query]) [orig-result new-result]))
         "Native query form did not match"))
      (catch Exception e
        (let [msg (trs "Failed to execute query for loaded card \"{0}\": {1}" card-name (.getMessage e))]
          (log/error e msg)
          ;; TODO: figure out a better way to simply fail with an explicit message
          (is (nil? e) msg))))))

(defn- collection-name-for-card [card]
  (let [collection-id (:collection_id card)]
    (if (nil? collection-id)
      "root"
      (db/select-one-field :name Collection :id (:collection_id card)))))

(defn- collection-names-match
  "Checks that the collection name for a card matches between original (pre-dump) and new (after load)."
  [collection-names loaded-card]
  (let [card-name (:name loaded-card)]
    (is (= (get collection-names card-name) (collection-name-for-card loaded-card)) "Collection name did not match")))

(defn- gather-orig-results
  "Create a map from card names to their query results"
  [card-ids]
  (reduce (fn [acc card-id]
            (let [card (Card card-id)]
              (assoc acc (:name card) (card-query-results card))))
          {}
          card-ids))

(defn- gather-collections
  "Create a map from card names to their collection names"
  [card-ids]
  (reduce (fn [acc card-id]
            (let [card (Card card-id)]
              (assoc acc (:name card) (collection-name-for-card card))))
          {}
          card-ids))

(defmulti ^:private assert-loaded-entity
  (fn [entity fingerprint]
    (type entity)))

(defmethod assert-loaded-entity (type Card)
  [card {:keys [query-results collections]}]
  (query-res-match query-results card)
  (collection-names-match collections card))

(defn- id->name [model id]
  (db/select-one-field :name model :id id))

(defmethod assert-loaded-entity (type Dashboard)
  [dashboard _]
  (testing "The dashboard card series were loaded correctly"
    (when (= "My Dashboard" (:name dashboard))
      (doseq [dashcard (db/select DashboardCard :dashboard_id (u/the-id dashboard))]
        (doseq [series (db/select DashboardCardSeries :dashboardcard_id (u/the-id dashcard))]
          ;; check that the linked :card_id matches the expected name for each in the series
          ;; based on the entities declared in test_util.clj
          (let [series-pos    (:position series)
                expected-name (case series-pos
                                0 "My Card"
                                1 "My Nested Card"
                                2 ts/root-card-name)]
            (is (= expected-name (db/select-one-field :name Card :id (:card_id series))))
            (case series-pos
              1
              (testing "Top level click action was preserved for dashboard card"
                (let [viz-settings (:visualization_settings dashcard)
                      cb           (:click_behavior viz-settings)]
                  (is (not-empty cb))
                  (is (int? (:targetId cb)))
                  (is (= "My Nested Query Card" (db/select-one-field :name Card :id (:targetId cb))))))
              2
              (testing "Column level click actions were preserved for dashboard card"
                (let [viz-settings   (:visualization_settings dashcard)
                      check-click-fn (fn [[col-key col-value]]
                                       (let [col-ref   (mb.viz/parse-column-ref col-key)
                                             {:keys [::mb.viz/field-id ::mb.viz/column-name]} col-ref
                                             click-bhv (get col-value :click_behavior)
                                             target-id (get click-bhv :targetId)]
                                         (cond
                                           field-id (let [field-nm (id->name Field field-id)]
                                                      (case field-nm
                                                        ;; consider either case for these fields, since they are all
                                                        ;; caps in some (ex: H2) and lowercase in others (ex: Postgres)
                                                        ;; this is simpler than the alternative (dynamically loading
                                                        ;; the expected name based on driver)
                                                        ("price" "PRICE") (is (= "My Card" (id->name Card target-id)))
                                                        ("name" "NAME") (is (=
                                                                             "Root Dashboard"
                                                                             (id->name Dashboard target-id)))
                                                        ("latitude" "LATITUDE") (is (= {:linkType         nil
                                                                                        :parameterMapping {}
                                                                                        :type             "crossfilter"}
                                                                                       click-bhv))))
                                           column-name
                                           (case column-name
                                             "Price Known" (is (= {:type         "link"
                                                                   :linkType     "url"
                                                                   :linkTemplate "/price-info"} click-bhv))))))]
                  (is (not-empty viz-settings))
                  (doall (map check-click-fn (:column_settings viz-settings)))))
              true)))))) ; nothing related to viz settings to check for other series positions
  dashboard)

(defmethod assert-loaded-entity (type Pulse)
  [pulse _]
  (is (some? pulse))
  (let [pulse-cards (db/select PulseCard :pulse_id (u/the-id pulse))]
    (is (= 2 (count pulse-cards)))
    (is (= #{ts/root-card-name "My Card"}
           (into #{} (map (partial db/select-one-field :name Card :id) (map :card_id pulse-cards)))))))

(defmethod assert-loaded-entity :default
  [entity _]
  entity)

(deftest dump-load-entities-test
  (try
    ;; in case it already exists
    (u/ignore-exceptions
      (delete-directory! dump-dir))
    (mt/test-drivers (-> (mt/normal-drivers-with-feature :basic-aggregations :binning :expressions)
                         ;; We will run this roundtrip test against any database supporting these features ^ except
                         ;; certain ones for specific reasons, outlined below.
                         ;;
                         ;; Being able to support all of these would require some significant amount of effort (either
                         ;; to come up with "generic" native queries that will work on all of them, or else possibly
                         ;; using Metabase itself to spit out the native queries, but even then we would need to splice
                         ;; different strings together (ex: the SELECT clause, but replace the WHERE clause with the
                         ;; subquery from the linked card parameter).
                         ;;
                         ;; Because this feature is just about testing serialization itself, and not yet another test of
                         ;; query processor, this seems like an acceptable tradeoff (ex: if they dump and load to the
                         ;; same native form on one database, then it's likely they would on any, since that is
                         ;; orthogonal to the issues that serialization has when performing this roundtrip).
                         (disj :oracle    ; no bare table names allowed
                               :presto    ; no bare table names allowed
                               :redshift  ; bare table name doesn't work; it's test_data_venues instead of venues
                               :snowflake ; bare table name doesn't work; it's test_data_venues instead of venues
                               :sqlserver ; ORDER BY not allowed not allowed in derived tables (subselects)
                               :vertica)) ; bare table name doesn't work; it's test_data_venues instead of venues
      (let [fingerprint (ts/with-world
                          (dump dump-dir (:email (test-users/fetch-user :crowberto)))
                          {:query-results (gather-orig-results [card-id
                                                                card-arch-id
                                                                card-id-root
                                                                card-id-nested
                                                                card-id-nested-query
                                                                card-id-native-query
                                                                card-id-root-to-collection
                                                                card-id-collection-to-root
                                                                card-id-template-tags])
                           :collections   (gather-collections [card-id
                                                               card-arch-id
                                                               card-id-root
                                                               card-id-nested
                                                               card-id-nested-query
                                                               card-id-native-query
                                                               card-id-root-to-collection
                                                               card-id-collection-to-root
                                                               card-id-template-tags])
                           :entities      [[Database      (Database db-id)]
                                           [Table         (Table table-id)]
                                           [Field         (Field numeric-field-id)]
                                           [Field         (Field name-field-id)]
                                           [Field         (Field category-field-id)]
                                           [Field         (Field latitude-field-id)]
                                           [Field         (Field longitude-field-id)]
                                           [Field         (Field category-pk-field-id)]
                                           [Collection    (Collection collection-id)]
                                           [Collection    (Collection collection-id-nested)]
                                           [Metric        (Metric metric-id)]
                                           [Segment       (Segment segment-id)]
                                           [Dashboard     (Dashboard dashboard-id)]
                                           [Dashboard     (Dashboard root-dashboard-id)]
                                           [Card          (Card card-id)]
                                           [Card          (Card card-arch-id)]
                                           [Card          (Card card-id-root)]
                                           [Card          (Card card-id-nested)]
                                           [Card          (Card card-id-nested-query)]
                                           [Card          (Card card-id-native-query)]
                                           [DashboardCard (DashboardCard dashcard-id)]
                                           [DashboardCard (DashboardCard dashcard-top-level-click-id)]
                                           [DashboardCard (DashboardCard dashcard-with-click-actions)]
                                           [Card          (Card card-id-root-to-collection)]
                                           [Card          (Card card-id-collection-to-root)]
                                           [Card          (Card card-id-template-tags)]
                                           [Pulse         (Pulse pulse-id)]]})]
        (with-world-cleanup
          (load dump-dir {:on-error :continue :mode :update})
          (mt/with-db (db/select-one Database :name ts/temp-db-name)
            (doseq [[model entity] (:entities fingerprint)]
              (testing (format "%s \"%s\"" (type model) (:name entity))
                (is (or (-> entity :name nil?)
                        (and (-> entity :archived) ; archived card hasn't been dump-loaded
                             (= (:name entity) "My Arch Card"))
                        (let [loaded (db/select-one model :name (:name entity))]
                          (is (some? loaded) (format
                                              "Failed to find loaded entity with type %s and name %s"
                                              model
                                              (:name entity)))
                          (assert-loaded-entity loaded fingerprint)))
                    (str " failed " (pr-str entity)))))
            fingerprint))))
    (finally
      (delete-directory! dump-dir))))

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
            [metabase.shared.util.log :as log]
            [metabase.shared.models.visualization-settings :as mb.viz]
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
        orig-result (get orig-results (:name loaded-card))]
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

(defn- gather-orig-results [card-ids]
  (reduce (fn [acc card-id]
            (let [card (Card card-id)]
              (assoc acc (:name card) (card-query-results card))))
          {}
          card-ids))

(defmulti ^:private assert-loaded-entity
  (fn [entity & _]
    (type entity)))

(defmethod assert-loaded-entity (type Card)
  [card query-results]
  (query-res-match query-results card))

(defmethod assert-loaded-entity (type Dashboard)
  [dashboard _]
  (testing "The dashboard card series were loaded correctly"
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
          (if (= 2 series-pos)
            (testing "Click action was preserved for dashboard card"
              (let [viz-settings (:visualization_settings dashcard)]
                (is (not-empty viz-settings))
                ;; the click action for this dashboard card should be from the "PRICE" column to the "My Card" card
                (let [target-card-id  (db/select-one-id Card :name "My Card")
                      col-set-key     (-> viz-settings :column_settings keys first)
                      col-set-ref     (mb.viz/parse-column-ref col-set-key)
                      source-field-id (::mb.viz/field-id col-set-ref)
                      actual-card-id  (get-in viz-settings [:column_settings col-set-key :click_behavior :targetId])]
                  (is (some? source-field-id) "Could not parse field id from loaded dashcard column settings key")
                  (is
                   (= "PRICE" (db/select-one-field :name Field :id source-field-id))
                   "Click action column settings key was not \"PRICE\"")
                  (is (= target-card-id actual-card-id) "Click target card ID was not tpreserved")))))))))
  dashboard)

(defmethod assert-loaded-entity :default
  [entity _]
  entity)

(deftest dump-load-entities-test
  (try
    ;; in case it already exists
    (u/ignore-exceptions
      (delete-directory! dump-dir))
    (let [fingerprint (ts/with-world
                        (dump dump-dir (:email (test-users/fetch-user :crowberto)))
                        {:query-results (gather-orig-results [card-id
                                                              card-arch-id
                                                              card-id-root
                                                              card-id-nested
                                                              card-id-nested-query
                                                              card-id-native-query])
                         :entities      [[Database      (Database db-id)]
                                         [Table         (Table table-id)]
                                         [Field         (Field numeric-field-id)]
                                         [Field         (Field category-field-id)]
                                         [Collection    (Collection collection-id)]
                                         [Collection    (Collection collection-id-nested)]
                                         [Metric        (Metric metric-id)]
                                         [Segment       (Segment segment-id)]
                                         [Dashboard     (Dashboard dashboard-id)]
                                         [Card          (Card card-id)]
                                         [Card          (Card card-arch-id)]
                                         [Card          (Card card-id-root)]
                                         [Card          (Card card-id-nested)]
                                         [Card          (Card card-id-nested-query)]
                                         [Card          (Card card-id-native-query)]
                                         [DashboardCard (DashboardCard dashcard-id)]
                                         [DashboardCard (DashboardCard dashcard-with-click-actions)]]})]
      (with-world-cleanup
        (load dump-dir {:on-error :continue :mode :update})
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
                      (assert-loaded-entity loaded (:query-results fingerprint))))
                (str " failed " (pr-str entity)))))
        fingerprint))
    (finally
      #_(delete-directory! dump-dir))))

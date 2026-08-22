(ns ^:mb/driver-tests metabase.test.data.bigquery-cloud-sdk.dataset-lifecycle-test
  "Checks the dataset lifecycle against real BigQuery.

  The decision logic is pure and covered by [[metabase.test.data.bigquery-cloud-sdk.dataset-state-test]]. What can
  only be established against the real service is that the label reads and writes those decisions rest on actually
  behave: that a label written at creation comes back, that *changing* a label sticks, that a listing projects
  labels, and that an ephemeral dataset really gets a table lifetime. If the publish write silently did nothing,
  every dataset would sit unpublished and every run would block until [[bigquery.tx/wait-for-publish!]] timed out.

  Everything here works on freshly named scratch datasets and deletes them again. Nothing calls
  [[bigquery.tx/delete-old-datasets!]]: it sweeps the whole project, and the project is shared with running CI."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.data.bigquery-cloud-sdk :as bigquery.tx]
   [metabase.test.data.bigquery-cloud-sdk.dataset-state :as dataset-state]
   [metabase.util :as u])
  (:import
   (com.google.cloud.bigquery BigQuery BigQuery$DatasetOption Dataset)
   (java.time LocalDate)))

(set! *warn-on-reflection* true)

(def ^:private create-dataset! #'bigquery.tx/create-dataset!)
(def ^:private dataset-labels #'bigquery.tx/dataset-labels)
(def ^:private set-dataset-labels! #'bigquery.tx/set-dataset-labels!)
(def ^:private delete-dataset! #'bigquery.tx/delete-dataset!)

(defn- scratch-dataset-id
  "A dataset id nothing else will pick.

  Inside [[bigquery.tx/dataset-id-prefix]] and labelled ephemeral by every caller here, so one leaked by a killed JVM
  still expires on its own instead of accumulating in the shared project."
  []
  (str bigquery.tx/dataset-id-prefix "lifecycle_" (str/replace (str (random-uuid)) "-" "")))

(defn- default-table-lifetime-ms [dataset-id]
  (let [^BigQuery client (#'bigquery.tx/bigquery)
        ^Dataset dataset (.getDataset client ^String dataset-id (u/varargs BigQuery$DatasetOption))]
    (.getDefaultTableLifetime dataset)))

(defn- do-with-scratch-dataset! [labels f]
  (let [dataset-id (scratch-dataset-id)]
    (create-dataset! dataset-id labels)
    (try
      (f dataset-id)
      (finally
        (u/ignore-exceptions (delete-dataset! dataset-id))))))

(deftest ^:synchronized labels-survive-creation-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "a dataset is created unpublished, so a concurrent run cannot mistake it for loaded"
      (do-with-scratch-dataset!
       (dataset-state/building-labels {:ephemeral? false, :today (LocalDate/now)})
       (fn [dataset-id]
         (let [labels (dataset-labels dataset-id)]
           (is (dataset-state/building? labels))
           (is (not (dataset-state/ready? labels)))
           (is (not (dataset-state/ephemeral? labels)))))))))

(deftest ^:synchronized publish-write-persists-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "the publish write is the whole gate: if changing a label does not stick, nothing is ever published"
      (do-with-scratch-dataset!
       (dataset-state/building-labels {:ephemeral? false, :today (LocalDate/now)})
       (fn [dataset-id]
         (is (not (dataset-state/ready? (dataset-labels dataset-id))))
         (set-dataset-labels! dataset-id (dataset-state/ready-labels {:ephemeral? false, :today (LocalDate/now)}))
         (let [labels (dataset-labels dataset-id)]
           (is (dataset-state/ready? labels))
           (is (not (dataset-state/building? labels)))
           (testing "the rest of the set survives the write, so publishing cannot lose the reaper's markers"
             (is (not (dataset-state/ephemeral? labels)))
             (is (some? (get labels "last_used"))))))))))

(deftest ^:synchronized touch-write-persists-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "recording use must move `last_used` and must not un-publish the dataset"
      (let [old-day (.minusDays (LocalDate/now) 5)]
        (do-with-scratch-dataset!
         (dataset-state/ready-labels {:ephemeral? false, :today old-day})
         (fn [dataset-id]
           (let [before (dataset-labels dataset-id)]
             (is (= (dataset-state/day-stamp old-day) (get before "last_used")))
             (set-dataset-labels! dataset-id (dataset-state/touched-labels before (LocalDate/now)))
             (let [after (dataset-labels dataset-id)]
               (is (= (dataset-state/day-stamp (LocalDate/now)) (get after "last_used")))
               (is (dataset-state/ready? after))))))))))

(deftest ^:synchronized ephemeral-dataset-gets-table-lifetime-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "a work dataset expires its own tables, so a killed test run leaves nothing costing storage"
      (do-with-scratch-dataset!
       (dataset-state/building-labels {:ephemeral? true, :today (LocalDate/now)})
       (fn [dataset-id]
         (is (dataset-state/ephemeral? (dataset-labels dataset-id)))
         (is (pos? (or (default-table-lifetime-ms dataset-id) 0))))))
    (testing "a shared dataset gets none: its tables must not vanish under a run that is using them"
      (do-with-scratch-dataset!
       (dataset-state/building-labels {:ephemeral? false, :today (LocalDate/now)})
       (fn [dataset-id]
         (is (nil? (default-table-lifetime-ms dataset-id))))))))

(deftest ^:synchronized listing-projects-labels-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "the reaper decides from the listing alone; if labels are not projected it silently reaps nothing"
      (do-with-scratch-dataset!
       (dataset-state/ready-labels {:ephemeral? true, :today (LocalDate/now)})
       (fn [dataset-id]
         (let [listed (first (filter (comp #{dataset-id} :dataset-id) (bigquery.tx/datasets-with-labels)))]
           (is (some? listed) "scratch dataset missing from datasets.list")
           (is (dataset-state/ready? (:labels listed)))
           (is (dataset-state/ephemeral? (:labels listed)))))))))

(deftest ^:synchronized deleted-dataset-reads-as-absent-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "a dataset discarded by a failed build reads as absent, which is what lets a waiter stop waiting"
      (let [dataset-id (scratch-dataset-id)]
        (create-dataset! dataset-id (dataset-state/building-labels {:ephemeral? true, :today (LocalDate/now)}))
        (is (some? (dataset-labels dataset-id)))
        (delete-dataset! dataset-id)
        (is (nil? (dataset-labels dataset-id)))))))

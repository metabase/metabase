(ns ^:mb/driver-tests metabase.driver.bigquery-cloud-sdk-timing-test
  "Throwaway probes for the `check-can-connect-before-sync-test` BigQuery timeout. Both tests fail on purpose so that
  CI prints their measurements; neither asserts anything about the numbers. Delete once the numbers are collected."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.bigquery-cloud-sdk :as bigquery]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]))

(set! *warn-on-reflection* true)

(defn- timed
  "Run `thunk`, returning `{:ms <elapsed>}` plus either `:value` or `:threw`. Swallows the throwable so a slow path
  that ends in a timeout still reports its timing instead of aborting the probe."
  [thunk]
  (let [start   (System/nanoTime)
        outcome (try
                  {:value (thunk)}
                  (catch Throwable e
                    {:threw (str (.getName (class e)) ": " (ex-message e))}))]
    (assoc outcome :ms (Math/round (/ (- (System/nanoTime) start) 1e6)))))

(defn- report-str [title report]
  (str "\n" title "\n"
       (str/join "\n" (for [[k v] report]
                        (format "  %-32s %s" (name k) (pr-str v))))
       "\n"))

(defn- fail-with-report!
  "Print the report to stdout as well as failing on it, so the numbers survive in the job log even if a later test
  overruns the job's time limit and no results get published."
  [title report]
  (let [s (report-str title report)]
    ;; stdout on purpose -- this has to land in the raw job log, which is the one place the numbers survive a job
    ;; that gets cut off before results are published
    #_{:clj-kondo/ignore [:discouraged-var]}
    (println s)
    (flush)
    (is (= ::deliberate-failure report) s)))

;;; This probe deliberately builds its details straight from the test env vars instead of going through `mt/db`: it
;;; needs no test dataset to exist, so it cannot be starved by dataset loading and runs in seconds.

(deftest ^{:doc "Fails on purpose"} list-datasets-enumeration-timing-test
  (mt/test-driver :bigquery-cloud-sdk
    ;; These call the driver method directly rather than going through `driver.u/can-connect-with-details?`, so
    ;; nothing caps them at `db-connection-timeout-ms` and the report shows how long the work really takes.
    (let [details    {:project-id           (tx/db-test-env-var :bigquery-cloud-sdk :project-id)
                      :service-account-json (tx/db-test-env-var :bigquery-cloud-sdk :service-account-json)}
          all        (assoc details :dataset-filters-type "all")
          absent     (assoc details
                            :dataset-filters-type "inclusion"
                            :dataset-filters-patterns "no_such_dataset_timing_probe")
          client     (timed #(#'bigquery/database-details->client all))
          ;; `vec` forces the whole lazy seq, so this pages through every dataset in the project
          enumerated (timed #(vec (#'bigquery/list-datasets all)))
          names      (:value enumerated)
          ;; An inclusion filter matching nothing has no match to stop at, so the entire list gets scanned. This is
          ;; the post-destroy half of `check-can-connect-before-sync-test`, and the worst case for any filtered
          ;; database. It throws once the scan comes up empty; `timed` keeps the duration.
          missing    (timed #(driver/can-connect? :bigquery-cloud-sdk absent))]
      (fail-with-report!
       "BigQuery list-datasets enumeration"
       (array-map
        :project-id                   (#'bigquery/get-project-id all)
        :connection-timeout-budget-ms (driver.settings/db-connection-timeout-ms)
        :total-datasets-visible       (count names)
        :build-client-ms              (:ms client)
        :enumerate-all-datasets-ms    (:ms enumerated)
        :can-connect-no-match-ms      (:ms missing)
        :can-connect-no-match-threw   (:threw missing)
        :sha-rel-prefixed             (count (filter #(str/starts-with? % "sha_rel_") names))
        :sha--prefixed                (count (filter #(str/starts-with? % "sha__") names))
        :not-sha-prefixed             (count (remove #(str/starts-with? % "sha_") names))
        :first-10                     (vec (take 10 names))
        :enumerate-threw              (:threw enumerated))))))

(deftest ^{:doc "Fails on purpose"} sync-schema-endpoint-timing-test
  (mt/test-driver :bigquery-cloud-sdk
    ;; Reuses the existing test-data database rather than creating a throwaway dataset the way
    ;; `check-can-connect-before-sync-test` does -- the timeout comes from scanning the project, not from the dataset
    ;; under test, and creating one more dataset per run adds to the pile being measured.
    (let [db-id    (mt/id)
          details  (:details (mt/db))
          ;; the gate the endpoint runs before it will submit the sync task; this is what turns into the 422
          connect  (timed #(driver.u/can-connect-with-details? :bigquery-cloud-sdk details :throw-exceptions))
          endpoint (timed #(mt/user-http-request-full-response
                            :crowberto :post (str "/database/" db-id "/sync_schema")))]
      (fail-with-report!
       "BigQuery POST /api/database/:id/sync_schema timings"
       (array-map
        :connection-timeout-budget-ms (driver.settings/db-connection-timeout-ms)
        :can-connect-ms               (:ms connect)
        :can-connect-value            (:value connect)
        :can-connect-threw            (:threw connect)
        :sync-schema-ms               (:ms endpoint)
        :sync-schema-status           (:status (:value endpoint))
        :sync-schema-body             (:body (:value endpoint))
        :dataset-filters-type         (:dataset-filters-type details)
        :dataset-filters-patterns     (:dataset-filters-patterns details))))))

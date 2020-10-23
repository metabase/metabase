(ns metabase-enterprise.serialization.load-test
  (:refer-clojure :exclude [load])
  (:require [clojure.data :as diff]
            [clojure.java.io :as io]
            [expectations :refer [expect]]
            [metabase
             [models :refer [Card Collection Dashboard DashboardCard DashboardCardSeries Database Dependency Dimension
                             Field FieldValues Metric Pulse PulseCard PulseChannel Segment Table User]]
             [util :as u]]
            [metabase-enterprise.serialization
             [cmd :refer [dump load]]
             [test-util :as ts]]
            [metabase.test.data.users :as test-users]
            [toucan.db :as db])
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

(expect
  (try
    ;; in case it already exists
    (u/ignore-exceptions
      (delete-directory! dump-dir))
    (let [fingerprint (ts/with-world
                        (dump dump-dir (:email (test-users/fetch-user :crowberto)))
                        [[Database      (Database db-id)]
                         [Table         (Table table-id)]
                         [Field         (Field numeric-field-id)]
                         [Field         (Field category-field-id)]
                         [Collection    (Collection collection-id)]
                         [Collection    (Collection collection-id-nested)]
                         [Metric        (Metric metric-id)]
                         [Segment       (Segment segment-id)]
                         [Dashboard     (Dashboard dashboard-id)]
                         [Card          (Card card-id)]
                         [Card          (Card card-id-root)]
                         [Card          (Card card-id-nested)]
                         [DashboardCard (DashboardCard dashcard-id)]])]
      (with-world-cleanup
        (load dump-dir {:on-error :abort :mode :skip})
        (every? (fn [[model entity]]
                  (or (-> entity :name nil?)
                      (db/select-one model :name (:name entity))))
                fingerprint)))
    (finally
      (delete-directory! dump-dir))))

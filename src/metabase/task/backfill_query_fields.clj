(ns metabase.task.backfill-query-fields
  (:require
   #_[clojurewerkz.quartzite.jobs :as jobs]
   #_[clojurewerkz.quartzite.triggers :as triggers]
   [metabase.models.query-field :as query-field]
   #_[metabase.task :as task]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; Still used by tests
#_{:clj-kondo/ignore [:unused-private-var]}
(defn- backfill-query-fields! []
  (let [cards (t2/reducible-select :model/Card :id [:in {:from      [[:report_card :c]]
                                                         :left-join [[:query_field :f] [:= :f.card_id :c.id]]
                                                         :select    [:c.id]
                                                         :where     [:and
                                                                     [:not :c.archived]
                                                                     [:= :f.id nil]]}])]
    (run! query-field/update-query-fields-for-card! cards)))

#_(jobs/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc "Backfill QueryField for cards created earlier. Runs once per instance."}
  BackfillQueryField [_ctx]
  (backfill-query-fields!))

;; Disabling for v50 due to concerns about robustness and correctness of SQL analysis.
#_(defmethod task/init! ::BackfillQueryField [_]
  (let [job     (jobs/build
                  (jobs/of-type BackfillQueryField)
                  (jobs/with-identity (jobs/key "metabase.task.backfill-query-fields.job"))
                  (jobs/store-durably))
        trigger (triggers/build
                  (triggers/with-identity (triggers/key "metabase.task.backfill-query-fields.trigger"))
                  (triggers/start-now))]
    (task/schedule-task! job trigger)))

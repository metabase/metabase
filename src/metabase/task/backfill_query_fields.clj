(ns metabase.task.backfill-query-fields
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.query-analysis :as query-analysis]
   [metabase.task :as task]
   [toucan2.core :as t2])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(defn- backfill-missing-query-fields! []
  (let [cards (t2/reducible-select [:model/Card :id]
                                   {:left-join [[:query_field :f] [:= :f.card_id :report_card.id]]
                                    :where     [:and
                                                [:not :report_card.archived]
                                                [:= :f.id nil]]})]
    (run! query-analysis/analyze-sync! cards)))

(jobs/defjob ^{DisallowConcurrentExecution true
               :doc                        "Backfill QueryField for cards created earlier. Runs once per instance."}
             BackfillQueryField [_ctx]
  (backfill-missing-query-fields!))

(defmethod task/init! ::BackfillQueryField [_]
  (let [job     (jobs/build
                  (jobs/of-type BackfillQueryField)
                  (jobs/with-identity (jobs/key "metabase.task.backfill-query-fields.job"))
                  (jobs/store-durably))
        trigger (triggers/build
                  (triggers/with-identity (triggers/key "metabase.task.backfill-query-fields.trigger"))
                  (triggers/start-now))]
    (task/schedule-task! job trigger)))

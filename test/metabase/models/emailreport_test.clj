(ns metabase.models.emailreport-test
  (:require [clojure.tools.macro :refer [symbol-macrolet]]
            [expectations :refer :all]
            [medley.core :as m]
            [metabase.db :refer :all]
            (metabase.models [pulse :refer :all]
                             [pulse-channel-recipients :refer :all])
            [metabase.test-data :refer :all]
            [metabase.test.util :as tu]))

;; ## UPDATE-RECIPIENTS
;; Check that update-recipients inserts/deletes EmailReportRecipeints as we expect
(expect
    [#{}
     #{:rasta :lucky}
     #{:rasta :lucky :trashbird}
     #{:trashbird}
     #{:crowberto :lucky}
     #{}
     #{:rasta}]
  (tu/with-temp EmailReport [report {:creator_id      (user->id :rasta)
                                     :name            (tu/random-name)
                                     :organization_id @org-id
                                     :dataset_query   {}
                                     :schedule        {}}]
    (symbol-macrolet [recipients (->> (sel :many :field [EmailReportRecipients :user_id] :emailreport_id (:id report))
                                      (map id->user)
                                      set)]
      (let [upd-recipients (fn [& recipient-ids]
                             (update-recipients report (map user->id recipient-ids))
                             recipients)]
        [recipients
         (upd-recipients :rasta :lucky)
         (upd-recipients :rasta :lucky :trashbird)
         (upd-recipients :trashbird)
         (upd-recipients :crowberto :lucky)
         (upd-recipients)
         (upd-recipients :rasta)]))))

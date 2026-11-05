(ns metabase.metabot.tools.static-viz-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.test-util :as test-util]
   [metabase.metabot.tools.recoverable.common :as recoverable.common]
   [metabase.metabot.tools.static-viz :as tools.static-viz]
   [metabase.test :as mt]))

(deftest queues-a-readable-card-test
  (mt/with-temp [:model/Card {card-id :id} {:name "Revenue <by> month"}]
    (mt/with-current-user (mt/user->id :rasta)
      (let [{:keys [output data-parts]} (test-util/call-tool tools.static-viz/static-viz-tool {:entity_id card-id})]
        (testing "the model reads which card it queued, by name"
          (is (re-find (re-pattern (str "Visualization queued for question \"Revenue &lt;by&gt; month\" \\(ID "
                                        card-id "\\)"))
                       output)))
        (testing "and the Slack bridge gets the card to render"
          (is (= [{:type :data :data-type "static_viz" :data {:entity_id card-id}}]
                 data-parts)))))))

(deftest a-card-it-cannot-read-is-not-queued-test
  (testing "an unreadable card and a missing card both return a recoverable error"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Card {card-id :id} {}]
        (mt/with-current-user (mt/user->id :rasta)
          (doseq [id [card-id Integer/MAX_VALUE]]
            (is (= {:class :recoverable
                    :code  ::recoverable.common/not-found
                    :text  (str "Card " id " was not found. It may not exist, or you may not have access to it.\n"
                                "Call `search` to find the entity you want and use an id from the results.")}
                   (test-util/tool-failure tools.static-viz/static-viz-tool {:entity_id id})))))))))

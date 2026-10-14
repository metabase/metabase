(ns metabase.public-sharing.reach-test
  "Tests for the anonymous-reach relation, driven through the anonymous-reach endpoint."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.documents.test-util :as documents.test-util]
   [metabase.models.serialization :as serdes]
   [metabase.public-sharing.reach :as public-sharing.reach]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- embed-cards-in-document!
  "Rewrite the Document with `document-id` so its content embeds each of `card-ids` inline. Done after the cards exist,
  since a `cardEmbed` node carries the card's id."
  [document-id card-ids]
  (t2/update! :model/Document document-id
              {:document (documents.test-util/cards->prose-mirror-ast card-ids)}))

(defn- anonymously-reachable?
  "Whether anything at all reaches the Database with `db-id`, read off the total the anonymous-reach endpoint serves --
  the one count the product has for it."
  [db-id]
  (pos? (:total (mt/user-http-request :crowberto :get 200
                                      (format "database/%d/anonymous-reach" db-id)))))

(deftest anonymously-reachable-unshared-cards-are-not-reachable-test
  (mt/with-temp
    [:model/Database {db-id :id}    {}
     :model/Table    {table-id :id} {:db_id db-id}
     :model/Card     _              {:database_id db-id, :table_id table-id, :type :question}]
    (testing "a database whose cards are neither shared nor published is not reachable anonymously"
      (is (false? (anonymously-reachable? db-id))))))

(deftest anonymously-reachable-public-links-on-another-database-test
  (mt/with-temp
    [:model/Database {db-id :id}       {}
     :model/Database {other-db-id :id} {}
     :model/Table    {table-id :id}    {:db_id other-db-id}
     :model/Card     _                 {:database_id other-db-id
                                        :table_id    table-id
                                        :type        :question
                                        :public_uuid (str (random-uuid))}]
    (testing "a public link on another database does not make this one reachable"
      (is (false? (anonymously-reachable? db-id))))))

(deftest anonymously-reachable-public-dashboard-reaches-database-test
  (mt/with-temp
    [:model/Database      {db-id :id}        {}
     :model/Table         {table-id :id}     {:db_id db-id}
     :model/Card          {card-id :id}      {:database_id db-id, :table_id table-id, :type :question}
     :model/Dashboard     {dashboard-id :id} {:public_uuid (str (random-uuid))}
     :model/DashboardCard _                  {:dashboard_id dashboard-id, :card_id card-id}]
    (testing "a public dashboard holding a card on this database makes it reachable"
      (is (true? (anonymously-reachable? db-id))))))

(deftest anonymously-reachable-public-dashboard-series-reaches-database-test
  (mt/with-temp
    [:model/Database            {db-id :id}        {}
     :model/Table               {table-id :id}     {:db_id db-id}
     :model/Card                {series-id :id}    {:database_id db-id, :table_id table-id, :type :question}
     :model/Dashboard           {dashboard-id :id} {:public_uuid (str (random-uuid))}
     :model/DashboardCard       {dashcard-id :id}  {:dashboard_id dashboard-id, :card_id nil}
     :model/DashboardCardSeries _                  {:dashboardcard_id dashcard-id, :card_id series-id}]
    (testing "a card reached only as a series of a public dashboard's card makes this database reachable"
      (is (true? (anonymously-reachable? db-id))))))

(deftest anonymously-reachable-public-dashboard-on-another-database-test
  (mt/with-temp
    [:model/Database      {db-id :id}        {}
     :model/Database      {other-db-id :id}  {}
     :model/Table         {table-id :id}     {:db_id other-db-id}
     :model/Card          {card-id :id}      {:database_id other-db-id, :table_id table-id, :type :question}
     :model/Dashboard     {dashboard-id :id} {:public_uuid (str (random-uuid))}
     :model/DashboardCard _                  {:dashboard_id dashboard-id, :card_id card-id}]
    (testing "a public dashboard holding no card on this database leaves it unreachable"
      (is (false? (anonymously-reachable? db-id))))))

(deftest anonymously-reachable-card-embedded-in-public-document-reaches-database-test
  (mt/with-temp
    [:model/Database {db-id :id}       {}
     :model/Table    {table-id :id}    {:db_id db-id}
     :model/Document {document-id :id} {:public_uuid (str (random-uuid))}
     :model/Card     {card-id :id}     {:database_id db-id
                                        :table_id    table-id
                                        :type        :question
                                        :document_id document-id}]
    (embed-cards-in-document! document-id [card-id])
    (testing "a card a public document embeds inline makes this database reachable"
      (is (true? (anonymously-reachable? db-id))))))

(deftest anonymously-reachable-card-owned-but-not-embedded-by-public-document-test
  (mt/with-temp
    [:model/Database {db-id :id}       {}
     :model/Table    {table-id :id}    {:db_id db-id}
     :model/Document {document-id :id} {:public_uuid (str (random-uuid))}
     :model/Card     _                 {:database_id db-id
                                        :table_id    table-id
                                        :type        :question
                                        :document_id document-id}]
    (testing "a card a public document owns but does not embed is not served by any public route, so it leaves this
             database unreachable"
      (is (false? (anonymously-reachable? db-id))))))

(deftest anonymously-reachable-unshared-document-is-not-reachable-test
  (mt/with-temp
    [:model/Database {db-id :id}       {}
     :model/Table    {table-id :id}    {:db_id db-id}
     :model/Document {document-id :id} {}
     :model/Card     {card-id :id}     {:database_id db-id
                                        :table_id    table-id
                                        :type        :question
                                        :document_id document-id}]
    (embed-cards-in-document! document-id [card-id])
    (testing "a document with no public link cannot be opened anonymously, so the cards it embeds leave this database
             unreachable"
      (is (false? (anonymously-reachable? db-id))))))

(deftest anonymously-reachable-archived-public-document-is-not-reachable-test
  (mt/with-temp
    [:model/Database {db-id :id}       {}
     :model/Table    {table-id :id}    {:db_id db-id}
     :model/Document {document-id :id} {:public_uuid (str (random-uuid)), :archived true}
     :model/Card     {card-id :id}     {:database_id db-id
                                        :table_id    table-id
                                        :type        :question
                                        :document_id document-id}]
    (embed-cards-in-document! document-id [card-id])
    (testing "an archived document's public link no longer resolves, so it does not make this database reachable"
      (is (false? (anonymously-reachable? db-id))))))

(deftest anonymously-reachable-archived-public-card-is-not-reachable-test
  (mt/with-temp
    [:model/Database {db-id :id}    {}
     :model/Table    {table-id :id} {:db_id db-id}
     :model/Card     _              {:database_id db-id
                                     :table_id    table-id
                                     :type        :question
                                     :archived    true
                                     :public_uuid (str (random-uuid))}]
    (testing "an archived card's public link no longer resolves, so it does not make this database reachable"
      (is (false? (anonymously-reachable? db-id))))))

(deftest anonymously-reachable-archived-public-dashboard-is-not-reachable-test
  (mt/with-temp
    [:model/Database      {db-id :id}        {}
     :model/Table         {table-id :id}     {:db_id db-id}
     :model/Card          {card-id :id}      {:database_id db-id, :table_id table-id, :type :question}
     :model/Dashboard     {dashboard-id :id} {:public_uuid (str (random-uuid)), :archived true}
     :model/DashboardCard _                  {:dashboard_id dashboard-id, :card_id card-id}]
    (testing "an archived dashboard's public link no longer resolves, so it does not make this database reachable"
      (is (false? (anonymously-reachable? db-id))))))

(deftest anonymously-reachable-archived-card-in-public-dashboard-is-not-reachable-test
  (mt/with-temp
    [:model/Database      {db-id :id}        {}
     :model/Table         {table-id :id}     {:db_id db-id}
     :model/Card          {card-id :id}      {:database_id db-id
                                              :table_id    table-id
                                              :type        :question
                                              :archived    true}
     :model/Dashboard     {dashboard-id :id} {:public_uuid (str (random-uuid))}
     :model/DashboardCard _                  {:dashboard_id dashboard-id, :card_id card-id}]
    (testing "an archived card in a public dashboard does not make this database reachable"
      (is (false? (anonymously-reachable? db-id))))))

(deftest anonymously-reachable-embedded-card-reaches-database-test
  (mt/with-temporary-setting-values [enable-embedding-modular true]
    (mt/with-temp
      [:model/Database {db-id :id}    {}
       :model/Table    {table-id :id} {:db_id db-id}
       :model/Card     _              {:database_id      db-id
                                       :table_id         table-id
                                       :type             :question
                                       :enable_embedding true}]
      (testing "a card published as a guest embed makes this database reachable"
        (is (true? (anonymously-reachable? db-id)))))))

(deftest anonymously-reachable-embedded-dashboard-reaches-database-test
  (mt/with-temporary-setting-values [enable-embedding-modular true]
    (mt/with-temp
      [:model/Database      {db-id :id}        {}
       :model/Table         {table-id :id}     {:db_id db-id}
       :model/Card          {card-id :id}      {:database_id db-id, :table_id table-id, :type :question}
       :model/Dashboard     {dashboard-id :id} {:enable_embedding true}
       :model/DashboardCard _                  {:dashboard_id dashboard-id, :card_id card-id}]
      (testing "a dashboard published as a guest embed holding a card on this database makes it reachable"
        (is (true? (anonymously-reachable? db-id)))))))

(deftest anonymously-reachable-embedded-dashboard-series-reaches-database-test
  (mt/with-temporary-setting-values [enable-embedding-modular true]
    (mt/with-temp
      [:model/Database            {db-id :id}        {}
       :model/Table               {table-id :id}     {:db_id db-id}
       :model/Card                {series-id :id}    {:database_id db-id, :table_id table-id, :type :question}
       :model/Dashboard           {dashboard-id :id} {:enable_embedding true}
       :model/DashboardCard       {dashcard-id :id}  {:dashboard_id dashboard-id, :card_id nil}
       :model/DashboardCardSeries _                  {:dashboardcard_id dashcard-id, :card_id series-id}]
      (testing "a card reached only as a series of a published dashboard's card makes this database reachable"
        (is (true? (anonymously-reachable? db-id)))))))

(deftest anonymously-reachable-embedded-dashboard-on-another-database-test
  (mt/with-temporary-setting-values [enable-embedding-modular true]
    (mt/with-temp
      [:model/Database      {db-id :id}        {}
       :model/Database      {other-db-id :id}  {}
       :model/Table         {table-id :id}     {:db_id other-db-id}
       :model/Card          {card-id :id}      {:database_id other-db-id, :table_id table-id, :type :question}
       :model/Dashboard     {dashboard-id :id} {:enable_embedding true}
       :model/DashboardCard _                  {:dashboard_id dashboard-id, :card_id card-id}]
      (testing "a published dashboard holding no card on this database leaves it unreachable"
        (is (false? (anonymously-reachable? db-id)))))))

(deftest anonymously-reachable-archived-embedded-card-is-not-reachable-test
  (mt/with-temporary-setting-values [enable-embedding-modular true]
    (mt/with-temp
      [:model/Database {db-id :id}    {}
       :model/Table    {table-id :id} {:db_id db-id}
       :model/Card     _              {:database_id      db-id
                                       :table_id         table-id
                                       :type             :question
                                       :archived         true
                                       :enable_embedding true}]
      (testing "an archived card's guest embed no longer resolves, so it does not make this database reachable"
        (is (false? (anonymously-reachable? db-id)))))))

(deftest anonymously-reachable-archived-embedded-dashboard-is-not-reachable-test
  (mt/with-temporary-setting-values [enable-embedding-modular true]
    (mt/with-temp
      [:model/Database      {db-id :id}        {}
       :model/Table         {table-id :id}     {:db_id db-id}
       :model/Card          {card-id :id}      {:database_id db-id, :table_id table-id, :type :question}
       :model/Dashboard     {dashboard-id :id} {:enable_embedding true, :archived true}
       :model/DashboardCard _                  {:dashboard_id dashboard-id, :card_id card-id}]
      (testing "an archived dashboard's guest embed no longer resolves, so it does not make this database reachable"
        (is (false? (anonymously-reachable? db-id)))))))

(deftest anonymously-reachable-archived-card-in-embedded-dashboard-is-not-reachable-test
  (mt/with-temporary-setting-values [enable-embedding-modular true]
    (mt/with-temp
      [:model/Database      {db-id :id}        {}
       :model/Table         {table-id :id}     {:db_id db-id}
       :model/Card          {card-id :id}      {:database_id db-id
                                                :table_id    table-id
                                                :type        :question
                                                :archived    true}
       :model/Dashboard     {dashboard-id :id} {:enable_embedding true}
       :model/DashboardCard _                  {:dashboard_id dashboard-id, :card_id card-id}]
      (testing "an archived card in a published dashboard does not make this database reachable"
        (is (false? (anonymously-reachable? db-id)))))))

(deftest anonymously-reachable-guest-embeds-switched-off-site-wide-test
  (mt/with-temporary-setting-values [enable-embedding-modular false]
    (mt/with-temp
      [:model/Database      {db-id :id}        {}
       :model/Table         {table-id :id}     {:db_id db-id}
       :model/Card          {card-id :id}      {:database_id      db-id
                                                :table_id         table-id
                                                :type             :question
                                                :enable_embedding true}
       :model/Dashboard     {dashboard-id :id} {:enable_embedding true}
       :model/DashboardCard _                  {:dashboard_id dashboard-id, :card_id card-id}]
      (testing "with guest embedding switched off site-wide no guest embed renders, so nothing would stop returning
               data and this database is not reachable"
        (is (false? (anonymously-reachable? db-id)))))))

(deftest anonymously-reachable-public-links-switched-off-site-wide-test
  (mt/with-temporary-setting-values [enable-public-sharing false]
    (mt/with-temp
      [:model/Database      {db-id :id}        {}
       :model/Table         {table-id :id}     {:db_id db-id}
       :model/Card          {card-id :id}      {:database_id db-id
                                                :table_id    table-id
                                                :type        :question
                                                :public_uuid (str (random-uuid))}
       :model/Dashboard     {dashboard-id :id} {:public_uuid (str (random-uuid))}
       :model/DashboardCard _                  {:dashboard_id dashboard-id, :card_id card-id}]
      (testing "with public sharing switched off site-wide no public link resolves, so this database is not reachable"
        (is (false? (anonymously-reachable? db-id)))))))

;;; ------------------------------------------- Filter value lists --------------------------------------------------

(defn- card-value-source-parameter
  "A parameter drawing its value list from the Card with `card-id`."
  [card-id]
  {:id                   "_FILTER_"
   :name                 "Filter"
   :slug                 "filter"
   :type                 "string/="
   :values_source_type   "card"
   :values_source_config {:card_id card-id, :value_field ["field" 1 nil]}})

(deftest anonymously-reachable-dashboard-filter-value-list-test
  (mt/with-temp
    [:model/Database  {db-id :id}      {}
     :model/Table     {table-id :id}   {:db_id db-id}
     :model/Card      {source-id :id}  {:database_id db-id, :table_id table-id, :type :question}
     :model/Dashboard _                {:public_uuid (str (random-uuid))
                                        :parameters  [(card-value-source-parameter source-id)]}]
    (testing "a card reached only as a public dashboard filter's value list makes this database reachable, even
             though no card on the dashboard is on it"
      (is (true? (anonymously-reachable? db-id))))))

(deftest anonymously-reachable-question-filter-value-list-test
  (mt/with-temp
    [:model/Database {db-id :id}       {}
     :model/Table    {table-id :id}    {:db_id db-id}
     :model/Card     {source-id :id}   {:database_id db-id, :table_id table-id, :type :question}
     :model/Database {other-db-id :id} {}
     :model/Table    {other-table :id} {:db_id other-db-id}
     :model/Card     _                 {:database_id other-db-id
                                        :table_id    other-table
                                        :type        :question
                                        :public_uuid (str (random-uuid))
                                        :parameters  [(card-value-source-parameter source-id)]}]
    (testing "a card reached only as a public question's own filter value list makes this database reachable"
      (is (true? (anonymously-reachable? db-id))))))

(deftest anonymously-reachable-guest-embed-filter-value-list-needs-an-enabled-parameter-test
  (mt/with-temporary-setting-values [enable-embedding-modular true]
    (testing "a guest embed serves a filter's value list only where its embedding parameters enable that filter, so a
             question drawn on only by a filter the embed leaves disabled is not reachable"
      (mt/with-temp
        [:model/Database  {db-id :id}       {}
         :model/Table     {table-id :id}    {:db_id db-id}
         :model/Card      {source-id :id}   {:database_id db-id, :table_id table-id, :type :question}
         :model/Database  {other-db :id}    {}
         :model/Table     {other-table :id} {:db_id other-db}
         :model/Dashboard _                 {:enable_embedding true
                                             :embedding_params {}
                                             :parameters       [(card-value-source-parameter source-id)]}
         :model/Card      _                 {:database_id      other-db
                                             :table_id         other-table
                                             :type             :question
                                             :enable_embedding true
                                             :embedding_params {}
                                             :parameters       [(card-value-source-parameter source-id)]}]
        (is (false? (anonymously-reachable? db-id)))))
    (testing "and is reachable as soon as the embed enables it"
      (mt/with-temp
        [:model/Database  {db-id :id}     {}
         :model/Table     {table-id :id}  {:db_id db-id}
         :model/Card      {source-id :id} {:database_id db-id, :table_id table-id, :type :question}
         :model/Dashboard _               {:enable_embedding true
                                           :embedding_params {:filter "enabled"}
                                           :parameters       [(card-value-source-parameter source-id)]}]
        (is (true? (anonymously-reachable? db-id)))))
    (testing "a public link has no such whitelist, so the same filter reaches through one"
      (mt/with-temp
        [:model/Database  {db-id :id}     {}
         :model/Table     {table-id :id}  {:db_id db-id}
         :model/Card      {source-id :id} {:database_id db-id, :table_id table-id, :type :question}
         :model/Dashboard _               {:public_uuid      (str (random-uuid))
                                           :enable_embedding true
                                           :embedding_params {}
                                           :parameters       [(card-value-source-parameter source-id)]}]
        (is (true? (anonymously-reachable? db-id)))))))

;;; ------------------------------------------- Chunked id lists ----------------------------------------------------

(deftest anonymously-reachable-is-the-union-over-chunks-test
  (testing "the query cuts every id collection it sends the app DB into chunks, so the answer has to be the union over
           them: with chunks of one, a question on this database that is reached only through the last published
           dashboard still counts"
    (mt/with-temp
      [:model/Database      {db-id :id}       {}
       :model/Database      {other-db :id}    {}
       :model/Table         {table-id :id}    {:db_id db-id}
       :model/Table         {other-table :id} {:db_id other-db}
       :model/Card          {elsewhere :id}   {:database_id other-db, :table_id other-table, :type :question}
       :model/Card          {here :id}        {:database_id db-id, :table_id table-id, :type :question}
       :model/Dashboard     {first-dash :id}  {:public_uuid (str (random-uuid))}
       :model/Dashboard     {second-dash :id} {:public_uuid (str (random-uuid))}
       :model/Dashboard     {third-dash :id}  {:public_uuid (str (random-uuid))}
       :model/DashboardCard _                 {:dashboard_id first-dash, :card_id elsewhere}
       :model/DashboardCard _                 {:dashboard_id second-dash, :card_id elsewhere}
       :model/DashboardCard _                 {:dashboard_id third-dash, :card_id here}
       :model/Database      {unreached :id}   {}]
      (is (true? (anonymously-reachable? db-id)))
      (with-redefs [public-sharing.reach/id-chunk-size 1]
        (is (true? (anonymously-reachable? db-id))
            "chunked one id at a time")
        (is (false? (anonymously-reachable? unreached))
            "and a database nothing published reaches is still not reachable")))))

;;; -------------------------------------------------- Hyperlinks ---------------------------------------------------

(deftest anonymously-reachable-dashboard-click-behaviour-target-test
  (mt/with-temp
    [:model/Database      {db-id :id}        {}
     :model/Table         {table-id :id}     {:db_id db-id}
     :model/Card          {target-id :id}    {:database_id db-id, :table_id table-id, :type :question}
     :model/Dashboard     {dashboard-id :id} {:public_uuid (str (random-uuid))}
     :model/DashboardCard _                  {:dashboard_id           dashboard-id
                                              :card_id                nil
                                              :visualization_settings {:click_behavior {:type     "link"
                                                                                        :linkType "question"
                                                                                        :targetId target-id}}}]
    (testing "a card reached only as a click-behaviour target of a public dashboard is not reachable: opening it needs
             its own public link, and then it stands in the relation on its own account"
      (is (false? (anonymously-reachable? db-id))))))

(deftest anonymously-reachable-dashboard-link-card-target-test
  (mt/with-temp
    [:model/Database      {db-id :id}        {}
     :model/Table         {table-id :id}     {:db_id db-id}
     :model/Card          {target-id :id}    {:database_id db-id, :table_id table-id, :type :question}
     :model/Dashboard     {dashboard-id :id} {:public_uuid (str (random-uuid))}
     :model/DashboardCard _                  {:dashboard_id           dashboard-id
                                              :card_id                nil
                                              :visualization_settings {:virtual_card {:display "link"}
                                                                       :link         {:entity {:id    target-id
                                                                                               :model "card"}}}}]
    (testing "a card reached only by a link card on a public dashboard is not reachable"
      (is (false? (anonymously-reachable? db-id))))))

(deftest anonymously-reachable-document-smart-link-target-test
  (mt/with-temp
    [:model/Database {db-id :id}       {}
     :model/Table    {table-id :id}    {:db_id db-id}
     :model/Document {document-id :id} {:public_uuid (str (random-uuid))}
     :model/Card     {target-id :id}   {:database_id db-id, :table_id table-id, :type :question}]
    (t2/update! :model/Document document-id
                {:document {:type    "doc"
                            :content [{:type  "paragraph"
                                       :content [{:type  "smartLink"
                                                  :attrs {"entityId" target-id
                                                          "model"    "card"
                                                          "label"    "A question"}}]}]}})
    (testing "a card reached only by a public document's smart link is not reachable"
      (is (false? (anonymously-reachable? db-id))))))

;;; -------------------------------------------- Action forms -------------------------------------------------------

(deftest anonymously-reachable-public-action-form-contributes-nothing-test
  (mt/with-actions-enabled
    (mt/with-temp
      [:model/Database {db-id :id}    {}
       :model/Table    {table-id :id} {:db_id db-id}]
      (mt/with-actions [{model-id :id} {:type          :model
                                        :database_id   db-id
                                        :table_id      table-id
                                        :dataset_query {:database db-id
                                                        :type     :query
                                                        :query    {:source-table table-id}}}
                        {} {:database_id   db-id
                            :dataset_query {:database db-id
                                            :type     :native
                                            :native   {:query "UPDATE t SET x = 1"}}}]
        (testing "a published action form on this database contributes nothing to reach"
          (is (false? (anonymously-reachable? db-id))))
        (testing "the same database is reachable once something the relation does cover is published on it, so the
                 case above is not an inert fixture"
          (mt/with-temp [:model/Card _ {:database_id db-id
                                        :table_id    table-id
                                        :type        :question
                                        :public_uuid (str (random-uuid))}]
            (is (true? (anonymously-reachable? db-id))))
          ;; the action's model card is a Card on this database too, and it is not published, so it does not count
          (is (false? (anonymously-reachable? db-id)))
          (is (some? model-id)))))))

;;; ------------------------------- Pinned against serialization's descendant walk ----------------------------------

(defn- serialization-containments
  "What serialization's descendant walk records the entity `model-name`/`id` as containing, as `[model-name id]` pairs."
  [model-name id]
  (set (keys (serdes/descendants model-name id {}))))

(defn- rendered-refs
  "The questions the entity `model`/`id` renders, as `[model-name id]` pairs."
  [model id]
  (let [{:keys [shown value-lists]} (get (public-sharing.reach/rendered-card-ids model {id #{:public-link}}) id)]
    (into #{}
          (map (fn [card-id] ["Card" card-id]))
          (into shown cat (vals value-lists)))))

(defn- assert-pinned-to-containments
  "Assert that `ours`, the questions the entity `model-name`/`id` renders, are serialization's containments for it
  minus exactly those `classification` -- a map of `[model-name id]` to the reason it is not reach -- accounts for."
  [ours model-name id classification]
  (let [theirs (serialization-containments model-name id)]
    (is (empty? (set/difference ours theirs))
        "every edge anonymous reach keeps is a containment serialization records too")
    (is (= (set (keys classification)) (set/difference theirs ours))
        (str "serialization records a containment anonymous reach drops without classifying it; classify it in this"
             " test, as reach or as one of the reasons beside it"))))

(deftest dashboard-renders-pinned-to-containments-test
  (mt/with-actions-enabled
    (mt/with-actions [{} {}]
      (let [action-id (t2/select-one-pk :model/Action)]
        (mt/with-temp
          [:model/Database            {db-id :id}         {}
           :model/Table               {table-id :id}      {:db_id db-id}
           :model/Card                {dashcard-card :id} {:database_id db-id, :table_id table-id}
           :model/Card                {series-card :id}   {:database_id db-id, :table_id table-id}
           :model/Card                {value-source :id}  {:database_id db-id, :table_id table-id}
           :model/Card                {click-target :id}  {:database_id db-id, :table_id table-id}
           :model/Dashboard           {dash-id :id}       {:public_uuid (str (random-uuid))
                                                           :parameters  [(card-value-source-parameter value-source)]}
           :model/DashboardCard       {dashcard :id}      {:dashboard_id dash-id, :card_id dashcard-card}
           :model/DashboardCardSeries _                   {:dashboardcard_id dashcard
                                                           :card_id          series-card
                                                           :position         0}
           :model/DashboardCard       _                   {:dashboard_id           dash-id
                                                           :card_id                nil
                                                           :visualization_settings
                                                           {:click_behavior {:type     "link"
                                                                             :linkType "question"
                                                                             :targetId click-target}}}
           :model/DashboardCard       _                   {:dashboard_id dash-id, :action_id action-id}]
          (assert-pinned-to-containments
           (rendered-refs :model/Dashboard dash-id) "Dashboard" dash-id
           {["Card" click-target] :hyperlink
            ["Action" action-id]  :action-form}))))))

(deftest question-renders-pinned-to-containments-test
  (mt/with-temp
    [:model/Database           {db-id :id}        {}
     :model/Table              {table-id :id}     {:db_id db-id}
     :model/Card               {base-card :id}    {:database_id db-id, :table_id table-id}
     :model/Card               {tag-card :id}     {:database_id db-id, :table_id table-id}
     :model/Card               {value-source :id} {:database_id db-id, :table_id table-id}
     :model/NativeQuerySnippet {snippet-id :id}   {:name    (mt/random-name)
                                                   :content "true"}
     :model/Card               {nested-card :id}  {:database_id   db-id
                                                   :table_id      table-id
                                                   :public_uuid   (str (random-uuid))
                                                   :parameters    [(card-value-source-parameter value-source)]
                                                   :dataset_query {:database db-id
                                                                   :type     :query
                                                                   :query    {:source-table (str "card__" base-card)}}}
     :model/Card               {native-card :id}  {:database_id   db-id
                                                   :table_id      table-id
                                                   :public_uuid   (str (random-uuid))
                                                   :dataset_query
                                                   {:database db-id
                                                    :type     :native
                                                    :native   {:query         "SELECT * FROM {{#card}} WHERE {{snip}}"
                                                               :template-tags {"#card" {:id           "_CARD_"
                                                                                        :name         "#card"
                                                                                        :display-name "#card"
                                                                                        :type         :card
                                                                                        :card-id      tag-card}
                                                                               "snip"  {:id           "_SNIP_"
                                                                                        :name         "snip"
                                                                                        :display-name "snip"
                                                                                        :type         :snippet
                                                                                        :snippet-name "snip"
                                                                                        :snippet-id   snippet-id}}}}}]
    ;; A question's own query is reach but not a containment, so it is removed before the comparison.
    (testing "a question built on another question"
      (let [ours (disj (rendered-refs :model/Card nested-card) ["Card" nested-card])]
        (is (= #{["Card" value-source]} ours)
            "a filter's value-list question is this question's one reach edge out")
        (assert-pinned-to-containments
         ours "Card" nested-card
         {;; a question this one is built on is saved against the same database, so following it reaches nothing the
          ;; question does not already reach
          ["Card" base-card] :same-database})))
    (testing "a native question referencing another question and a snippet"
      (let [ours (disj (rendered-refs :model/Card native-card) ["Card" native-card])]
        (is (empty? ours)
            "a native question with no filters of its own has no reach edge out")
        (assert-pinned-to-containments
         ours "Card" native-card
         {;; a question referenced from a native query is compiled into it against the same database
          ["Card" tag-card]                 :same-database
          ;; a snippet is SQL text; it names no database of its own
          ["NativeQuerySnippet" snippet-id] :no-database})))))

(deftest document-renders-pinned-to-containments-test
  (mt/with-temp
    [:model/Database {db-id :id}         {}
     :model/Table    {table-id :id}      {:db_id db-id}
     :model/Document {document-id :id}   {:public_uuid (str (random-uuid))}
     :model/Dashboard {link-dash-id :id} {}]
    (mt/with-temp
      [:model/Card {embedded :id}     {:database_id db-id, :table_id table-id, :document_id document-id}
       :model/Card {unowned :id}      {:database_id db-id, :table_id table-id}
       :model/Card {link-target :id}  {:database_id db-id, :table_id table-id}]
      (t2/update! :model/Document document-id
                  {:document {:type    "doc"
                              :content [{:type "cardEmbed" :attrs {"id" embedded}}
                                        {:type "cardEmbed" :attrs {"id" unowned}}
                                        {:type    "paragraph"
                                         :content [{:type  "smartLink"
                                                    :attrs {"entityId" link-target, "model" "card"}}
                                                   {:type  "smartLink"
                                                    :attrs {"entityId" link-dash-id, "model" "dashboard"}}]}]}})
      (assert-pinned-to-containments
       (rendered-refs :model/Document document-id) "Document" document-id
       {;; the public document routes serve a card only when the document owns it as well as embedding it
        ["Card" unowned]           :not-served-by-the-document
        ;; following a smart link needs its target published in its own right
        ["Card" link-target]       :hyperlink
        ["Dashboard" link-dash-id] :hyperlink}))))

(ns metabase.metabot.command-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.metabot.command :as metabot.cmd]
            [metabase.metabot.test-util :as metabot.test.u]
            [metabase.models.card :refer [Card]]
            [metabase.models.collection :refer [Collection]]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as group]
            [metabase.test :as mt]
            [metabase.test.data :as data]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [toucan.db :as db]))

(defn- command [& args]
  (tu/with-temporary-setting-values [site-url "https://metabase.mysite.com"]
    (metabot.test.u/with-slack-messages
      (try
        (apply metabot.cmd/command args)
        (catch Throwable e
          (list 'Exception. (.getMessage e)))))))

(defn- venues-count-query []
  {:database (data/id)
   :type     :query
   :query    {:source-table (data/id :venues)
              :aggregation  [[:count]]}})

(deftest command-test
  (testing "with one relevant card"
    (mt/with-temp* [Card [{:keys [name id]}]
                    Card [_ {:archived true}]]
      (let [{:keys [response messages]} (command "list")]
        (is (= []
               messages))
        (is (re= #"(?s)^Here are your \d+ most recent cards.*"
                 response))
        (is (str/includes? response
                           (format "%d.  <https://metabase.mysite.com/question/%d|\"%s\">" id id name))))))
  (testing "with two cards"
    (mt/with-temp* [Card [_]
                    Card [_]]
      (is (re= #"(?s).+\d+ most recent cards.+"
               (metabot.cmd/command "list")))))
  (testing "with only archived cards"
    (mt/with-temp Card [_ {:dataset_query (venues-count-query), :name "Cam's Cool MetaBot Card", :archived true}]
      ;; normally when running tests this will be empty, but if running from the REPL we can skip it.
      (when (empty? (db/select Card :archived false))
        (is (= {:response '(Exception. "Card Cam's Cool MetaBot Card not found.")
                :messages []}
               (command "show" "Cam's Cool MetaBot Card")))
        (is (re= #"You don't have any cards yet\."
                 (metabot.cmd/command "list"))))))
  (testing "with ambiguous matches"
    (mt/with-temp* [Card [{card-1-id :id} {:dataset_query (venues-count-query), :name "Cam's Cool MetaBot Card 1"}]
                    Card [{card-2-id :id} {:dataset_query (venues-count-query), :name "Cam's Cool MetaBot Card 2"}]]
      (is (=
           {:response
            (list
             'Exception.
             (str "Could you be a little more specific, or use the ID? I found these cards with names that matched:"
                  "\n"
                  (format "%d.  <https://metabase.mysite.com/question/%d|\"Cam's Cool MetaBot Card 1\">" card-1-id card-1-id)
                  "\n"
                  (format "%d.  <https://metabase.mysite.com/question/%d|\"Cam's Cool MetaBot Card 2\">" card-2-id card-2-id)))

            :messages []}
           (command "show" "Cam's Cool M")))))
  (testing "with no cards at all"
    ;; Searching by ID
    (is (= {:response (list 'Exception. (tru "Card {0} not found." Integer/MAX_VALUE))
            :messages []}
           (command "show" Integer/MAX_VALUE)))
    ;; Searching by title
    (is (= {:response '(Exception. "Card Cam's Card that doesn't exist at all not found.")
            :messages []}
           (command "show" "Cam's Card that doesn't exist at all"))))
  (testing "with no permission to see the card"
    (mt/with-temp* [Collection [collection]
                    Card       [{card-id :id} {:collection_id (u/the-id collection), :dataset_query (venues-count-query)}]]
      (perms/revoke-collection-permissions! (group/metabot) collection)
      (is (= {:response '(Exception. "You don't have permissions to do that.")
              :messages []}
             (command "show" card-id)))))
  (testing "with an unknown command"
    (is (= {:response (tru "I don''t know how to `overflow stack`. Here''s what I can do: `help`, `list`, `show`")
            :messages []}
           (command "overflow stack"))))
  (testing "calls the correct `pulse/` functions"
    (mt/with-temp Card [{card-id :id} {:dataset_query (venues-count-query)}]
      (is (= {:response "Ok, just a second..."
              :messages `[(~'post-chat-message!
                           nil
                           (~'create-and-upload-slack-attachments!
                            (~'create-slack-attachment-data
                             (~{:card   metabase.models.card.CardInstance
                                :result clojure.lang.PersistentHashMap}))))]}
             (command "show" card-id))))
    (mt/with-temp Card [_ {:dataset_query (venues-count-query), :name "Cam's Cool MetaBot Card"}]
      (is (= {:response "Ok, just a second..."
              :messages `[(~'post-chat-message!
                           nil
                           (~'create-and-upload-slack-attachments!
                            (~'create-slack-attachment-data
                             (~{:card   metabase.models.card.CardInstance
                                :result clojure.lang.PersistentHashMap}))))]}
             (command "show" "Cam's Cool M"))))))

(ns metabase.metabot.command-test
  (:require [expectations :refer [expect]]
            [metabase.metabot
             [command :as metabot.cmd]
             [test-util :as metabot.test.u]]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [permissions :as perms]
             [permissions-group :as group]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [toucan.util.test :as tt]))

;; Check that `metabot/list` returns a string with card information and passes the permissions checks
(expect
  #"2 most recent cards"
  (tt/with-temp* [Card [_]
                  Card [_]]
    (metabot.cmd/command "list")))

;; `metabot/list` shouldn't show archived Cards (#9283)
(expect
  #"1 most recent cards"
  (tt/with-temp* [Card [_]
                  Card [_ {:archived true}]]
    (metabot.cmd/command "list")))

(defn- command [& args]
  (tu/with-temporary-setting-values [site-url "https://metabase.mysite.com"]
    (metabot.test.u/with-slack-messages
      (try
        (apply metabot.cmd/command args)
        (catch Throwable e
          (list 'Exception. (.getMessage e)))))))

;; ok, now let's look at the actual response in its entirety
(tt/expect-with-temp [Card [{:keys [name id]}]
                      Card [_ {:archived true}]]
  {:response (format "Here's your 1 most recent cards:\n%d.  <https://metabase.mysite.com/question/%d|\"%s\">"
                     id id name)
   :messages []}
  (command "list"))

(defn- venues-count-query []
  {:database (data/id)
   :type     :query
   :query    {:source-table (data/id :venues)
              :aggregation  [[:count]]}})

;; Check that when we call the `show` command it passes something resembling what we'd like to the correct `pulse/`
;; functions
(expect
  {:response "Ok, just a second..."
   :messages `[(~'post-chat-message!
                nil
                (~'create-and-upload-slack-attachments!
                 (~'create-slack-attachment-data
                  (~{:card   metabase.models.card.CardInstance
                     :result clojure.lang.PersistentHashMap}))))]}
  (tt/with-temp Card [{card-id :id} {:dataset_query (venues-count-query)}]
    (command "show" card-id)))

;; Show also work when you try to show Card by name
(expect
  {:response "Ok, just a second..."
   :messages `[(~'post-chat-message!
                nil
                (~'create-and-upload-slack-attachments!
                 (~'create-slack-attachment-data
                  (~{:card   metabase.models.card.CardInstance
                     :result clojure.lang.PersistentHashMap}))))]}
  (tt/with-temp Card [_ {:dataset_query (venues-count-query), :name "Cam's Cool MetaBot Card"}]
    (command "show" "Cam's Cool M")))

;; If you try to show more than one Card by name, it should ask you to be more specific
(tt/expect-with-temp [Card [{card-1-id :id} {:dataset_query (venues-count-query), :name "Cam's Cool MetaBot Card 1"}]
                      Card [{card-2-id :id} {:dataset_query (venues-count-query), :name "Cam's Cool MetaBot Card 2"}]]
  {:response
   (list
    'Exception.
    (str "Could you be a little more specific, or use the ID? I found these cards with names that matched:"
         "\n"
         (format "%d.  <https://metabase.mysite.com/question/%d|\"Cam's Cool MetaBot Card 1\">" card-1-id card-1-id)
         "\n"
         (format "%d.  <https://metabase.mysite.com/question/%d|\"Cam's Cool MetaBot Card 2\">" card-2-id card-2-id)))

   :messages []}
  (command "show" "Cam's Cool M"))

;; If you try to show an archived Card it shouldn't work
(expect
  {:response '(Exception. "Card Cam's Cool MetaBot Card not found.")
   :messages []}
  (tt/with-temp Card [_ {:dataset_query (venues-count-query), :name "Cam's Cool MetaBot Card", :archived true}]
    (command "show" "Cam's Cool MetaBot Card")))

;; If you try to show a Card with a name that doesn't exist, you should get a Not Found message.
(expect
  {:response '(Exception. "Card Cam's Card that doesn't exist at all not found.")
   :messages []}
  (command "show" "Cam's Card that doesn't exist at all"))

;; If you try to show a Card with an ID that doesn't exist, you should get a Not Found message.
(expect
  {:response (list 'Exception. (tru "Card {0} not found." Integer/MAX_VALUE))
   :messages []}
  (command "show" Integer/MAX_VALUE))

;; If you try to show a Card that's in a collection that the MetaBot doesn't have permissions for, it should throw an
;; Exception
(expect
  {:response '(Exception. "You don't have permissions to do that.")
   :messages []}
  (tt/with-temp* [Collection [collection]
                  Card       [{card-id :id} {:collection_id (u/get-id collection), :dataset_query (venues-count-query)}]]
    (perms/revoke-collection-permissions! (group/metabot) collection)
    (command "show" card-id)))

;; If you try to use a command that doesn't exist, it should notify user and show results of `help` command.
(expect
  {:response (tru "I don''t know how to `overflow stack`. Here''s what I can do: `help`, `list`, `show`")
   :messages []}
  (command "overflow stack"))

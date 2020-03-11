(ns metabase.metabot.command
  "Implementations of various MetaBot commands."
  (:require [clojure
             [edn :as edn]
             [string :as str]]
            [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [metabase
             [pulse :as pulse]
             [util :as u]]
            [metabase.api.common :refer [*current-user-permissions-set* read-check]]
            [metabase.metabot.slack :as metabot.slack]
            [metabase.models
             [card :refer [Card]]
             [collection :as collection]
             [interface :as mi]
             [permissions :refer [Permissions]]
             [permissions-group :as perms-group]]
            [metabase.util
             [i18n :refer [deferred-tru trs tru]]
             [urls :as urls]]
            [toucan.db :as db]))

;;; ----------------------------------------------------- Perms ------------------------------------------------------

(defn- metabot-permissions
  "Return the set of permissions granted to the MetaBot.

  MetaBot can only interact with Cards, and Cards are always in a collection; thus any non-collection perms are legacy
  and irrelevant."
  []
  (db/select-field :object Permissions
    :group_id (u/get-id (perms-group/metabot))
    :object   [:like "/collection/%"]))

(defn- metabot-visible-collection-ids
  "Set of visible collection IDs, including `nil` if the MetaBot can see the Root Collection."
  []
  (collection/permissions-set->visible-collection-ids (metabot-permissions)))

(defn- do-with-metabot-permissions [f]
  (binding [*current-user-permissions-set* (delay (metabot-permissions))]
    (f)))

(defmacro ^:private with-metabot-permissions
  "Execute BODY with MetaBot's permissions bound to `*current-user-permissions-set*`."
  {:style/indent 0}
  [& body]
  `(do-with-metabot-permissions (fn [] ~@body)))

(defn- filter-metabot-readable [coll]
  (with-metabot-permissions
    (filterv mi/can-read? coll)))


;;; ---------------------------------------------------- Commands ----------------------------------------------------

(defmulti command
  "Run a MetaBot command.

  This multimethod provides implementations of the various MetaBot commands. Slack messages that are interpreted as
  MetaBot commands are split into tokens and passed to this method, e.g.

    [In Slack]
    User: metabot show 100

    [In Metabase]
    (command \"show\" 100) ; -> [some results]

    [In Slack]
    MetaBot: [some results]

  The first argument is the command name, and that name, as a lower-cased keyword, is used as the dispatch value for
  this multimethod.

  The results are normally immediately posted directly to Slack; some commands also post additional messages
  asynchronously, such as `show`."
  {:arglists '([command & args])}
  (fn [command & _]
    (keyword (str/lower-case command))))

(defmethod command :default [command-name & _]
  (str
   (tru "I don''t know how to `{0}`." command-name)
   " "
   (command "help")))


(defmulti ^:private unlisted?
  "Whether this command should be unlisted in the `help` list. Default = `false`."
  identity)

(defmethod unlisted? :default [_] false)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Command Implementations                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; ------------------------------------------------------ list ------------------------------------------------------

(defn- format-cards-list
  "Format a sequence of Cards as a nice multiline list for use in responses."
  [cards]
  (str/join "\n" (for [{id :id, card-name :name} cards]
                   (format "%d.  <%s|\"%s\">" id (urls/card-url id) card-name))))

(defn- list-cards []
  (filter-metabot-readable
   (db/select [Card :id :name :dataset_query :collection_id]
     {:order-by [[:id :desc]]
      :limit    20
      :where    [:and
                 [:= :archived false]
                 (collection/visible-collection-ids->honeysql-filter-clause
                  (metabot-visible-collection-ids))]})))

(defmethod command :list [& _]
  (let [cards (list-cards)]
    (str (deferred-tru "Here''s your {0} most recent cards:" (count cards))
         "\n"
         (format-cards-list cards))))


;;; ------------------------------------------------------ show ------------------------------------------------------

(defn- cards-with-name [card-name]
  (db/select [Card :id :name]
    :%lower.name [:like (str \% (str/lower-case card-name) \%)]
    :archived false
    {:order-by [[:%lower.name :asc]]
     :limit    10}))

(defn- card-with-name [card-name]
  (let [[first-card & more, :as cards] (cards-with-name card-name)]
    (when (seq more)
      (throw
       (Exception.
        (str
         (deferred-tru "Could you be a little more specific, or use the ID? I found these cards with names that matched:")
         "\n"
         (format-cards-list cards)))))
    first-card))

(defn- id-or-name->card [card-id-or-name]
  (cond
    (integer? card-id-or-name)
    (db/select-one [Card :id :name], :id card-id-or-name)

    (or (string? card-id-or-name)
        (symbol? card-id-or-name))
    (card-with-name card-id-or-name)

    :else
    (throw (Exception. (tru "I don''t know what Card `{0}` is. Give me a Card ID or name." card-id-or-name)))))

(defmethod command :show
  ([_]
   (tru "Show which card? Give me a part of a card name or its ID and I can show it to you. If you don''t know which card you want, try `metabot list`."))

  ([_ card-id-or-name]
   (let [{card-id :id} (id-or-name->card card-id-or-name)]
     (when-not card-id
       (throw (Exception. (tru "Card {0} not found." card-id-or-name))))
     (with-metabot-permissions
       (read-check Card card-id))
     (metabot.slack/async
       (let [attachments (pulse/create-and-upload-slack-attachments!
                          (pulse/create-slack-attachment-data
                           [(pulse/execute-card {} card-id, :context :metabot)]))]
         (metabot.slack/post-chat-message! nil attachments)))
     (tru "Ok, just a second...")))

  ;; If the card name comes without spaces, e.g. (show 'my 'wacky 'card) turn it into a string an recur: (show "my
  ;; wacky card")
  ([_ word & more]
   (command "show" (str/join " " (cons word more)))))


;;; ------------------------------------------------------ help ------------------------------------------------------

(defn- listed-commands []
  (sort (for [[k v] (methods command)
              :when (and (not (unlisted? k))
                         (not= k :default))]
          k)))

(defmethod command :help [& _]
  (str
   (deferred-tru "Here''s what I can do: ")
   (str/join ", " (for [cmd (listed-commands)]
                    (str \` (name cmd) \`)))))


;;; -------------------------------------------------- easter eggs ---------------------------------------------------

(def ^:private kanye-quotes
  (delay
    (log/debug (trs "Loading Kanye quotes..."))
    (when-let [url (io/resource "kanye-quotes.edn")]
      (edn/read-string (slurp url)))))

(defmethod command :kanye [& _]
  (str ":kanye:\n> " (rand-nth @kanye-quotes)))

(defmethod unlisted? :kanye [_] true)

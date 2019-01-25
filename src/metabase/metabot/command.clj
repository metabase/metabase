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
             [interface :as mi]
             [permissions :refer [Permissions]]
             [permissions-group :as perms-group]]
            [metabase.util
             [i18n :refer [trs tru]]
             [urls :as urls]]
            [toucan.db :as db]))

;;; ----------------------------------------------------- Perms ------------------------------------------------------

(defn- metabot-permissions
  "Return the set of permissions granted to the MetaBot."
  []
  (db/select-field :object Permissions, :group_id (u/get-id (perms-group/metabot))))

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
    (command \"show\" \"100\") ; -> [some results]

    [In Slack]
    MetaBot: [some results]

  The first argument is the command name, and that name, as a lower-cased keyword, is used as the dispatch value for
  this multimethod.

  The results are normally immediately posted directly to Slack; some commands also post additional messages
  asynchronously, such as `show`."
  (fn [command & _]
    (keyword (str/lower-case command))))

(defmethod command :default [command-name & _]
  (str
   (tru "I don''t know how to `{0}`." command-name)
   " "
   (command :help)))


(defmulti ^:private unlisted?
  "Whether this command should be unlisted in the `help` list. Default = `false`."
  identity)

(defmethod unlisted? :default [_] false)


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            Command Implementations                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; ------------------------------------------------------ list ------------------------------------------------------

(defn- format-cards
  "Format a sequence of Cards as a nice multiline list for use in responses."
  [cards]
  (apply str (interpose "\n" (for [{id :id, card-name :name} cards]
                               (format "%d.  <%s|\"%s\">" id (urls/card-url id) card-name)))))

(defn- list-cards []
  (filter-metabot-readable
   (db/select [Card :id :name :dataset_query :collection_id]
     :archived false
     {:order-by [[:id :desc]]
      :limit    20})))

(defmethod command :list [& _]
  (let [cards (list-cards)]
    (str (tru "Here''s your {0} most recent cards:\n{1}" (count cards) (format-cards cards)))))


;;; ------------------------------------------------------ show ------------------------------------------------------

(defn- card-with-name [card-name]
  (first (u/prog1 (db/select [Card :id :name], :%lower.name [:like (str \% (str/lower-case card-name) \%)])
           (when (> (count <>) 1)
             (throw (Exception.
                     (str (tru "Could you be a little more specific? I found these cards with names that matched:\n{0}"
                               (format-cards <>)))))))))

(defn- id-or-name->card [card-id-or-name]
  (cond
    (integer? card-id-or-name)
    (db/select-one [Card :id :name], :id card-id-or-name)

    (or (string? card-id-or-name)
        (symbol? card-id-or-name))
    (card-with-name card-id-or-name)

    :else
    (throw (Exception. (str (tru "I don''t know what Card `{0}` is. Give me a Card ID or name." card-id-or-name))))))

(defmethod command :show
  ([_]
   (str (tru "Show which card? Give me a part of a card name or its ID and I can show it to you. If you don''t know which card you want, try `metabot list`.")))

  ([_ card-id-or-name]
   (let [{card-id :id} (id-or-name->card card-id-or-name)]
     (when-not card-id
       (throw (Exception. (str (tru "Not Found")))))
     (with-metabot-permissions
       (read-check Card card-id))
     (metabot.slack/async
       (let [attachments (pulse/create-and-upload-slack-attachments!
                          (pulse/create-slack-attachment-data
                           [(pulse/execute-card card-id, :context :metabot)]))]
         (metabot.slack/post-chat-message! nil attachments)))
     (str (tru "Ok, just a second..."))))

  ;; If the card name comes without spaces, e.g. (show 'my 'wacky 'card) turn it into a string an recur: (show "my
  ;; wacky card")
  ([_ word & more]
   (command :show (str/join " " (cons word more)))))


;;; ------------------------------------------------------ help ------------------------------------------------------

(defn- listed-commands []
  (sort (for [[k v] (methods command)
              :when (and (not (unlisted? k))
                         (not= k :default))]
          k)))

(defmethod command :help [& _]
  (str
   (tru "Here''s what I can do: ")
   (str/join ", " (for [cmd (listed-commands)]
                    (str \` (name cmd) \`)))))


;;; -------------------------------------------------- easter eggs ---------------------------------------------------

(def ^:private kanye-quotes
  (delay
   (log/debug (trs "Loading Kanye quotes..."))
   (when-let [data (slurp (io/reader (io/resource "kanye-quotes.edn")))]
     (edn/read-string data))))

(defmethod command :kanye [& _]
  (str ":kanye:\n> " (rand-nth @kanye-quotes)))

(defmethod unlisted? :kanye [_] true)

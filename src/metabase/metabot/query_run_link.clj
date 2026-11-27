(ns metabase.metabot.query-run-link
  "The link from a query run to the Metabot reply that caused it, for a query that the browser runs to draw a chart
  of a reply.

  The browser names the conversation and the assistant message in request headers. [[+query-run-link]] checks them
  and puts the link on the request as [[request-key]], and the endpoint that runs the query records it in the
  query's `:info`. The query processor module cannot call this module, so the request carries the link."
  (:require
   [clojure.string :as str]
   [metabase.metabot.db :as metabot.db]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def conversation-id-header
  "The request header with the id of the MetabotConversation of the chart."
  "x-metabase-metabot-conversation-id")

(def message-id-header
  "The request header with the `external_id` of the assistant MetabotMessage that holds the chart."
  "x-metabase-metabot-message-id")

(def rerun-header
  "The request header that is `true` when the run is not the first run of the chart: the browser draws a chart of
  a conversation that it loaded, not one that the reply just streamed."
  "x-metabase-metabot-rerun")

(def request-key
  "The key of a Ring request that holds the checked link, a map of `:info` keys."
  :metabot/query-run-link)

(defn- header
  [request header-name]
  (let [value (get-in request [:headers header-name])]
    (when-not (str/blank? value)
      (str/trim value))))

(defn- checked-link
  "The link that the headers of `request` name, or nil when they name none, or name a conversation that the current
  user cannot read, or a message that is not in that conversation."
  [request]
  (when-let [conversation-id (header request conversation-id-header)]
    (when-let [conversation (metabot.db/conversation conversation-id)]
      (when (mi/can-read? (t2/hydrate conversation :can_read))
        (let [message (some-> (header request message-id-header) metabot.db/message-by-external-id)]
          (cond-> {:metabot-conversation-id (:id conversation)
                   :metabot-rerun?          (= "true" (some-> (header request rerun-header) u/lower-case-en))}
            (= (:id conversation) (:conversation_id message))
            (assoc :metabot-message-id (:id message))))))))

(defn +query-run-link
  "Ring middleware that puts the link named by the Metabot headers of a request on the request, as [[request-key]].
  A request with headers that do not pass the check runs as it does with no headers: the link is for the record of
  the run, and never a reason to refuse it."
  [handler]
  (fn [request respond raise]
    (handler (if-let [link (try
                             (checked-link request)
                             (catch Throwable e
                               (log/warn e "Failed to check the Metabot link of a query run")
                               nil))]
               (assoc request request-key link)
               request)
             respond
             raise)))

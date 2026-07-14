(ns metabase.agent-api.exports
  "The export store: where the file an agent generated lives until someone clicks the link to it.

   `run_saved_question`'s `export` runs the card once, through the app's own export machinery, and hands the
   agent a URL instead of the bytes — a chat client cannot do anything with a megabyte of base64, and the
   person reading the chat wants a file, not a paste. The bytes are kept because the alternative is to
   re-run the query when the link is fetched, and then the row count the agent reported and the file the user
   opens are answers to the same question asked at two different times. What the agent said is in the file is
   what is in the file.

   A row is keyed by (user, uuid) and carries its own expiry, like the query-handle store next door: the
   download resolves for the user who generated it and for nobody else, and
   [[metabase.agent-api.task.cleanup-expired-exports]] deletes it once it has expired. The link is served by
   `GET /api/agent/v2/export/:id`, which is authenticated like every other route — a leaked URL is not a
   capability."
  (:require
   [java-time.api :as t]
   [metabase.agent-api.models.mcp-export]
   [metabase.agent-api.settings :as agent-api.settings]
   [metabase.channel.urls :as urls]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def max-bytes
  "The largest export file the store will hold.

   The bound is on the file rather than on its rows, because bytes are what the application database and the
   heap that generates them are spent in, and an agent asked to \"export the orders table\" would otherwise
   write tens of megabytes into the app DB on one tool call and keep it there for the whole TTL. A refusal
   names the ways down — narrow the question, or download it from Metabase, which streams to the browser and
   stores nothing."
  (* 32 1024 1024))

(defn- expires-at
  []
  (t/plus (t/offset-date-time) (t/hours (agent-api.settings/mcp-export-ttl-hours))))

(mu/defn store-export! :- [:map [:id :string]]
  "Store `content` (the generated file's bytes) for `user-id` and return the download link's `:id` and the
   `:expires_at` it dies at. Not content-addressed, unlike a query handle: two exports of the same card are two
   snapshots, and the second must not silently replace the first while the caller still holds a link to it."
  [user-id :- :int
   {:keys [card-id filename content-type row-count ^bytes content]}]
  (let [id      (str (random-uuid))
        expires (expires-at)]
    (t2/insert! :model/McpExport
                {:id           id
                 :user_id      user-id
                 :card_id      card-id
                 :filename     filename
                 :content_type content-type
                 :row_count    row-count
                 :content      content
                 :expires_at   expires})
    {:id id :expires_at expires}))

(defn bounded-output-stream
  "`os`, refusing to accept more than [[max-bytes]].

   The refusal has to come while the file is being written, not after: a stream that took every byte and then
   said the file was too big would already have spent the heap it was warning about."
  ^java.io.OutputStream [^java.io.OutputStream os]
  (let [written (volatile! 0)
        check!  (fn [n]
                  (when (< max-bytes (vswap! written + n))
                    (throw (ex-info (str "This export would be larger than " (quot max-bytes (* 1024 1024))
                                         " MB, which is more than a download link can hold. Narrow the "
                                         "question — a `parameters` value, a filter, an aggregation — or "
                                         "download the result from Metabase itself.")
                                    {:status-code 400}))))]
    (proxy [java.io.OutputStream] []
      (write
        ([b]
         (if (bytes? b)
           (let [^bytes b b]
             (check! (alength b))
             (.write os b))
           (do (check! 1)
               (.write os (int b)))))
        ([b off len]
         (check! len)
         (.write os ^bytes b (int off) (int len))))
      (flush [] (.flush os))
      (close [] (.close os)))))

(defn- find-export
  "The live (unexpired) export row `export-id` names, owned by `user-id`. Ownership and expiry are one query,
   so a link that belongs to someone else and a link that has expired are the same answer: there is no such
   download."
  [user-id export-id columns]
  (when (and user-id export-id)
    (t2/select-one (into [:model/McpExport] columns)
                   {:where [:and
                            [:= :id export-id]
                            [:= :user_id user-id]
                            [:> :expires_at :%now]]})))

(defn read-export
  "The stored export `export-id` names for `user-id` — the file's bytes and the headers it is served with — or
   nil if no live export exists."
  [user-id export-id]
  (find-export user-id export-id [:filename :content_type :content]))

(defn export-url
  "The absolute URL that downloads `export-id`. Absolute because the agent hands it to a person in a chat client
   that is not Metabase, and a relative path resolves against the wrong origin there — or against none."
  [export-id]
  (str (urls/site-url) "/api/agent/v2/export/" export-id))

(defn delete-expired-exports!
  "Delete every export past its `expires_at` — the rows [[find-export]] refuses to resolve. Returns the number
   of rows deleted."
  []
  (t2/delete! :model/McpExport {:where [:<= :expires_at :%now]}))

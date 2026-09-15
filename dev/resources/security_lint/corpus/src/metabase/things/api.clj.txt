(ns metabase.things.api
  "Security-lint test example: an authenticated REST namespace exercising the graph features the analyzer must keep."
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.java.shell :as shell]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.request.core :as request]
   [metabase.things.db :as things.db]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [next.jdbc :as jdbc]
   [ring.util.response :as response]
   [toucan2.core :as t2]))

;; taint through a mu/defn with a return schema, then into a SQL sink -- invisible before the mu/defn fix
(mu/defn- table-sql :- :string
  [table :- :string]
  (format "select * from %s" table))

(api.macros/defendpoint :get "/rows/:table" :- :any
  "Reads rows from a caller-named table."
  [{:keys [table]} _query _body]
  (jdbc/execute! nil [(table-sql table)]))

;; a vector route -- the parameter vector must not be mistaken for the route
(api.macros/defendpoint :get ["/file/:name" :name #".+"]
  "Serves a file by caller-supplied name, guarded by an allow-list."
  [{:keys [name]} _query _body]
  (when (re-matches #"^[a-z0-9-]+$" name)
    (io/file "/data" (str name ".txt"))))

;; the else branch of an if is the unvalidated path
(api.macros/defendpoint :get "/other/:name"
  "Serves a file by caller-supplied name, guarded the wrong way round."
  [{:keys [name]} _query _body]
  (if (re-matches #"^[a-z]+$" name)
    :fine
    (io/file "/data" (str name ".txt"))))

;; taint through a threading step into a shell sink
(defn- run-it [cmd] (shell/sh "bash" "-c" (str "echo " cmd)))

(api.macros/defendpoint :post "/run"
  "Runs a caller-supplied command."
  [_route _query {:keys [cmd]}]
  (-> cmd run-it))

;; authorized read: read-check is the fetch
(api.macros/defendpoint :get "/:id"
  "Fetches a thing the current user may read."
  [{:keys [id]} _query _body]
  (api/read-check :model/Thing id))

;; unauthorized read reaching a select with no check on any path
(api.macros/defendpoint :get "/raw/:id"
  "Fetches a thing with no authorization."
  [{:keys [id]} _query _body]
  (things.db/thing id))

;; a request body written straight into a model, outside the DAL
(api.macros/defendpoint :put "/:id"
  "Updates a thing from the request body."
  [{:keys [id]} _query body]
  (t2/update! :model/Thing id body))

;; open redirect via a let and a helper, from a Ring handler rather than a defendpoint
(defn- redirect-to [target] (response/redirect target))

(defn handle-return [request]
  (let [target (get-in request [:params :return-to])]
    (redirect-to target)))

;; a search string reaching a LIKE pattern; a request value, so a warning rather than a note
(api.macros/defendpoint :post "/search"
  "Finds things by name."
  [_route _query {:keys [q]} :- [:map [:q ms/NonBlankString]]]
  (log/warn "searching for" q)
  (things.db/things-named-like q))

;; a value no schema pins to a number, in toucan's pk-or-query position one call away
(api.macros/defendpoint :get "/by-key/:key"
  "Fetches a thing by whatever the caller sent."
  [{:keys [key]} _query _body]
  (things.db/thing-by-key key))

;; a GET that writes, through a helper
(api.macros/defendpoint :get "/:id/touch"
  "Marks a thing as seen."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]] _query _body]
  (things.db/update-thing! id {:seen true}))

;; a credential verified with no throttle on any path
(api.macros/defendpoint :post "/:id/unlock"
  "Unlocks a thing with a password."
  [{:keys [id]} _query {:keys [password]}]
  (when (= password "hunter2") (things.db/thing id)))

;; the denial carries the thing's definition back to the caller who may not read it
(defn- check-readable [thing]
  (when-not (:public thing)
    (throw (ex-info "You may not read this" {:status-code 403 :query (:query thing)}))))

;; runs as the thing's owner, from a request
(api.macros/defendpoint :post "/:id/run"
  "Runs a thing as its owner."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]] _query _body]
  (let [thing (things.db/thing id)]
    (check-readable thing)
    (request/with-current-user (:owner_id thing)
      (things.db/thing id))))

;; a URL stored on the thing, fetched with the raw client: whoever edits things chooses where the server connects
(api.macros/defendpoint :get "/:id/preview"
  "Fetches a thing's preview from its stored URL."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]] _query _body]
  (let [thing (things.db/thing id)]
    (http/get (:preview_url thing))))

;; the body's card id reaches a write with no permission check anywhere on its path, while the route id is
;; write-checked; and the write's row was checked as the wrong model
(api.macros/defendpoint :put "/:id/card"
  "Points a thing at a card."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]] _query {:keys [card_id]} :- [:map [:card_id ms/PositiveInt]]]
  (api/write-check :model/Thing id)
  (things.db/update-thing! id {:card_id card_id}))

(api.macros/defendpoint :put "/:id/archive"
  "Archives a thing after checking its database rather than the thing."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]] _query _body]
  (api/write-check :model/Database (things.db/thing-database-id id))
  (t2/update! :model/Thing id {:archived true}))

;; an id inside each widget of the body, written with no check on that key; and rows of another model
;; returned after checking only the thing
(api.macros/defendpoint :put "/:id/widgets"
  "Rewires a thing's widgets."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]] _query {:keys [widgets]}]
  (api/write-check :model/Thing id)
  (doseq [w widgets]
    (t2/update! :model/Widget (:id w) {:action_id (:action_id w)})))

(api.macros/defendpoint :get "/:id/widgets"
  "Lists widgets of every thing with the same owner as this one."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]] _query _body]
  (let [thing (api/read-check :model/Thing id)]
    (t2/select :model/Widget :owner_id (:owner_id thing))))

;; the same stored URL, fetched through a helper that destructures it off the row
(api.macros/defendpoint :get "/:id/preview-url"
  "Fetches a thing's preview through the destructuring helper."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]] _query _body]
  (http/get (things.db/thing-preview-url id)))

;; a body value with no schema reaches a blessed clause, where it may be a keyword or a clause
(api.macros/defendpoint :post "/owned"
  "Lists the things a user owns."
  [_route _query {:keys [owner]}]
  (things.db/things-owned-by owner))

;; a body value with no schema written into the SQL text
(api.macros/defendpoint :post "/recent"
  "Lists the most recent things."
  [_route _query {:keys [n]}]
  (t2/select :model/Thing {:limit [:inline n]}))

;; dead code must not be scanned
#_(javax.crypto.Cipher/getInstance "DES/ECB/PKCS5Padding")
(comment (java.util.Random.))

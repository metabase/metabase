(ns dev.security-lint.rules.authorization
  "Was *this value* authorized, and against the right object?

  The endpoint rules can say a check is executed somewhere on a path. These ask about the value: a body id that
  reaches the handler's writes without ever being handed to `read-check`, `can-write?` or any of the others; a
  write to one model whose only check was on another. Both rest on the `:checked/<Model>` labels the graph puts
  on a value that passes through an authorization check, in this function or one it was passed to."
  (:require
   [clojure.string :as str]
   [dev.security-lint.ast :as ast]
   [dev.security-lint.rule :refer [defrule]]
   [dev.security-lint.taint :as taint]
   [dev.security-lint.toucan :as toucan]
   [dev.security-lint.vocabulary :as vocab]))

(set! *warn-on-reflection* true)

(def ^:private id-name #"(^|[-_])id$")

(def ^:private not-a-model-id
  "Ids that name no row the caller could choose: a client's load id for a dashboard, a session, a request, the
  current user as the session middleware bound them, an SSO client or browser id, a serialization entity id.
  `load_id` is anchored to a word: a `payload_id` names a row."
  #"(^|[-_])load[-_]id$|session[-_]id$|request[-_]id$|^metabase-user-id$|^request-user-id$|^browser-id$|^client[-_]id$|^provider[-_]id$|entity[-_]id$|^dimension[-_]id$")

(def authz-exempt-files
  "Endpoints authenticated by something other than a session, and authorized by the token rather than by checks.
  Each entry names the mechanism. Public only because the `defrule` hook drops the rule spec from what clj-kondo
  analyzes, so a private var read there alone counts as unused."
  [#"public_sharing_rest/" #"embedding_rest/" #"embedding_hub/"   ; public uuid, signed embed token
   #"session/api\.clj$"                                           ; login: there is no user yet
   #"testing_api/"                                                ; test builds only
   #"scim/"                                                       ; SCIM bearer token
   #"(pulse|notification)/api/unsubscribe\.clj$"                  ; hash carried in the emailed link
   #"sync/api/notify"                                             ; static API key
   #"oauth_server/api/"])                                         ; OAuth protocol flow

(def ^:private unowned-models
  "Models nobody permission-checks a row of: settings are not rows, and the rest are scoped to the current
  user by construction or administered as a whole.

  `User` is deliberately not here: the directory is scoped by tenant and by the `user-visibility` setting, so an
  endpoint that returns it unscoped serves every tenant's users to each tenant."
  #{"setting" "Setting" "UserKeyValue" "LoginHistory" "AuthIdentity" "Session" "ContentTranslation"})

(defn- id-params
  "The symbols in a `defendpoint` parameter vector that name an id: `id`, `card_id`, `dashboard-id`, whether bound
  by `:keys` or by `{card-id :card_id}`. The route, query and body maps are all looked at -- except the query
  parameters of a listing, `GET \"/\"`: `creator_id`, `dashboard_id` there filter what the caller may already
  see, and name nothing to authorize. (`_q` is the second slot; the whole-request slot, when there is one, is
  the fourth.)"
  [node params]
  (let [listing? (and (= ":get" (some-> (ast/arg node 0) ast/->str))
                      (= "/" (some-> (ast/arg node 1) ast/unmeta ast/string-value)))]
    (for [[i [slot _]] (map-indexed vector (taint/param-slots params))
          :let  [slot (ast/unmeta slot)]
          :when (and (ast/map-node? slot) (not (and listing? (= 1 i))))
          sym   (ast/find-nodes ast/symbol-node? slot)
          :when (and (re-find id-name (ast/->str sym)) (not (re-find not-a-model-id (ast/->str sym))))]
      sym)))

(defrule request-id-never-checked
  {:name        "Request id never handed to a permission check"
   :enabled     false
   :description (str "An id the request supplies -- `card_id`, `action_id`, `collection_id` -- is used by the "
                     "endpoint, and on no path is it handed to `read-check`, `write-check`, `can-write?` or any "
                     "other authorization check. Whatever is done with it, the caller chose the object and nobody "
                     "asked whether they may: a notification pointed at any card, a dashcard given any action,a card moved into any collection.")
   :remediation (str "Read-check (or write-check) the object the id names before using it, in the endpoint or the "
                     "function it hands the id to.")
   ;; A warning: an id used only to *filter* a listing the caller may see needs no check, and the rule cannot
   ;; tell that use from a write. It says which id, and the reviewer looks at what is done with it.
   :severity    :warning
   :precision   :medium
   :cwe         "CWE-862"
   :endpoint-rule true
   :exempt-files authz-exempt-files}
  [{:keys [node bindings ns-middleware nearby]}]
  ;; a superuser-only endpoint authorizes the caller, and the caller may name any object
  (when-not (or (some #(str/starts-with? (name %) "+check") ns-middleware)
                (some #(contains? #{"check-superuser" "check-data-analyst"} (name %)) nearby))
    (when-let [params (taint/defendpoint-params node)]
      (let [;; the names the body actually uses; a destructured id nobody reads is nothing to check
            used      (into #{} (map ast/->str)
                            (mapcat #(ast/find-nodes ast/symbol-node? %)
                                    (rest (drop-while #(not= params (ast/unmeta %)) (ast/args node)))))
            unchecked (for [sym   (id-params node params)
                            :let  [nm (ast/->str sym)
                                   ls (get bindings ((juxt :row :col) (meta sym)))]
                            :when (and (contains? used nm) (seq (remove taint/meta-label? ls)) (not-any? taint/check-label? ls))]
                        nm)]
        (when (seq unchecked)
          {:message (str "Request id" (when (next unchecked) "s") " never permission-checked on any path: "
                         (str/join ", " (distinct unchecked)))})))))

(defrule write-checked-against-other-model
  {:name        "Model write authorized by a check on the wrong object"
   :enabled     false
   :description (str "The row a write names was permission-checked -- but as a different model, one that does "
                     "not authorize this write: a Card written after checking its Database rather than its "
                     "collection, a Transform after checking the source database it used to have. The check "
                     "passed, and it was the wrong question.")
   :remediation (str "Check the object being written, or the one that owns it: a card's collection, a "
                     "dashcard's dashboard, a transform's *new* source database.")
   :severity    :warning
   :precision   :medium
   :cwe         "CWE-863"
   :triggers    #{toucan2.core/update! toucan2.core/delete!}}
  [{:keys [node] :as ctx}]
  (when-let [target (toucan/target-model node)]
    (let [pk      (toucan/pk-arg node)
          checks  (when pk (taint/checks ctx pk))
          models  (into #{} (keep #(when (namespace %) (name %))) checks)
          ;; a write scoped to the current user -- `:checked/owner` -- is authorized whatever the model
          allowed (conj (get vocab/model-parents target #{}) target "owner")]
      (when (and (seq checks)
                 ;; an unnamed check -- `(api/write-check obj)` on the fetched object, `(api/write-check
                 ;; (:card_id body))` on one of its keys -- authorizes the object: `:checked`, `:checked.card_id`
                 (not-any? #(nil? (namespace %)) checks)
                 (empty? (filter allowed models)))
        {:message (str "Write to " target " is authorized by a check on " (str/join ", " (sort models)) " only")}))))

(defrule nested-request-id-never-checked
  {:name        "Request id read out of a map and never handed to a permission check"
   :enabled     false
   :description (str "An id read out of request data -- `(:action_id dashcard)` for each dashcard in the body, "
                     "`(get-in body [:values_source_config :card_id])` -- is used, and on no path is *that key* "
                     "handed to a permission check. A check on some other key of the same map does not count: a dashcard's action, a parameter's"
                     "source card, a mapping's target field are each a reference the caller chose.")
   :remediation "Read-check the object each id names, at the point the id is read or in the function it goes to."
   :severity    :warning
   :precision   :medium
   :cwe         "CWE-862"
   :accessor-triggers #{#"(^|[-_])id$"}
   :exempt-files authz-exempt-files}
  [{:keys [node] :as ctx}]
  (let [[m k] (ast/accessor node)
        m     (ast/unmeta m)
        os    (when (ast/symbol-node? m) (taint/origins ctx m))]
    (when (and (seq os)
               (not (re-find not-a-model-id (name k)))
               ;; request data itself -- not a row fetched *by* a request id, which carries the request label
               ;; as anything initialized from one does, and whose own id is the row's
               (contains? os :request)
               ;; a row's id is the row's, and an external service's id (a Slack file, an OAuth client) is no
               ;; row of ours at all
               (not-any? #(contains? #{:app-db :external} (taint/label-kind %)) os))
      (let [checks (taint/checks ctx m)]
        (when ;; the key itself, or the whole map, was never checked
         (not-any? #(let [ck (taint/check-key %)] (or (nil? ck) (= ck k))) checks)
          {:message (str "Request id " k " read from " (ast/->str m) " is never permission-checked on any path")})))))

(defn- returned-forms
  "The body of a `defendpoint` form: everything after its parameter vector."
  [node]
  (when-let [params (taint/defendpoint-params node)]
    (rest (drop-while #(not= params (ast/unmeta %)) (ast/args node)))))

(defrule endpoint-returns-unchecked-rows
  {:name        "Endpoint returns rows of a model it never permission-checked"
   :enabled     false
   :description (str "The response carries rows read from a model, and no check on that model -- or on the "
                     "model that owns it -- runs on any path the values took: a listing of another table's foreign keys carries that"
                     "table's columns, a revision's description carries the names of collections it mentions, a"
                     "bookmark listing carries names past the point access was revoked.")
   :remediation (str "Read-check the object, or filter the listing by what the caller may see with the "
                     "`visible-*` helpers, before returning it.")
   ;; A note: a listing scoped to the current user by construction, or a model with no permissions of its own,
   ;; needs no check, and the rule cannot tell those from a leak. It names the model; the reviewer knows.
   :severity    :note
   :precision   :low
   :cwe         "CWE-862"
   :endpoint-rule true
   :exempt-files (conj authz-exempt-files #"mcp/")}   ; bearer token, checked in the handler
  [{:keys [node ns-middleware nearby] :as ctx}]
  (when-not (or (some #(str/starts-with? (name %) "+check") ns-middleware)
                (some #(contains? #{"check-superuser" "check-data-analyst"} (name %)) nearby))
    (let [body    (returned-forms node)
          ;; the values the body holds, and the checks they passed; an unnamed check -- a visibility filter on
          ;; the query, a write-check on the fetched object -- vouches for everything
          origins (into #{} (mapcat #(taint/origins ctx %)) body)
          checks  (into #{} (mapcat #(taint/checks ctx %)) body)
          checked (into #{} (keep #(when (namespace %) (name %))) checks)
          models  (into #{} (keep #(when (and (= :app-db (taint/label-kind %)) (namespace %)) (name %))) origins)
          leaks   (remove (fn [m]
                            (or (contains? unowned-models m)
                                (contains? checked m)
                                (some checked (get vocab/model-parents m))))
                          (sort models))]
      (when (and (seq leaks)
                 (not (some #(nil? (namespace %)) checks)))
        {:message (str "Returns rows of " (str/join ", " leaks) " with no check on "
                       (if (next leaks) "them" "it") " on any path")}))))

(def ^:private read-side-checks
  "Checks that establish the caller may *see* the object, and nothing about changing it."
  #{"read-check" "can-read?" "can-query?" "query-check" "check-404"})

(defn- write-side-authz?
  "An authorization that vouches for a write: a write/create/update check on an object, a superuser or
  application-permission check on the caller, a query scoped to the caller's own rows, or any check named like one
  in [[vocab/object-checks]] that is not a read-side one."
  [nm]
  (and (or (contains? vocab/authz-names nm) (re-find vocab/object-checks nm))
       (not (contains? read-side-checks nm))))

(def ^:private write-sink
  "A model write, or the write-query executor that actions run: `toucan2.core/update!`, `insert-returning-pk!`,
  `qp.writeback/execute-write-query!`."
  #"^(toucan2\.core/(update|delete|insert(-returning-[a-z]+)?)!|metabase\.query-processor\.writeback/execute-write-query!)$")

(defrule write-reached-under-read-check-only
  {:name        "Endpoint writes after nothing but a read check"
   :enabled     false
   :description (str "The endpoint executes a model write or a write query, and every authorization on its paths "
                     "asks only whether the caller may *see* something: a read-check on a table ahead of a write "
                     "to its rows, a read on a notification ahead of running its card as the creator. Whoever may "
                     "look may then change.")
   :remediation (str "Gate the write on a write-side check -- `write-check`, `can-write?`, `create-check`, "
                     "`check-superuser` -- on the object being changed, or scope the row to the current user.")
   ;; a warning: the write may be to a row the caller owns by construction in a way the graph does not see
   :severity    :warning
   :precision   :medium
   :cwe         "CWE-862"
   :endpoint-rule true
   :exempt-files (conj authz-exempt-files
                       #"setup_rest/"   ; the setup token, first run only
                       #"sso/api")}     ; login and logout write the session; the IdP's assertion is the authorization
  [{:keys [nearby-deep ns-middleware]}]
  (when-not (some #(str/starts-with? (name %) "+check") ns-middleware)
    ;; Both within four hops: `api -> core -> db.clj -> t2` is where an endpoint's own write and its own check
    ;; live. Over the whole closure every query endpoint writes (an execution row, a view log) and every closure
    ;; holds some check, so the rule found nothing; over two hops it missed the check.
    (let [writes (into #{} (comp (map str) (filter #(re-find write-sink %))) nearby-deep)]
      (when (and (seq writes)
                 (not (some #(write-side-authz? (name %)) nearby-deep)))
        {:message (str "Writes (" (str/join ", " (sort (map #(subs % (inc (str/last-index-of % "/"))) writes)))
                       ") with no write-side authorization on any path")}))))

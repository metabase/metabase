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
   [dev.security-lint.vocabulary :as vocab]
   [rewrite-clj.node :as n]))

(set! *warn-on-reflection* true)

(def ^:private id-name #"(^|[-_])id$")

(def ^:private not-a-model-id
  "Ids that name no row the caller could choose: a client's load id for a dashboard, a session, a request, the
  current user as the session middleware bound them, an SSO client or browser id, a serialization entity id."
  #"load[-_]id$|session[-_]id$|request[-_]id$|^metabase-user-id$|^request-user-id$|^browser-id$|^client[-_]id$|^provider[-_]id$|entity[-_]id$|^dimension[-_]id$")

(def ^:private unowned-models
  "Models nobody permission-checks a row of: settings are not rows, and the rest are scoped to the current
  user by construction or administered as a whole."
  #{"setting" "Setting" "UserKeyValue" "LoginHistory" "User" "AuthIdentity" "Session" "ContentTranslation"})

(defn- id-params
  "The symbols in a `defendpoint` parameter vector that name an id: `id`, `card_id`, `dashboard-id`, whether bound
  by `:keys` or by `{card-id :card_id}`. The route, query and body maps are all looked at -- except the query
  parameters of a listing, `GET \"/\"`: `creator_id`, `dashboard_id` there filter what the caller may already
  see, and name nothing to authorize. (`_q` is the second slot; the whole-request slot, when there is one, is
  the fourth.)"
  [node params]
  (let [listing? (and (= ":get" (some-> (ast/arg node 0) ast/->str))
                      (= "/" (some-> (ast/arg node 1) ast/unmeta ast/string-value)))]
    (for [[i slot] (map-indexed vector (ast/children params))
          :let  [slot (ast/unmeta slot)]
          :when (and (ast/map-node? slot) (not (and listing? (= 1 i))))
          sym   (ast/find-nodes ast/symbol-node? slot)
          :when (and (re-find id-name (ast/->str sym)) (not (re-find not-a-model-id (ast/->str sym))))]
      sym)))

(defrule request-id-never-checked
  {:name        "Request id never handed to a permission check"
   :description (str "An id the request supplies -- `card_id`, `action_id`, `collection_id` -- is used by the "
                     "endpoint, and on no path is it handed to `read-check`, `write-check`, `can-write?` or any "
                     "other authorization check. Whatever is done with it, the caller chose the object and nobody "
                     "asked whether they may: a notification repointed at any card, a dashcard given any action, "
                     "a card moved into any collection.")
   :remediation (str "Read-check (or write-check) the object the id names before using it, in the endpoint or the "
                     "function it hands the id to.")
   ;; A warning: an id used only to *filter* a listing the caller may see needs no check, and the rule cannot
   ;; tell that use from a write. It says which id, and the reviewer looks at what is done with it.
   :severity    :warning
   :precision   :medium
   :cwe         "CWE-862"
   :endpoint-rule true
   ;; authenticated by something other than a session, and authorized by the token rather than by checks
   :exempt-files [#"public_sharing_rest/" #"embedding_rest/" #"embedding_hub/" #"session/api\.clj$"
                  #"testing_api/" #"scim/"                          ; SCIM bearer token
                  #"(pulse|notification)/api/unsubscribe\.clj$"     ; hash carried in the emailed link
                  #"sync/api/notify"                                ; static API key
                  #"oauth_server/api/"]}                            ; OAuth protocol flow
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
                            :when (and (contains? used nm) (seq ls) (not-any? taint/check-label? ls))]
                        nm)]
        (when (seq unchecked)
          {:message (str "Request id" (when (next unchecked) "s") " never permission-checked on any path: "
                         (str/join ", " (distinct unchecked)))})))))

(defn- target-model [node]
  (let [m (some-> (ast/arg node 0) ast/unmeta)
        m (if (and (ast/vector-node? m) (seq (ast/children m))) (first (ast/children m)) m)]
    (when (and m (ast/keyword-node? m) (= "model" (namespace (n/sexpr m))))
      (name (n/sexpr m)))))

(defrule write-checked-against-other-model
  {:name        "Model write authorized by a check on the wrong object"
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
  (when-let [target (target-model node)]
    (let [pk      (ast/arg node 1)
          checks  (when pk (taint/checks ctx pk))
          models  (into #{} (keep #(when (namespace %) (name %))) checks)
          ;; a write scoped to the current user -- `:checked/owner` -- is authorized whatever the model
          allowed (conj (get vocab/model-parents target #{}) target "owner")]
      (when (and (seq checks)
                 ;; an unnamed check -- `(api/write-check obj)` on the fetched object -- authorizes the object
                 (not (contains? checks :checked))
                 (empty? (filter allowed models)))
        {:message (str "Write to " target " is authorized by a check on " (str/join ", " (sort models)) " only")}))))

(defrule nested-request-id-never-checked
  {:name        "Request id read out of a map and never handed to a permission check"
   :description (str "An id read out of request data -- `(:action_id dashcard)` for each dashcard in the body, "
                     "`(get-in body [:values_source_config :card_id])` -- is used, and on no path is *that key* "
                     "handed to a permission check. A check on some other key of the same map does not count. "
                     "Dashcard actions, parameter source cards and target fields were all set this way without "
                     "anyone asking whether the caller may.")
   :remediation "Read-check the object each id names, at the point the id is read or in the function it goes to."
   :severity    :warning
   :precision   :medium
   :cwe         "CWE-862"
   :accessor-triggers #{#"(^|[-_])id$"}
   :exempt-files [#"public_sharing_rest/" #"embedding_rest/" #"embedding_hub/" #"session/api\.clj$"
                  #"testing_api/" #"scim/" #"(pulse|notification)/api/unsubscribe\.clj$" #"sync/api/notify"
                  #"oauth_server/api/"]}
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
   :description (str "The response carries rows read from a model, and no check on that model -- or on the "
                     "model that owns it -- runs on any path the values took. A table's foreign keys returned "
                     "full Field rows of tables the caller could not see; revision descriptions resolved names "
                     "of collections the caller could not read; a bookmark listing kept names after access was "
                     "revoked.")
   :remediation (str "Read-check the object, or filter the listing by what the caller may see with the "
                     "`visible-*` helpers, before returning it.")
   ;; A note: a listing scoped to the current user by construction, or a model with no permissions of its own,
   ;; needs no check, and the rule cannot tell those from a leak. It names the model; the reviewer knows.
   :severity    :note
   :precision   :low
   :cwe         "CWE-862"
   :endpoint-rule true
   :exempt-files [#"public_sharing_rest/" #"embedding_rest/" #"embedding_hub/" #"session/api\.clj$"
                  #"testing_api/" #"scim/" #"(pulse|notification)/api/unsubscribe\.clj$" #"sync/api/notify"
                  #"oauth_server/api/" #"mcp/"]}
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

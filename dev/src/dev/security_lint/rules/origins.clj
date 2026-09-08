(ns dev.security-lint.rules.origins
  "Rules about *which* boundary a value crossed, and about two values from different boundaries meeting at one
  sink. None of these could be written while taint was a bit: a credential and a URL both being tainted says
  nothing, a credential from the settings table sent to a host from the settings table says exfiltration."
  (:require
   [clojure.string :as str]
   [dev.security-lint.ast :as ast]
   [dev.security-lint.rule :refer [defrule]]
   [dev.security-lint.taint :as taint]
   [dev.security-lint.vocabulary :as vocab]
   [rewrite-clj.node :as n]))

(set! *warn-on-reflection* true)

(defn- boundary-origins
  "The origins of `node` other than `:local` and the request shape refinements."
  [ctx node]
  (into #{} (remove #{:local :request/untyped :request/structured}) (taint/origins ctx node)))

(defn- describe
  "`app-db (setting), request` -- origins for a message."
  [origins]
  (str/join ", " (sort (map (fn [o] (if (namespace o) (str (namespace o) " (" (name o) ")") (name o))) origins))))

(defn- credential-in?
  "Whether `node`'s subtree carries something named like a credential, or an Authorization header."
  [node]
  (boolean
   (some (fn [nd]
           (or (and (ast/keyword-node? nd) (vocab/credential-name? (ast/->str nd)))
               ;; a symbol anywhere in the options: a local, or the function that fetches the key --
               ;; `(build-headers (get-api-key-or-throw))`
               (and (ast/symbol-node? nd) (re-find #"(?i)password|secret|api[-_]?key|private[-_]?key|credential|access[-_]?key|token" (ast/->str nd))
                    (not (re-find vocab/quantity-word (ast/->str nd))))
               (and (ast/literal-string? nd) (re-find #"(?i)^authorization$" (ast/string-value nd)))
               (and (ast/keyword-node? nd) (contains? #{:oauth-token :basic-auth :digest-auth} (n/sexpr nd)))))
         (ast/find-nodes (fn [nd] (or (ast/keyword-node? nd) (ast/symbol-node? nd) (ast/literal-string? nd))) node))))

(defrule credential-sent-to-boundary-host
  {:name        "Credential sent to a host chosen across a trust boundary"
   :description (str "An HTTP request whose destination came from a setting, a stored row or a request carries a "
                     "credential -- an Authorization header, an API key in the body. Whoever chose the host "
                     "receives the credential: a settings manager repointing the LLM base URL collected the "
                     "vendor key, and an HTTP notification channel forwarded its Authorization header to "
                     "wherever a redirect sent it.")
   :remediation (str "Pin the host, or validate it against an allow-list before attaching the credential; never "
                     "follow redirects with a credential attached.")
   :severity    :error
   :precision   :medium
   :cwe         "CWE-522"
   :triggers    #{clj-http.client/get clj-http.client/post clj-http.client/put clj-http.client/patch
                  clj-http.client/delete clj-http.client/request}}
  [{:keys [node] :as ctx}]
  (let [a0   (ast/arg node 0)
        ;; `(http/request {:url u ...})` carries everything in one map
        url  (if (ast/map-node? a0) (ast/map-get a0 :url) a0)
        opts (if (ast/map-node? a0) a0 (ast/arg node 1))
        os   (when url (boundary-origins ctx url))]
    (when (and (seq os) opts (credential-in? opts))
      {:tainted? true
       :message  (str "Request carries a credential to a host chosen by " (describe os))})))

(def ^:private query-executors
  "Names of the functions that run a query, matched by name inside an identity-switching form."
  #{"process-query" "userland-query" "userland-query-with-default-constraints" "process-query-for-card"
    "process-query-for-dashcard" "process-query-and-save-execution!" "execute-reducible-query"})

(defrule stored-query-runs-as-another-user
  {:name        "Stored query executed under another user's identity"
   :description (str "Inside `with-current-user` or `as-admin`, a query read from the application database is "
                     "executed with that identity's permissions. Whoever could write the query -- a notification "
                     "recipient repointing a card, a model editor scheduling an index refresh -- runs it as the "
                     "creator or as an admin, past every check the caller would have failed.")
   :remediation (str "Run stored queries as the caller and check what the caller may see first; where the "
                     "switch is the design, check the query's source before switching.")
   :severity    :warning
   :precision   :medium
   :cwe         "CWE-269"
   :triggers    #{metabase.request.core/with-current-user metabase.request.core/as-admin
                  metabase.request.core/do-with-current-user metabase.request.core/do-as-admin
                  metabase.request.session/with-current-user metabase.request.session/as-admin
                  metabase.request.session/do-with-current-user metabase.request.session/do-as-admin}}
  [{:keys [node] :as ctx}]
  (let [runs (for [call  (ast/find-nodes ast/call? node)
                   :let  [head (some-> (ast/head-sym call) name)]
                   :when (contains? query-executors head)
                   :let  [q  (ast/arg call 0)
                          os (into #{} (filter #(= :app-db (taint/label-kind %))) (boundary-origins ctx q))]
                   ;; a query whose card was permission-checked on the way runs as whoever, by decision
                   :when (and (seq os) (empty? (taint/checks ctx q)))]
               (str head " of a query from " (describe os)))]
    (when (seq runs)
      {:tainted? true
       :message  (str (name (ast/head-sym node)) " runs " (str/join "; " (distinct runs)))})))

(def ^:private foreign-kinds
  "Origins that are neither the request nor the application database: written by something outside the
  instance altogether."
  #{:file :external :warehouse})

(defrule setting-written-from-boundary
  {:name        "Setting written from data that came from outside the instance"
   :description (str "A setting value taken from a synced document, an HTTP response or warehouse metadata. "
                     "Git-synced content overwrote instance settings this way; a setting that steers "
                     "authentication or outbound traffic rewritten from outside is a takeover.")
   :remediation "Write settings from validated request values or code; treat imported content as content."
   :severity    :error
   :precision   :medium
   :cwe         "CWE-15"
   :triggers    #{metabase.settings.core/set! metabase.settings.core/set-value-of-type!
                  metabase.settings.core/set-many!
                  metabase.settings.models.setting/set! metabase.settings.models.setting/set-value-of-type!
                  metabase.settings.models.setting/set-many!}
   ;; config.yml is the operator's file, and applying its settings section is what that feature is
   :exempt-files [#"advanced_config/"]}
  [{:keys [node] :as ctx}]
  (let [value (last (ast/args node))
        os    (when value (into #{} (filter #(contains? foreign-kinds (taint/label-kind %))) (boundary-origins ctx value)))]
    (when (seq os)
      {:tainted? true
       :message  (str "Setting value comes from " (describe os))})))

(def ^:private allow-list-lookups
  "The rule's own remediation: `(entity->model name)`, `(get allowed name)` -- the model is one of the map's
  values, whatever the name was. A map called as a function has no name pattern of its own beyond the arrow
  and `-map` conventions; `get` on anything counts, since the value in the model position is then a value of
  that thing and not the caller's string."
  (into taint/default-sanitizers ['get 'get-in #"->" #"-map$" #"^resolve-model$"]))

(defrule toucan-model-from-boundary
  {:name        "Toucan model chosen by a value from across a trust boundary"
   :description (str "The model argument of a Toucan call is computed from a request, a document or a row, so "
                     "the caller picks the table: any table on the instance, including the ones holding "
                     "password hashes and warehouse credentials.")
   :remediation "Resolve the model through an allow-list -- a map from the accepted names to `:model/...` keywords."
   ;; An error when the value may be anything -- an untyped request value, a document, an HTTP response; a
   ;; warning when it came out of a row, where the generic data-access helpers `(defn f [model id] ...)` receive
   ;; every model name the codebase stores. A request value an `:enum` schema pins is not reported: it cannot
   ;; name a table the enum does not.
   :severity    {:tainted :error :otherwise :warning}
   :precision   :medium
   :cwe         "CWE-89"
   ;; the calls whose first argument names the model; `hydrate` takes instances and `query` a map
   :triggers    #{toucan2.core/select toucan2.core/select-one toucan2.core/select-one-fn toucan2.core/select-fn-set
                  toucan2.core/select-fn-vec toucan2.core/select-one-pk toucan2.core/select-pks-set
                  toucan2.core/select-pks-vec toucan2.core/select-fn->fn toucan2.core/select-pk->fn
                  toucan2.core/update! toucan2.core/delete! toucan2.core/exists? toucan2.core/count
                  toucan2.core/insert! toucan2.core/insert-returning-instance! toucan2.core/insert-returning-pk!}}
  [{:keys [node] :as ctx}]
  (let [model (some-> (ast/arg node 0) ast/unmeta)
        ;; `:model/Card` and `[:model/Card :id :name]` are literal; a computed keyword or a local is not. A map
        ;; is a query, and the selected model is inside it.
        literal? (or (ast/keyword-node? model)
                     (ast/map-node? model)
                     (and (ast/vector-node? model) (ast/keyword-node? (first (ast/children model)))))
        ;; over the untyped positions only, whose labels are the shape refinements; a request value there
        ;; reads as the request
        os    (when (and model (not literal?))
                (into #{} (comp (remove #{:local}) (map #(if (= :request/untyped %) :request %)))
                      (taint/origins (assoc ctx :locals (:untyped-locals ctx)) model {:sanitizers allow-list-lookups})))]
    (when (seq os)
      {:tainted? (boolean (some #(contains? #{:request :file :external :warehouse} (taint/label-kind %)) os))
       :message  (str "Model chosen by a value from " (describe os) ": " (ast/->str model))})))

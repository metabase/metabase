(ns dev.security-lint.rules.middleware
  "What runs before the caller is known.

  Ring middleware wraps every route and runs ahead of the session check, so whatever it does with a header or a
  cookie, it does for an anonymous caller on every request. The endpoint rules start at `defendpoint`, and a
  `wrap-*` function is not one, so the graph treats middleware as an entry of its own kind (`:middleware`,
  anonymous), and this rule asks what a value from the request does once it gets there."
  (:require
   [clojure.string :as str]
   [dev.security-lint.ast :as ast]
   [dev.security-lint.rule :refer [defrule]]
   [dev.security-lint.taint :as taint]))

(set! *warn-on-reflection* true)

(def ^:private cache-purges
  "The raw, unthrottled cache reloads. Each has a throttled sibling -- `restore-cache-if-needed!` -- and the
  throttled one is the fix; these are what a cookie compare called on every request."
  '#{metabase.settings.core/restore-cache! metabase.settings.models.setting/restore-cache!
     metabase.settings.models.setting.cache/restore-cache!
     metabase.premium-features.core/clear-cache! metabase.premium-features.token-check/clear-cache!})

(def ^:private loggers
  "Log calls at a level that emits on a default deployment: a client value logged here is a line in the operator's
  log per request, at whatever rate the caller chooses."
  '#{clojure.tools.logging/error clojure.tools.logging/errorf clojure.tools.logging/warn clojure.tools.logging/warnf
     metabase.util.log/error metabase.util.log/errorf metabase.util.log/warn metabase.util.log/warnf})

(defn- request-value?
  "Whether `node` carries a value the client sent: a request label, not a row or a setting."
  [ctx node]
  (boolean (some #(= :request (taint/label-kind %)) (taint/origins ctx node))))

(defrule middleware-acts-on-request-value
  {:name        "Request header or cookie acted on before the caller is known"
   :enabled     false
   :description (str "Ring middleware runs on every request, ahead of the session check, so a header or cookie it "
                     "acts on is an anonymous caller's to choose: a `Host` header written into `site-url` repoints "
                     "every link the instance sends, a cookie that triggers a cache reload triggers it on every "
                     "request, a header that makes the middleware read the body reads it for every route, and a "
                     "header written to the log fills it at the caller's rate.")
   :remediation (str "Persist nothing derived from a request header before the caller is known, or gate the write on "
                     "the session's superuser flag; reload a cache only through its throttled entry point; read a "
                     "body only where the route needs it, bounded; log client-controlled text at DEBUG or not at all.")
   ;; a persistent write or an unbounded read from a request value is an error; a purge or a log line is a
   ;; warning, since no value flows -- the request only decides that it happens, on every request
   :severity    {:tainted :error :otherwise :warning}
   :precision   :medium
   :cwe         "CWE-807"
   ;; the union of the three sets above and the body read; a declaration is data, so it is spelled out
   :triggers    #{metabase.settings.core/set! metabase.settings.core/set-value-of-type! metabase.settings.core/set-many!
                  metabase.settings.models.setting/set! metabase.settings.models.setting/set-value-of-type!
                  metabase.settings.models.setting/set-many!
                  ;; the site-url setter is re-exported, and clj-kondo resolves a call to either home
                  metabase.system.core/site-url! metabase.system.settings/site-url!
                  metabase.settings.core/restore-cache! metabase.settings.models.setting/restore-cache!
                  metabase.settings.models.setting.cache/restore-cache!
                  metabase.premium-features.core/clear-cache! metabase.premium-features.token-check/clear-cache!
                  clojure.tools.logging/error clojure.tools.logging/errorf clojure.tools.logging/warn
                  clojure.tools.logging/warnf metabase.util.log/error metabase.util.log/errorf metabase.util.log/warn
                  metabase.util.log/warnf
                  clojure.core/slurp}}
  [{:keys [node ns] :as ctx}]
  ;; The sink has to be *in* a middleware namespace. Every middleware reaches the session lookup, which reaches
  ;; the model layer, so "reachable from middleware" over references holds for most of the tree.
  (when (str/starts-with? (str ns) "metabase.server.middleware")
    (let [head    (ast/head-sym node)
          fq      (:trigger (:site ctx))
          tainted (filter #(request-value? ctx %) (ast/args node))]
      (cond
        (contains? cache-purges fq)
        {:tainted? false
         :message  (str (name head) " runs from middleware, unthrottled, whenever a request asks")}

        (contains? loggers fq)
        (when (seq tainted)
          {:tainted? false
           :message  (str "Request value written to the log at " (name head) " from middleware: "
                          (str/join ", " (map ast/->str tainted)))})

        (seq tainted)
        {:tainted? true
         :message  (str (name head) " acts on a request value from middleware, before the caller is known: "
                        (str/join ", " (map ast/->str tainted)))}))))

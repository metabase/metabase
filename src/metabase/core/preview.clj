(ns metabase.core.preview
  "Standalone 'jekyll serve' entrypoint for PR-preview instances (Stage 3 of the pr-previews plan):

    java -jar metabase.jar --mode preview

  Serves a pre-migrated (\"baked\") H2 app db. Contract with the bake step: the H2 file was
  produced by the SAME jar version (CI bakes and serves with one image), so the schema is
  current by construction and we skip Liquibase entirely via
  [[mdb/setup-db-without-migrations!]]. No Quartz, no queue listeners, no audit db install,
  no sample content, no serdes at serve time — none of [[metabase.core.init]] runs.

  Class-memory story: [[metabase.api-routes.routes]] eagerly requires every API namespace at
  load time (its quoted-symbol route entries are style, not laziness — `ns-handler` needs the
  namespace already loaded). The route table here instead holds thunks that `require` the SAME
  production route vars on first request to each prefix. Boot loads only server + app-db +
  settings infrastructure; a browse session then faults in just the endpoints the FE actually
  touches. No API logic is duplicated — only the loading policy differs.

  Known preview-mode degradations (acceptable for PR review, revisit as needed):
  - Event topics are derived in consumer namespaces normally loaded by module `.init`s.
    [[events/publish-event!]] asserts the topic is derived, so any lazily-loaded endpoint that
    publishes an event needs its consumers listed as side-effect namespaces on its route entry
    (see \"/session\"). A missing one surfaces as a loud assertion naming the topic — add it.
  - Settings are registered when their defining namespace loads. The FE bootstrap JSON in
    index.html enumerates the registry at request time, so [[boot-time-namespaces]] preloads
    the settings namespaces the FE needs before any API prefix is hit. Missing keys in
    GET /api/session/properties → add the settings namespace there.
  - defenterprise fns resolve to OSS impls since metabase-enterprise.core.init never loads.
  - /search will 404 or return empty until the prefix's module can run without its indexer.
  - The app db stays writable: logins insert sessions and bump last_login. Per-instance H2
    copies are disposable, so this is fine; a read-only H2 mode needs a session story first."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :as routes.common]
   [metabase.api.util.handlers :as handlers]
   [metabase.app-db.core :as mdb]
   [metabase.classloader.core :as classloader]
   [metabase.config.core :as config]
   [metabase.initialization-status.core :as init-status]
   [metabase.server.core :as server]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- lazy-handler
  "Ring handler that loads its real handler on first request, then delegates.

  `target` is either an unqualified namespace symbol (served via [[api.macros/ns-handler]],
  like symbol entries in the main route table) or a qualified symbol naming a handler var.
  `side-effect-nses` load first — event-topic derives and other registry side effects that
  [[metabase.core.init]] would normally have wired."
  [target & side-effect-nses]
  (let [dlv (delay
              (log/infof "Lazy-loading routes for %s" target)
              (run! classloader/require side-effect-nses)
              (if (qualified-symbol? target)
                @(requiring-resolve target)
                (do (classloader/require target)
                    (api.macros/ns-handler target))))]
    (fn [request respond raise]
      ((force dlv) request respond raise))))

(defn- +auth [handler]
  (routes.common/+auth handler))

;;; The browse/view surface of [[metabase.api-routes.routes/route-map]], with identical
;;; prefixes, auth wrapping, and target vars — but lazy. An unhit prefix costs nothing, so err
;;; on the side of including read paths. Deliberately absent: setup, notifications/pulses,
;;; transforms, uploads, actions, metabot, sync/notify, cloud-migration, admin-only surfaces.
(def ^:private route-map
  {"/activity"             (+auth (lazy-handler 'metabase.activity-feed.api))
   "/bookmark"             (+auth (lazy-handler 'metabase.bookmarks.api))
   "/card"                 (+auth (lazy-handler 'metabase.queries-rest.api/card-routes))
   "/cards"                (+auth (lazy-handler 'metabase.queries-rest.api/cards-routes))
   "/collection"           (+auth (lazy-handler 'metabase.collections-rest.api))
   "/dashboard"            (+auth (lazy-handler 'metabase.dashboards-rest.api))
   "/database"             (+auth (lazy-handler 'metabase.warehouses-rest.api))
   "/dataset"              (+auth (lazy-handler 'metabase.query-processor.api))
   "/field"                (+auth (lazy-handler 'metabase.warehouse-schema-rest.api/field-routes))
   "/geojson"              (lazy-handler 'metabase.geojson.api)
   "/measure"              (+auth (lazy-handler 'metabase.measures.api))
   "/metric"               (+auth (lazy-handler 'metabase.metrics.api))
   "/native-query-snippet" (+auth (lazy-handler 'metabase.native-query-snippets.api))
   "/premium-features"     (+auth (lazy-handler 'metabase.premium-features.api/routes))
   "/revision"             (+auth (lazy-handler 'metabase.revisions.api))
   "/search"               (+auth (lazy-handler 'metabase.search.api/routes))
   "/segment"              (+auth (lazy-handler 'metabase.segments.api))
   "/session"              (lazy-handler 'metabase.session.api/routes
                                         ;; registers the login! :provider/password method
                                         'metabase.auth-identity.init
                                         ;; derives :event/user-login, which login publishes
                                         'metabase.users.events.last-login)
   "/setting"              (+auth (lazy-handler 'metabase.settings-rest.api))
   "/table"                (+auth (lazy-handler 'metabase.warehouse-schema-rest.api/table-routes))
   "/tiles"                (+auth (lazy-handler 'metabase.tiles.api))
   "/timeline"             (+auth (lazy-handler 'metabase.timeline.api/timeline-routes))
   "/timeline-event"       (+auth (lazy-handler 'metabase.timeline.api/timeline-event-routes))
   "/user"                 (+auth (lazy-handler 'metabase.users-rest.api))
   "/user-key-value"       (+auth (lazy-handler 'metabase.user-key-value.api))
   "/util"                 (lazy-handler 'metabase.api.util)})

(def ^:private ^{:arglists '([request respond raise])} api-routes
  (handlers/route-map-handler route-map))

(def ^:private boot-time-namespaces
  "Loaded eagerly at boot for registry side effects needed before any API prefix is hit —
  chiefly settings the index.html FE bootstrap JSON must enumerate. When the FE trips on a
  missing property key, add the defsetting's namespace here. Everything else loads lazily via
  [[route-map]]."
  '[metabase.appearance.settings
    metabase.embedding.settings
    ;; Derives nearly every :event/* topic (and defines their audit publish-event!
    ;; methods). Without it, publish-event!'s topic-derived assertion 500s the first
    ;; code path that publishes: login publishes :event/user-joined, and the site-url
    ;; middleware publishes :event/setting-update on any request — so this must load
    ;; at boot, not per-route.
    metabase.audit-app.events.audit-log
    ;; :event/card-read and :event/dashboard-read derive here — published by the
    ;; very GETs a reviewer starts with.
    metabase.view-log.events.view-log
    metabase.activity-feed.events.recent-views])

(defn- shutdown! []
  (log/info "Preview Metabase shutting down ...")
  (server/stop-web-server!)
  (shutdown-agents))

(defn entrypoint
  "Bootstrap-dispatched entrypoint for `--mode preview` — see [[metabase.core.bootstrap]]."
  [_args]
  (try
    (let [timer (u/start-timer)]
      (log/info "Starting Metabase in PREVIEW mode: lazy routes, no migrations, no scheduler")
      (.addShutdownHook (Runtime/getRuntime) (Thread. ^Runnable shutdown!))
      (init-status/set-progress! 0.1)
      (let [server-routes (server/make-routes api-routes)
            handler       (server/make-handler server-routes)]
        (server/start-web-server! handler))
      (init-status/set-progress! 0.3)
      ;; Baked-H2 contract: this jar version produced the file, so verify connectivity only —
      ;; never run (or even load) migration machinery.
      (mdb/setup-db-without-migrations!)
      (init-status/set-progress! 0.7)
      (run! classloader/require boot-time-namespaces)
      (init-status/set-complete!)
      (log/infof "Preview Metabase ready in %s" (u/format-milliseconds (u/since-ms timer))))
    (catch Throwable e
      (log/error e "Preview Metabase failed to start")
      (System/exit 1)))
  (when (config/config-bool :mb-jetty-join)
    (.join (server/instance))))

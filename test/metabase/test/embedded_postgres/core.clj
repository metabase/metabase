(ns metabase.test.embedded-postgres.core
  "Dev/test utility that runs an embedded Postgres via Zonky's embedded-postgres
  library and manages its lifecycle via Integrant. Owns no global state — clients
  choose how to hold the running system (local binding, defonce, test fixture,
  etc.).

  Typical test usage:

    (with-system [system {::embedded-postgres {:port 0}}]
      (let [{:keys [jdbc-url]} (::embedded-postgres system)]
        ...))

  Typical REPL usage as the Metabase app DB:

    (require '[metabase.test.embedded-postgres.core :as emb-pg]
             '[integrant.core :as ig])
    (def system (ig/init {::emb-pg/embedded-postgres {}}))
    (emb-pg/install-as-app-db! (::emb-pg/embedded-postgres system))
    ;; ... work with the REPL ...
    (ig/halt! system)"
  (:require
   [integrant.core :as ig])
  (:import
   (io.zonky.test.db.postgres.embedded EmbeddedPostgres)))

(set! *warn-on-reflection* true)

(defn- start! ^EmbeddedPostgres
  [port]
  (.start
   (doto (EmbeddedPostgres/builder)
     (cond-> port (.setPort port)))))

(defn- stop!
  [pg]
  (when pg (.close ^EmbeddedPostgres pg)))

(defmethod ig/init-key ::db-server
  [_ {::keys [port]}]
  (let [pg          (start! port)
        actual-port (.getPort pg)]
    {::pg               pg
     ::port             actual-port
     ::jdbc-url         (format "jdbc:postgresql://localhost:%d/postgres?user=postgres" actual-port)}))

(defmethod ig/halt-key! ::db-server
  [_ {::keys [pg]}]
  (stop! pg))

(defmacro with-system
  "Init an Integrant system from `config`, bind it to `sym`, run `body`, and halt
  the system in a `finally`."
  [[sym config] & body]
  `(let [~sym (ig/init ~config)]
     (try
       ~@body
       (finally
         (ig/halt! ~sym)))))

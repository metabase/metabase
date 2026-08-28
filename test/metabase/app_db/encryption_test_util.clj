(ns metabase.app-db.encryption-test-util
  (:require
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.core :as mdb]
   [metabase.app-db.custom-migrations.util :as custom-migrations.util]
   [metabase.app-db.data-source :as mdb.data-source]
   [metabase.app-db.encryption :as mdb.encryption]
   [metabase.test.initialize :as initialize]
   [metabase.test.initialize.test-users :as init.test-users]
   [metabase.util.encryption :as encryption]))

(set! *warn-on-reflection* true)

(defonce ^{:doc "Holds `{:app-db .. :secret-key ..}` for the isolated, encrypted app DB prepared by the namespace whose
  `:once` [[with-encrypted-app-db-fixture]] is running, so [[with-encrypted-app-db]] can reach it. A global (rather than
  a dynamic binding) because the runner runs a namespace's vars, and the server/`future` threads serving `mt/client`,
  on threads that would not see a thread-local binding. Safe as a single global: the runner runs whole namespaces
  sequentially, and the tests that opt in are `^:synchronized`, so at most one prepared DB is live at a time."}
  prepared-encrypted-db
  (atom nil))

(defn do-with-encrypted-app-db!
  "Build one isolated, empty H2 application DB encrypted with `secret-key` (the hashed value bound to
  [[metabase.util.encryption/default-secret-key]]) and hold it in [[prepared-encrypted-db]] for the extent of `thunk`.

  Running `encrypt-db` after `setup-db!` mirrors production startup, where setting `MB_ENCRYPTION_SECRET_KEY`
  re-encrypts any setting written before the key was active. Intended as a namespace's outermost `:once` fixture: the
  ambient app DB is left untouched, so tests run as usual against the shared DB unless they opt into the isolated DB
  with [[with-encrypted-app-db]]. That opt-in is for the tests that activate an encryption key — reading a setting
  under an active key strictly decrypts it, which throws on a plaintext value another namespace may have left in the
  shared DB. Standard test users are seeded so `:rasta` &c. resolve there (`user->id` memoizes per application DB)."
  [secret-key thunk]
  ;; initialize the ambient test app DB first: seeding the isolated DB below forces the one-time :db initialization
  ;; while *application-db* is bound to it, which would mark :db initialized without ever migrating the ambient DB --
  ;; the first test to touch the ambient DB would then find it empty.
  (initialize/initialize-if-needed! :db)
  (let [data-source (mdb.data-source/raw-connection-string->DataSource
                     (str "jdbc:h2:mem:" (gensym "encryption-test-db-")))]
    ;; hold one connection open for the whole fixture so the in-memory DB survives until every test has run
    (with-open [_conn (.getConnection data-source)]
      (let [app-db (mdb.connection/application-db :h2 data-source)]
        (binding [mdb.connection/*application-db*            app-db
                  custom-migrations.util/*allow-temp-scheduling* false]
          (mdb/setup-db! :create-sample-content? false)
          (init.test-users/init!)
          (with-redefs [encryption/default-secret-key secret-key]
            (mdb.encryption/encrypt-db (mdb.connection/db-type) data-source nil)))
        (reset! prepared-encrypted-db {:app-db app-db :secret-key secret-key})
        (try
          (thunk)
          (finally
            (reset! prepared-encrypted-db nil)))))))

(defn with-encrypted-app-db-fixture
  "Return a `:once` [[clojure.test/use-fixtures]] function that prepares an encrypted app DB for the namespace via
  [[do-with-encrypted-app-db!]]. Tests opt in with [[with-encrypted-app-db]]."
  [secret-key]
  (fn [thunk]
    (do-with-encrypted-app-db! secret-key thunk)))

(defmacro with-encrypted-app-db
  "Run `body` against the namespace's prepared encrypted app DB (see [[with-encrypted-app-db-fixture]]) with the
  encryption key active. `*application-db*` is redefined (not bound) so the isolated DB is visible on the server/`future`
  threads that serve `mt/client`; the opt-in test must therefore be marked `^:synchronized`. Use for a test that
  activates an encryption key, so its strict decrypting reads meet only the settings in this already-encrypted DB."
  [& body]
  `(let [prepared# (or @prepared-encrypted-db
                       (throw (ex-info (str "with-encrypted-app-db requires a `with-encrypted-app-db-fixture` :once "
                                            "fixture on this namespace")
                                       {})))
         {app-db# :app-db secret-key# :secret-key} prepared#]
     (with-redefs [mdb.connection/*application-db* app-db#
                   encryption/default-secret-key   secret-key#]
       ~@body)))

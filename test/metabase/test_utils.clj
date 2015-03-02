(ns metabase.test-utils
  (:require [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [expectations :refer :all]
            [medley.core :as medley]
            [ring.adapter.jetty :as ring]
            (metabase [core :as core]
                      [db :refer :all]
                      [util :as u])))

(declare $->prop)


;; # FUNCTIONS THAT GET RUN ON TEST SUITE START / STOP

;; ## DB Setup

(defn setup-db
  "setup database schema"
  {:expectations-options :before-run}
  []
  (let [filename (-> (re-find #"file:(\w+\.db).*" db-file) second)] ; db-file is prefixed with "file:", so we strip that off
    (map (fn [file-extension]                                        ; delete the database files, e.g. `metabase.db.h2.db`, `metabase.db.trace.db`, etc.
           (let [file (str filename file-extension)]
             (when (.exists (io/file file))
               (io/delete-file file))))
         [".h2.db"
          ".trace.db"
          ".lock.db"]))
  ; TODO - lets just completely delete the db before each test to ensure we start fresh
  (log/info "tearing down database and resetting to empty schema")
  (migrate :down)
  (log/info "setting up database and running all migrations")
  (migrate :up)
  (log/info "database setup complete"))


;; ## Jetty (Web) Server

(def ^:private jetty-instance
  (delay
   (try (ring/run-jetty core/app {:port 3000
                                  :join? false}) ; detach the thread
        (catch java.net.BindException e          ; assume server is already running if port's already bound
          (println "ALREADY RUNNING!")))))       ; e.g. if someone is running `lein ring server` locally. Tests should still work normally.

(defn start-jetty
  "Start the Jetty web server."
  {:expectations-options :before-run}
  []
  (println "STARTING THE JETTY SERVER...")
  @jetty-instance)

(defn stop-jetty
  "Stop the Jetty web server."
  {:expectations-options :after-run}
  []
  (when @jetty-instance
    (.stop ^org.eclipse.jetty.server.Server @jetty-instance)))


;; # FUNCTIONS + MACROS FOR WRITING UNIT TESTS

;; ## Response Deserialization

(defn deserialize-dates
  "Deserialize date strings with KEYS returned in RESPONSE."
  [response & [k & ks]]
  {:pre [(or (println "RESPONSE: " response)
             (println "TYPE: " (type response))
             true)
         (map? response)
         (keyword? k)]}
  (let [response (medley/update response k #(some->> (u/parse-iso8601 %)
                                                     .getTime
                                                     java.sql.Timestamp.))]
    (if (empty? ks) response
        (apply deserialize-dates response ks))))


;; ## $$$ Macro

(defmacro match-$
  "Walk over map DEST-OBJECT and replace values of the form `$` or `$key` as follows:

    {k $} -> {k (k SOURCE-OBJECT)}
    {k $symb} -> {k (:symb SOURCE-OBJECT)}

  ex.

    (match-$ m {:a $, :b 3, :c $b}) -> {:a (:a m), b 3, :c (:b m)}"
  [source-obj dest-object]
  {:pre [(map? dest-object)]}
  (let [source## (gensym)
        dest-object (->> dest-object
                         (map (fn [[k v]]
                                {k (if (= v '$) `(~k ~source##)
                                       v)}))
                         (reduce merge {}))]
    `(let [~source## ~source-obj]
       ~(clojure.walk/prewalk (partial $->prop source##)
                              dest-object))))

(defn- $->prop
  "If FORM is a symbol starting with a `$`, convert it to the form `(form-keyword SOURCE-OBJ)`.

    ($->prop my-obj 'fish)  -> 'fish
    ($->prop my-obj '$fish) -> '(:fish my-obj)"
  [source-obj form]
  (or (when (symbol? form)
        (let [[first-char & rest-chars] (name form)]
          (when (= first-char \$)
            (let [kw (->> rest-chars
                          (apply str)
                          keyword)]
              `(~kw ~source-obj)))))
      form))

;; -*- comment-column: 70; -*-
;; full set of options are here .. https://github.com/technomancy/leiningen/blob/master/sample.project.clj

(defproject metabase "metabase-SNAPSHOT"
  :description "Metabase Community Edition"
  :url "http://metabase.com/"
  :min-lein-version "2.5.0"
  :aliases {"bikeshed" ["bikeshed" "--max-line-length" "240"]
            "check-reflection-warnings" ["with-profile" "+reflection-warnings" "check"]
            "test" ["with-profile" "+expectations" "expectations"]
            "generate-sample-dataset" ["with-profile" "+generate-sample-dataset" "run"]
            "h2" ["with-profile" "+h2-shell" "run"]}
  :dependencies [[org.clojure/clojure "1.8.0"]
                 [org.clojure/core.async "0.2.374"]
                 [org.clojure/core.match "0.3.0-alpha4"]              ; optimized pattern matching library for Clojure
                 [org.clojure/core.memoize "0.5.9"]                   ; needed by core.match; has useful FIFO, LRU, etc. caching mechanisms
                 [org.clojure/data.csv "0.1.3"]                       ; CSV parsing / generation
                 [org.clojure/java.classpath "0.2.3"]
                 [org.clojure/java.jdbc "0.4.2"]                      ; basic jdbc access from clojure. *** DON'T UPDATE THIS UNTIL KORMA IS UPDATED TO STOP USING DEPRECATED FN SIGNATURES ***
                 [org.clojure/math.numeric-tower "0.0.4"]             ; math functions like `ceil`
                 [org.clojure/tools.logging "0.3.1"]                  ; logging framework
                 [org.clojure/tools.namespace "0.2.10"]
                 [amalloy/ring-buffer "1.2"
                  :exclusions [org.clojure/clojure
                               org.clojure/clojurescript]]            ; fixed length queue implementation, used in log buffering
                 [amalloy/ring-gzip-middleware "0.1.3"]               ; Ring middleware to GZIP responses if client can handle it
                 [aleph "0.4.1"]                                      ; Async HTTP library; WebSockets
                 [cheshire "5.6.1"]                                   ; fast JSON encoding (used by Ring JSON middleware)
                 [clj-http "3.0.1"                                    ; HTTP client
                  :exclusions [commons-codec
                               commons-io
                               slingshot]]
                 [clj-time "0.11.0"]                                  ; library for dealing with date/time
                 [clojure.jdbc/clojure.jdbc-c3p0 "0.3.2"]             ; JDBC Connection pools
                 [clojurewerkz/quartzite "2.0.0"]                     ; scheduling library
                 [colorize "0.1.1" :exclusions [org.clojure/clojure]] ; string output with ANSI color codes (for logging)
                 [com.cemerick/friend "0.2.1"                         ; auth library
                  :exclusions [commons-codec
                               org.apache.httpcomponents/httpclient
                               net.sourceforge.nekohtml/nekohtml
                               ring/ring-core]]
                 [com.draines/postal "1.11.4"]                        ; SMTP library
                 [com.google.apis/google-api-services-bigquery        ; Google BigQuery Java Client Library
                  "v2-rev294-1.21.0"]
                 [com.h2database/h2 "1.4.191"]                        ; embedded SQL database
                 [com.mattbertolini/liquibase-slf4j "2.0.0"]          ; Java Migrations lib
                 [com.novemberain/monger "3.0.2"]                     ; MongoDB Driver
                 [compojure "1.5.0"]                                  ; HTTP Routing library built on Ring
                 [environ "1.0.2"]                                    ; easy environment management
                 [hiccup "1.0.5"]                                     ; HTML templating
                 [honeysql "0.6.3"]                                   ; Transform Clojure data structures to SQL
                 [korma "0.4.2"]                                      ; SQL generation
                 [log4j/log4j "1.2.17"                                ; logging framework
                  :exclusions [javax.mail/mail
                               javax.jms/jms
                               com.sun.jdmk/jmxtools
                               com.sun.jmx/jmxri]]
                 [medley "0.7.4"]                                     ; lightweight lib of useful functions
                 [metabase/throttle "1.0.1"]                          ; Tools for throttling access to API endpoints and other code pathways
                 [mysql/mysql-connector-java "5.1.38"]                ; MySQL JDBC driver *** DON'T UPDATE THIS YET - NEW VERSION IS JAVA 8+ ONLY: http://dev.mysql.com/doc/connector-j/6.0/en/connector-j-whats-new.html ***
                 [net.sf.cssbox/cssbox "4.11"                         ; HTML / CSS rendering
                  :exclusions [org.slf4j/slf4j-api]]
                 [net.sourceforge.jtds/jtds "1.3.1"]                  ; Open Source SQL Server driver
                 [org.liquibase/liquibase-core "3.5.0"]               ; migration management (Java lib)
                 [org.slf4j/slf4j-log4j12 "1.7.21"]                   ; abstraction for logging frameworks -- allows end user to plug in desired logging framework at deployment time
                 [org.yaml/snakeyaml "1.17"]                          ; YAML parser (required by liquibase)
                 [org.xerial/sqlite-jdbc "3.8.11.2"]                  ; SQLite driver
                 [postgresql "9.3-1102.jdbc41"]                       ; Postgres driver
                 [io.crate/crate-jdbc "1.11.0"]                       ; Crate JDBC driver
                 [io.crate/crate-client "0.54.7"]                     ; Crate Java client (used by Crate JDBC)
                 [prismatic/schema "1.1.1"]                           ; Data schema declaration and validation library
                 [ring/ring-jetty-adapter "1.4.0"]                    ; Ring adapter using Jetty webserver (used to run a Ring server for unit tests)
                 [ring/ring-json "0.4.0"]                             ; Ring middleware for reading/writing JSON automatically
                 [stencil "0.5.0"]                                    ; Mustache templates for Clojure
                 [swiss-arrows "1.0.0"]]                              ; 'Magic wand' macro -<>, etc.
  :repositories [["bintray" "https://dl.bintray.com/crate/crate"]]
  :plugins [[lein-environ "1.0.2"]                                    ; easy access to environment variables
            [lein-ring "0.9.7"                                        ; start the HTTP server with 'lein ring server'
             :exclusions [org.clojure/clojure]]]                      ; TODO - should this be a dev dependency ?
  :main ^:skip-aot metabase.core
  :manifest {"Liquibase-Package" "liquibase.change,liquibase.changelog,liquibase.database,liquibase.parser,liquibase.precondition,liquibase.datatype,liquibase.serializer,liquibase.sqlgenerator,liquibase.executor,liquibase.snapshot,liquibase.logging,liquibase.diff,liquibase.structure,liquibase.structurecompare,liquibase.lockservice,liquibase.sdk,liquibase.ext"}
  :target-path "target/%s"
  :jvm-opts ["-Djava.awt.headless=true"]                              ; prevent Java icon from randomly popping up in dock when running `lein ring server`
  :javac-options ["-target" "1.7", "-source" "1.7"]
  :uberjar-name "metabase.jar"
  :ring {:handler metabase.core/app
         :init metabase.core/init!
         :destroy metabase.core/destroy}
  :eastwood {:exclude-namespaces [:test-paths
                                  metabase.driver.generic-sql]        ; ISQLDriver causes Eastwood to fail. Skip this ns until issue is fixed: https://github.com/jonase/eastwood/issues/191
             :add-linters [:unused-private-vars
                           ;; These linters are pretty useful but give a few false positives and can't be selectively disabled. See https://github.com/jonase/eastwood/issues/192
                           ;; and https://github.com/jonase/eastwood/issues/193
                           ;; It's still useful to re-enable them and run them every once in a while because they catch a lot of actual errors too. Keep an eye on the issues above
                           ;; and re-enable them if they ever get resolved
                           #_:unused-locals
                           #_:unused-namespaces]
             :exclude-linters [:constant-test]}                       ; gives us false positives with forms like (when config/is-test? ...)
  :docstring-checker {:include [#"^metabase"]
                      :exclude [#"test"
                                #"^metabase\.sample-data$"
                                #"^metabase\.http-client$"]}
  :profiles {:dev {:dependencies [[org.clojure/tools.nrepl "0.2.12"]  ; REPL <3
                                  [expectations "2.1.3"]              ; unit tests *** DON'T UPDATE THIS UNTIL WE REMOVE USES OF DEPRECATED EXPECT-LET IN THE CODEBASE ***
                                  [ring/ring-mock "0.3.0"]]
                   :plugins [[docstring-checker "1.0.0"]              ; Check that all public vars have docstrings. Run with 'lein docstring-checker'
                             [jonase/eastwood "0.2.3"
                              :exclusions [org.clojure/clojure]]      ; Linting
                             [lein-bikeshed "0.3.0"]                  ; Linting
                             [lein-expectations "0.0.8"]              ; run unit tests with 'lein expectations'
                             [lein-instant-cheatsheet "2.2.1"         ; use awesome instant cheatsheet created by yours truly w/ 'lein instant-cheatsheet'
                              :exclusions [org.clojure/clojure
                                           org.clojure/tools.namespace]]]
                   :env {:mb-run-mode "dev"}
                   :jvm-opts ["-Dlogfile.path=target/log"
                              "-Xms1024m"                             ; give JVM a decent heap size to start with
                              "-Xmx2048m"                             ; hard limit of 2GB so we stop hitting the 4GB container limit on CircleCI
                              "-XX:+CMSClassUnloadingEnabled"         ; let Clojure's dynamically generated temporary classes be GC'ed from PermGen
                              "-XX:+UseConcMarkSweepGC"]              ; Concurrent Mark Sweep GC needs to be used for Class Unloading (above)
                   :aot [metabase.logger]}                            ; Log appender class needs to be compiled for log4j to use it
             :reflection-warnings {:global-vars {*warn-on-reflection* true}} ; run `lein check-reflection-warnings` to check for reflection warnings
             :expectations {:injections [(require 'metabase.test-setup)]
                            :resource-paths ["test_resources"]
                            :env {:mb-test-setting-1 "ABCDEFG"
                                  :mb-run-mode "test"}
                            :jvm-opts ["-Duser.timezone=UTC"
                                       "-Dmb.db.in.memory=true"
                                       "-Dmb.jetty.join=false"
                                       "-Dmb.jetty.port=3010"
                                       "-Dmb.api.key=test-api-key"
                                       "-Xverify:none"]}              ; disable bytecode verification when running tests so they start slightly faster
             :uberjar {:aot :all
                       :jvm-opts ["-Dclojure.compiler.elide-meta=[:doc :added :file :line]" ; strip out metadata for faster load / smaller uberjar size
                                  "-Dmanifold.disable-jvm8-primitives=true"]} ; disable Manifold Java 8 primitives (see https://github.com/ztellman/manifold#java-8-extensions)
             :generate-sample-dataset {:dependencies [[faker "0.2.2"]                   ; Fake data generator -- port of Perl/Ruby
                                                      [incanter/incanter-core "1.9.0"]] ; Satistical functions like normal distibutions}})
                                       :source-paths ["sample_dataset"]
                                       :main ^:skip-aot metabase.sample-dataset.generate}
             ;; Run reset password from source: MB_DB_PATH=/path/to/metabase.db lein with-profile reset-password run email@address.com
             ;; Create the reset password JAR:  lein with-profile reset-password jar
             ;;                                   -> ./reset-password-artifacts/reset-password/reset-password.jar
             ;; Run the reset password JAR:     MB_DB_PATH=/path/to/metabase.db java -classpath /path/to/metabase-uberjar.jar:/path/to/reset-password.jar \
             ;;                                   metabase.reset_password.core email@address.com
             :reset-password {:source-paths ["reset_password"]
                              :main metabase.reset-password.core
                              :jar-name "reset-password.jar"
                              ;; Exclude everything except for reset-password specific code in the created jar
                              :jar-exclusions [#"^(?!metabase/reset_password).*$"]
                              :target-path "reset-password-artifacts/%s"} ; different than ./target because otherwise lein uberjar will delete our artifacts and vice versa
             :h2-shell {:main org.h2.tools.Shell}})

;; -*- comment-column: 70; -*-
;; full set of options are here .. https://github.com/technomancy/leiningen/blob/master/sample.project.clj

(defproject metabase "metabase-SNAPSHOT"
  :description "Metabase Community Edition"
  :url "http://metabase.com/"
  :min-lein-version "2.5.0"
  :aliases {"bikeshed" ["bikeshed" "--max-line-length" "205"]
            "check-reflection-warnings" ["with-profile" "+reflection-warnings" "check"]
            "test" ["with-profile" "+expectations" "expectations"]
            "generate-sample-dataset" ["with-profile" "+generate-sample-dataset" "run"]
            "profile" ["with-profile" "+profile" "run" "profile"]
            "h2" ["with-profile" "+h2-shell" "run" "-url" "jdbc:h2:./metabase.db" "-user" "" "-password" "" "-driver" "org.h2.Driver"]
            "validate-automagic-dashboards" ["with-profile" "+validate-automagic-dashboards" "run"]}
  :dependencies [[org.clojure/clojure "1.8.0"]
                 [org.clojure/core.async "0.3.442"]
                 [org.clojure/core.match "0.3.0-alpha4"]              ; optimized pattern matching library for Clojure
                 [org.clojure/core.memoize "0.5.9"]                   ; needed by core.match; has useful FIFO, LRU, etc. caching mechanisms
                 [org.clojure/data.csv "0.1.3"]                       ; CSV parsing / generation
                 [org.clojure/java.classpath "0.2.3"]                 ; examine the Java classpath from Clojure programs
                 [org.clojure/java.jdbc "0.7.5"]                      ; basic JDBC access from Clojure
                 [org.clojure/math.combinatorics "0.1.4"]             ; combinatorics functions
                 [org.clojure/math.numeric-tower "0.0.4"]             ; math functions like `ceil`
                 [org.clojure/tools.logging "0.3.1"]                  ; logging framework
                 [org.clojure/tools.namespace "0.2.10"]
                 [amalloy/ring-buffer "1.2.1"
                  :exclusions [org.clojure/clojure
                               org.clojure/clojurescript]]            ; fixed length queue implementation, used in log buffering
                 [amalloy/ring-gzip-middleware "0.1.3"]               ; Ring middleware to GZIP responses if client can handle it
                 [aleph "0.4.5-alpha2"]                               ; Async HTTP library; WebSockets
                 [bigml/histogram "4.1.3"]                            ; Streaming one-pass Histogram data structure
                 [buddy/buddy-core "1.2.0"]                           ; various cryptograhpic functions
                 [buddy/buddy-sign "1.5.0"]                           ; JSON Web Tokens; High-Level message signing library
                 [cheshire "5.7.0"]                                   ; fast JSON encoding (used by Ring JSON middleware)
                 [clj-http "3.4.1"                                    ; HTTP client
                  :exclusions [commons-codec
                               commons-io
                               slingshot]]
                 [clj-time "0.13.0"]                                  ; library for dealing with date/time
                 [clojurewerkz/quartzite "2.0.0"]                     ; scheduling library
                 [colorize "0.1.1" :exclusions [org.clojure/clojure]] ; string output with ANSI color codes (for logging)
                 [com.amazon.redshift/redshift-jdbc41-no-awssdk       ; Redshift JDBC driver without embedded Amazon SDK
                  "1.2.8.1005"]
                 [com.cemerick/friend "0.2.3"                         ; auth library
                  :exclusions [commons-codec
                               org.apache.httpcomponents/httpclient
                               net.sourceforge.nekohtml/nekohtml
                               ring/ring-core]]
                 [com.draines/postal "2.0.2"]                         ; SMTP library
                 [com.github.brandtg/stl-java "0.1.1"]                ; STL decomposition
                 [com.google.apis/google-api-services-analytics       ; Google Analytics Java Client Library
                  "v3-rev142-1.23.0"]
                 [com.google.apis/google-api-services-bigquery        ; Google BigQuery Java Client Library
                   "v2-rev368-1.23.0"]
                 [com.jcraft/jsch "0.1.54"]                           ; SSH client for tunnels
                 [com.h2database/h2 "1.4.194"]                        ; embedded SQL database
                 [com.mattbertolini/liquibase-slf4j "2.0.0"]          ; Java Migrations lib
                 [com.mchange/c3p0 "0.9.5.2"]                         ; connection pooling library
                 [com.microsoft.sqlserver/mssql-jdbc "6.2.1.jre7"]    ; SQLServer JDBC driver. TODO - Switch this to `.jre8` once we officially switch to Java 8
                 [com.novemberain/monger "3.1.0"]                     ; MongoDB Driver
                 [com.taoensso/nippy "2.13.0"]                        ; Fast serialization (i.e., GZIP) library for Clojure
                 [compojure "1.5.2"]                                  ; HTTP Routing library built on Ring
                 [crypto-random "1.2.0"]                              ; library for generating cryptographically secure random bytes and strings
                 [dk.ative/docjure "1.11.0"]                          ; Excel export
                 [environ "1.1.0"]                                    ; easy environment management
                 [hiccup "1.0.5"]                                     ; HTML templating
                 [honeysql "0.8.2"]                                   ; Transform Clojure data structures to SQL
                 [io.crate/crate-jdbc "2.1.6"]                        ; Crate JDBC driver
                 [io.forward/yaml "1.0.6"                             ; Clojure wrapper for YAML library SnakeYAML (which we already use for liquidbase)
                  :exclusions [org.clojure/clojure
                               org.yaml/snakeyaml]]
                 [kixi/stats "0.3.10"                                 ; Various statistic measures implemented as transducers
                  :exclusions [org.clojure/test.check                 ; test.check and AVL trees are used in kixi.stats.random. Remove exlusion if using.
                               org.clojure/data.avl]]
                 [log4j/log4j "1.2.17"                                ; logging framework
                  :exclusions [javax.mail/mail
                               javax.jms/jms
                               com.sun.jdmk/jmxtools
                               com.sun.jmx/jmxri]]
                 [medley "0.8.4"]                                     ; lightweight lib of useful functions
                 [metabase/throttle "1.0.1"]                          ; Tools for throttling access to API endpoints and other code pathways
                 [mysql/mysql-connector-java "5.1.45"]                ;  !!! Don't upgrade to 6.0+ yet -- that's Java 8 only !!!
                 [jdistlib "0.5.1"                                    ; Distribution statistic tests
                  :exclusions [com.github.wendykierp/JTransforms]]
                 [net.cgrand/xforms "0.13.0"                          ; Additional transducers
                  :exclusions [org.clojure/clojurescript]]
                 [net.sf.cssbox/cssbox "4.12"                         ; HTML / CSS rendering
                  :exclusions [org.slf4j/slf4j-api]]
                 [com.clearspring.analytics/stream "2.9.5"            ; Various sketching algorithms
                  :exclusions [org.slf4j/slf4j-api
                               it.unimi.dsi/fastutil]]
                 [org.clojars.pntblnk/clj-ldap "0.0.12"]              ; LDAP client
                 [org.liquibase/liquibase-core "3.5.3"]               ; migration management (Java lib)
                 [org.postgresql/postgresql "42.1.4.jre7"]            ; Postgres driver
                 [org.slf4j/slf4j-log4j12 "1.7.25"]                   ; abstraction for logging frameworks -- allows end user to plug in desired logging framework at deployment time
                 [org.spark-project.hive/hive-jdbc "1.2.1.spark2"     ; JDBC Driver for Apache Spark
                  :exclusions [org.apache.curator/curator-framework
                               org.apache.curator/curator-recipes
                               org.apache.thrift/libfb303
                               org.apache.zookeeper/zookeeper
                               org.eclipse.jetty.aggregate/jetty-all
                               org.spark-project.hive/hive-common
                               org.spark-project.hive/hive-metastore
                               org.spark-project.hive/hive-serde
                               org.spark-project.hive/hive-shims]]
                 [org.tcrawley/dynapath "0.2.5"]                      ; Dynamically add Jars (e.g. Oracle or Vertica) to classpath
                 [org.xerial/sqlite-jdbc "3.21.0.1"]                  ; SQLite driver
                 [org.yaml/snakeyaml "1.18"]                          ; YAML parser (required by liquibase)
                 [prismatic/schema "1.1.5"]                           ; Data schema declaration and validation library
                 [puppetlabs/i18n "0.8.0"]                            ; Internationalization library
                 [redux "0.1.4"]                                      ; Utility functions for building and composing transducers
                 [ring/ring-core "1.6.0"]
                 [ring/ring-jetty-adapter "1.6.0"]                    ; Ring adapter using Jetty webserver (used to run a Ring server for unit tests)
                 [ring/ring-json "0.4.0"]                             ; Ring middleware for reading/writing JSON automatically
                 [stencil "0.5.0"]                                    ; Mustache templates for Clojure
                 [toucan "1.1.4"                                      ; Model layer, hydration, and DB utilities
                  :exclusions [honeysql]]]
  :repositories [["bintray" "https://dl.bintray.com/crate/crate"]     ; Repo for Crate JDBC driver
                 ["redshift" "https://s3.amazonaws.com/redshift-driver-downloads"]]
  :plugins [[lein-environ "1.1.0"]                                    ; easy access to environment variables
            [lein-ring "0.12.3"                                       ; start the HTTP server with 'lein ring server'
             :exclusions [org.clojure/clojure]]                       ; TODO - should this be a dev dependency ?
            [puppetlabs/i18n "0.8.0"]]                                ; i18n helpers
  :main ^:skip-aot metabase.core
  :manifest {"Liquibase-Package" "liquibase.change,liquibase.changelog,liquibase.database,liquibase.parser,liquibase.precondition,liquibase.datatype,liquibase.serializer,liquibase.sqlgenerator,liquibase.executor,liquibase.snapshot,liquibase.logging,liquibase.diff,liquibase.structure,liquibase.structurecompare,liquibase.lockservice,liquibase.sdk,liquibase.ext"}
  :target-path "target/%s"
  :jvm-opts ["-XX:+IgnoreUnrecognizedVMOptions"                       ; ignore things not recognized for our Java version instead of refusing to start
             "-XX:MaxPermSize=256m"                                   ; give the JVM a little more PermGen space to avoid PermGen OutOfMemoryErrors
             "-Xverify:none"                                          ; disable bytecode verification when running in dev so it starts slightly faster
             "-XX:+CMSClassUnloadingEnabled"                          ; let Clojure's dynamically generated temporary classes be GC'ed from PermGen
             "-XX:+UseConcMarkSweepGC"                                ; Concurrent Mark Sweep GC needs to be used for Class Unloading (above)
             "--add-opens=java.base/java.net=ALL-UNNAMED"             ; let Java 9 dynamically add to classpath -- see https://github.com/tobias/dynapath#note-on-java-9
             "--add-modules=java.xml.bind"                            ; tell Java 9 (Oracle VM only) to add java.xml.bind to classpath. No longer on it by default. See https://stackoverflow.com/questions/43574426/how-to-resolve-java-lang-noclassdeffounderror-javax-xml-bind-jaxbexception-in-j
             "-Djava.awt.headless=true"]                              ; prevent Java icon from randomly popping up in dock when running `lein ring server`
  :javac-options ["-target" "1.7", "-source" "1.7"]
  :uberjar-name "metabase.jar"
  :ring {:handler metabase.core/app
         :init metabase.core/init!
         :destroy metabase.core/destroy
         :reload-paths ["src"]}
  :eastwood {:exclude-namespaces [:test-paths
                                  metabase.driver.generic-sql]        ; ISQLDriver causes Eastwood to fail. Skip this ns until issue is fixed: https://github.com/jonase/eastwood/issues/191
             :add-linters [:unused-private-vars
                           ;; These linters are pretty useful but give a few false positives and can't be selectively disabled. See https://github.com/jonase/eastwood/issues/192
                           ;; and https://github.com/jonase/eastwood/issues/193
                           ;; It's still useful to re-enable them and run them every once in a while because they catch a lot of actual errors too. Keep an eye on the issues above
                           ;; and re-enable them if they ever get resolved
                           #_:unused-locals
                           #_:unused-namespaces]
             :exclude-linters [:constant-test                         ; gives us false positives with forms like (when config/is-test? ...)
                               :deprecations]}                        ; Turn this off temporarily until we finish removing self-deprecated DB functions & macros like `upd`, `del`, and `sel`
  :docstring-checker {:include [#"^metabase"]
                      :exclude [#"test"
                                #"^metabase\.http-client$"]}
  :profiles {:dev {:dependencies [[expectations "2.2.0-beta2"]              ; unit tests
                                  [ring/ring-mock "0.3.0"]]           ; Library to create mock Ring requests for unit tests
                   :plugins [[docstring-checker "1.0.2"]              ; Check that all public vars have docstrings. Run with 'lein docstring-checker'
                             [jonase/eastwood "0.2.3"
                              :exclusions [org.clojure/clojure]]      ; Linting
                             [lein-bikeshed "0.4.1"]                  ; Linting
                             [lein-expectations "0.0.8"]              ; run unit tests with 'lein expectations'
                             [lein-instant-cheatsheet "2.2.1"         ; use awesome instant cheatsheet created by yours truly w/ 'lein instant-cheatsheet'
                              :exclusions [org.clojure/clojure
                                           org.clojure/tools.namespace]]]
                   :env {:mb-run-mode "dev"}
                   :jvm-opts ["-Dlogfile.path=target/log"]
                   ;; Log appender class needs to be compiled for log4j to use it,
                   ;; classes for fixed Hive driver in must be compiled for tests
                   :aot [metabase.logger
                         metabase.driver.FixedHiveConnection
                         metabase.driver.FixedHiveDriver]}
             :ci {:jvm-opts ["-Xmx3g"]}
             :reflection-warnings {:global-vars {*warn-on-reflection* true}} ; run `lein check-reflection-warnings` to check for reflection warnings
             :expectations {:injections [(require 'metabase.test-setup  ; for test setup stuff
                                                  'metabase.test.util)] ; for the toucan.util.test default values for temp models
                            :resource-paths ["test_resources"]
                            :env {:mb-test-setting-1 "ABCDEFG"
                                  :mb-run-mode "test"}
                            :jvm-opts ["-Xms1024m"                    ; give JVM a decent heap size to start with
                                       "-Duser.timezone=UTC"
                                       "-Dmb.db.in.memory=true"
                                       "-Dmb.jetty.join=false"
                                       "-Dmb.jetty.port=3010"
                                       "-Dmb.api.key=test-api-key"
                                       "-Duser.language=en"]}
             ;; build the uberjar with `lein uberjar`
             :uberjar {:aot :all
                       :jvm-opts ["-Dclojure.compiler.elide-meta=[:doc :added :file :line]" ; strip out metadata for faster load / smaller uberjar size
                                  "-Dmanifold.disable-jvm8-primitives=true"]}               ; disable Manifold Java 8 primitives (see https://github.com/ztellman/manifold#java-8-extensions)
             ;; generate sample dataset with `lein generate-sample-dataset`
             :generate-sample-dataset {:dependencies [[faker "0.2.2"]]                   ; Fake data generator -- port of Perl/Ruby library
                                       :source-paths ["sample_dataset"]
                                       :main ^:skip-aot metabase.sample-dataset.generate}
             ;; Profile Metabase start time with `lein profile`
             :profile {:jvm-opts ["-XX:+CITime"                       ; print time spent in JIT compiler
                                  "-XX:+PrintGC"]}                    ; print a message when garbage collection takes place
             ;; get the H2 shell with 'lein h2'
             :h2-shell {:main org.h2.tools.Shell}
             :validate-automagic-dashboards {:main metabase.automagic-dashboards.rules}})

;; -*- comment-column: 70; -*-
;; full set of options are here .. https://github.com/technomancy/leiningen/blob/master/sample.project.clj

(defproject metabase "metabase-SNAPSHOT"
  :description "Metabase Community Edition"
  :url "http://metabase.com/"
  :min-lein-version "2.5.0"
  :aliases {"test" ["with-profile" "+expectations" "expectations"]
            "generate-sample-dataset" ["with-profile" "+generate-sample-dataset" "run"]}
  :dependencies [[org.clojure/clojure "1.7.0"]
                 [org.clojure/core.async "0.2.374"]
                 [org.clojure/core.match "0.3.0-alpha4"]              ; optimized pattern matching library for Clojure
                 [org.clojure/core.memoize "0.5.8"]                   ; needed by core.match; has useful FIFO, LRU, etc. caching mechanisms
                 [org.clojure/data.csv "0.1.3"]                       ; CSV parsing / generation
                 [org.clojure/java.classpath "0.2.3"]
                 [org.clojure/java.jdbc "0.4.2"]                      ; basic jdbc access from clojure
                 [org.clojure/math.numeric-tower "0.0.4"]             ; math functions like `ceil`
                 [org.clojure/tools.logging "0.3.1"]                  ; logging framework
                 [org.clojure/tools.namespace "0.2.10"]
                 [amalloy/ring-gzip-middleware "0.1.3"]               ; Ring middleware to GZIP responses if client can handle it
                 [cheshire "5.5.0"]                                   ; fast JSON encoding (used by Ring JSON middleware)
                 [clj-http "2.0.0"]                                   ; WHY DO WE HAVE BOTH CLJ-HTTP AND CLJ-HTTP-LITE ?! :unamused:
                 [clj-http-lite "0.3.0"]                              ; HTTP client; lightweight version of clj-http that uses HttpURLConnection instead of Apache
                 [clj-time "0.11.0"]                                  ; library for dealing with date/time
                 [clojurewerkz/quartzite "2.0.0"]                     ; scheduling library
                 [colorize "0.1.1" :exclusions [org.clojure/clojure]] ; string output with ANSI color codes (for logging)
                 [com.cemerick/friend "0.2.1"]                        ; auth library
                 [com.draines/postal "1.11.4"]                        ; SMTP library
                 [com.h2database/h2 "1.4.190"]                        ; embedded SQL database
                 [com.mattbertolini/liquibase-slf4j "1.2.1"]          ; Java Migrations lib
                 [com.novemberain/monger "3.0.1"]                     ; MongoDB Driver
                 [compojure "1.4.0"]                                  ; HTTP Routing library built on Ring
                 [environ "1.0.1"]                                    ; easy environment management
                 [hiccup "1.0.5"]                                     ; HTML templating
                 [korma "0.4.2"]                                      ; SQL lib
                 [log4j/log4j "1.2.17"
                  :exclusions [javax.mail/mail
                               javax.jms/jms
                               com.sun.jdmk/jmxtools
                               com.sun.jmx/jmxri]]
                 [medley "0.7.0"]                                     ; lightweight lib of useful functions
                 [mysql/mysql-connector-java "5.1.37"]                ; MySQL JDBC driver
                 [net.sf.cssbox/cssbox "4.10"]
                 [net.sourceforge.jtds/jtds "1.3.1"]                  ; Open Source SQL Server driver
                 [org.xhtmlrenderer/flying-saucer-core "9.0.8"]
                 [org.liquibase/liquibase-core "3.4.2"]               ; migration management (Java lib)
                 [org.slf4j/slf4j-log4j12 "1.7.13"]                   ; Logging
                 [org.yaml/snakeyaml "1.16"]                          ; YAML parser (required by liquibase)
                 [org.xerial/sqlite-jdbc "3.8.11.2"]                  ; SQLite driver
                 [postgresql "9.3-1102.jdbc41"]                       ; Postgres driver
                 [ring/ring-jetty-adapter "1.4.0"]                    ; Ring adapter using Jetty webserver (used to run a Ring server for unit tests)
                 [ring/ring-json "0.4.0"]                             ; Ring middleware for reading/writing JSON automatically
                 [stencil "0.5.0"]                                    ; Mustache templates for Clojure
                 [swiss-arrows "1.0.0"]]                              ; 'Magic wand' macro -<>, etc.
  :plugins [[lein-environ "1.0.1"]                                    ; Specify env vars in project.clj
            [lein-ring "0.9.7"]]                                      ; start the HTTP server with 'lein ring server'
  :main ^:skip-aot metabase.core
  :manifest {"Liquibase-Package" "liquibase.change,liquibase.changelog,liquibase.database,liquibase.parser,liquibase.precondition,liquibase.datatype,liquibase.serializer,liquibase.sqlgenerator,liquibase.executor,liquibase.snapshot,liquibase.logging,liquibase.diff,liquibase.structure,liquibase.structurecompare,liquibase.lockservice,liquibase.sdk,liquibase.ext"}
  :target-path "target/%s"
  :javac-options ["-target" "1.6" "-source" "1.6"]
  :uberjar-name "metabase.jar"
  :ring {:handler metabase.core/app
         :init metabase.core/init
         :destroy metabase.core/destroy}
  :eastwood {:exclude-namespaces [:test-paths]
             :add-linters [:unused-private-vars]
             :exclude-linters [:constant-test                         ; korma macros generate some forms with if statements that are always logically true or false
                               :suspicious-expression                 ; core.match macros generate some forms like (and expr) which is "suspicious"
                               :unused-ret-vals]}                     ; gives too many false positives for functions with side-effects like conj!
  :profiles {:dev {:dependencies [[org.clojure/tools.nrepl "0.2.12"]  ; REPL <3. TODO - not specifically required for our project, this can be in ~/.lein/profiles.clj
                                  [org.clojure/tools.reader "0.10.0"] ; Need to explictly specify this dep otherwise expectations doesn't seem to work right :'(
                                  [expectations "2.1.4"]              ; unit tests
                                  [ring/ring-mock "0.3.0"]]
                   :plugins [[jonase/eastwood "0.2.1"]                ; Linting
                             [lein-ancient "0.6.8"]                   ; Check project for outdated dependencies + plugins w/ 'lein ancient'
                             [lein-bikeshed "0.2.0"]                  ; Linting
                             [lein-expectations "0.0.8"]              ; run unit tests with 'lein expectations'
                             [lein-instant-cheatsheet "2.1.4"]        ; use awesome instant cheatsheet created by yours truly w/ 'lein instant-cheatsheet'
                             [michaelblume/lein-marginalia "0.9.0"]]  ; generate documentation with 'lein marg'
                   :global-vars {*warn-on-reflection* true}           ; Emit warnings on all reflection calls
                   :env {:mb-run-mode "dev"}
                   :jvm-opts ["-Dlogfile.path=target/log"
                              "-Xms1024m"                             ; give JVM a decent heap size to start with
                              "-Xmx2048m"                             ; hard limit of 2GB so we stop hitting the 4GB container limit on CircleCI
                              "-XX:+CMSClassUnloadingEnabled"         ; let Clojure's dynamically generated temporary classes be GC'ed from PermGen
                              "-XX:+UseConcMarkSweepGC"]}             ; Concurrent Mark Sweep GC needs to be used for Class Unloading (above)
             :expectations {:global-vars {*warn-on-reflection* false}
                            :injections [(require 'metabase.test-setup)]
                            :resource-paths ["test_resources"]
                            :env {:mb-test-setting-1 "ABCDEFG"
                                  :mb-run-mode "test"}
                            :jvm-opts ["-Dmb.db.in.memory=true"
                                       "-Dmb.jetty.join=false"
                                       "-Dmb.jetty.port=3010"
                                       "-Dmb.api.key=test-api-key"
                                       "-Xverify:none"]}              ; disable bytecode verification when running tests so they start slightly faster
             :uberjar {:aot :all}
             :generate-sample-dataset {:dependencies [[faker "0.2.2"]                   ; Fake data generator -- port of Perl/Ruby
                                                      [incanter/incanter-core "1.9.0"]] ; Satistical functions like normal distibutions}})
                                       :source-paths ["sample_dataset"]
                                       :global-vars {*warn-on-reflection* false}
                                       :main ^:skip-aot metabase.sample-dataset.generate}
             ;; Run reset password from source: MB_DB_PATH=/path/to/metabase.db lein with-profile reset-password run email@address.com
             ;; Create the reset password JAR:  lein with-profile reset-password jar
             ;;                                   -> ./reset-password-artifacts/reset-password/reset-password.jar
             ;; Run the reset password JAR:     MB_DB_PATH=/path/to/metabase.db java -classpath /path/to/metabase-uberjar.jar:/path/to/reset-password.jar \
             ;;                                   metabase.reset_password.core email@address.com
             :reset-password {:source-paths ["reset_password"]
                              :global-vars {*warn-on-reflection* false}
                              :main metabase.reset-password.core
                              :jar-name "reset-password.jar"
                              ;; Exclude everything except for reset-password specific code in the created jar
                              :jar-exclusions [#"^(?!metabase/reset_password).*$"]
                              :target-path "reset-password-artifacts/%s"}}) ; different than ./target because otherwise lein uberjar will delete our artifacts and vice versa

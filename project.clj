;; -*- comment-column: 70; -*-
;; full set of options are here .. https://github.com/technomancy/leiningen/blob/master/sample.project.clj

(defproject metabase "metabase-0.1.0-SNAPSHOT"
  :description "Metabase Community Edition"
  :url "http://metabase.com/"
  :min-lein-version "2.5.0"
  :aliases {"test" ["with-profile" "+expectations" "expectations"]}
  :dependencies [[org.clojure/clojure "1.6.0"]
                 [org.clojure/core.async "LATEST"]                    ; facilities for async programming + communication (using 'LATEST' because this is an alpha library)
                 [org.clojure/core.match "0.3.0-alpha4"]              ; optimized pattern matching library for Clojure
                 [org.clojure/math.numeric-tower "0.0.4"]             ; math functions like `ceil`
                 [org.clojure/core.memoize "0.5.7"]                   ; needed by core.match; has useful FIFO, LRU, etc. caching mechanisms
                 [org.clojure/data.csv "0.1.2"]                       ; CSV parsing / generation
                 [org.clojure/data.json "0.2.6"]                      ; JSON parsing / generation
                 [org.clojure/java.classpath "0.2.2"]
                 [org.clojure/java.jdbc "0.3.6"]                      ; basic jdbc access from clojure
                 [org.clojure/tools.logging "0.3.1"]                  ; logging framework
                 [org.clojure/tools.macro "0.1.5"]                    ; tools for writing macros
                 [org.clojure/tools.namespace "0.2.10"]
                 [org.clojure/tools.trace "0.7.8"]                    ; "tracing macros/fns to help you see what your code is doing"
                 [amalloy/ring-gzip-middleware "0.1.3"]               ; Ring middleware to GZIP responses if client can handle it
                 [cheshire "5.4.0"]                                   ; fast JSON encoding (used by Ring JSON middleware)
                 [clj-http-lite "0.2.1"]                              ; HTTP client; lightweight version of clj-http that uses HttpURLConnection instead of Apache
                 [clj-time "0.9.0"]                                   ; library for dealing with date/time
                 [colorize "0.1.1" :exclusions [org.clojure/clojure]] ; string output with ANSI color codes (for logging)
                 [com.cemerick/friend "0.2.1"]                        ; auth library
                 [com.h2database/h2 "1.4.186"]                        ; embedded SQL database
                 [com.mattbertolini/liquibase-slf4j "1.2.1"]
                 [compojure "1.3.2"]                                  ; HTTP Routing library built on Ring
                 [environ "1.0.0"]                                    ; easy environment management
                 [hiccup "1.0.5"]                                     ; HTML templating
                 [korma "0.4.0"]                                      ; SQL lib
                 [log4j/log4j "1.2.17"
                  :exclusions [javax.mail/mail
                               javax.jms/jms
                               com.sun.jdmk/jmxtools
                               com.sun.jmx/jmxri]]
                 [medley "0.5.5"]                                     ; lightweight lib of useful functions
                 [org.liquibase/liquibase-core "3.3.2"]               ; migration management (Java lib)
                 [org.slf4j/slf4j-log4j12 "1.7.10"]
                 [org.yaml/snakeyaml "1.15"]                          ; YAML parser (required by liquibase)
                 [postgresql "9.3-1102.jdbc41"]                       ; Postgres driver
                 [ring/ring-jetty-adapter "1.3.2"]                    ; Ring adapter using Jetty webserver (used to run a Ring server for unit tests)
                 [ring/ring-json "0.3.1"]                             ; Ring middleware for reading/writing JSON automatically
                 [swiss-arrows "1.0.0"]]                              ; 'Magic wand' macro -<>, etc.
  :plugins [[lein-environ "1.0.0"]                                    ; easy access to environment variables
            [lein-ring "0.9.3"]]                                      ; start the HTTP server with 'lein ring server'
  :java-source-paths ["src/java"]
  :main ^:skip-aot metabase.core
  :manifest {"Liquibase-Package" "liquibase.change,liquibase.changelog,liquibase.database,liquibase.parser,liquibase.precondition,liquibase.datatype,liquibase.serializer,liquibase.sqlgenerator,liquibase.executor,liquibase.snapshot,liquibase.logging,liquibase.diff,liquibase.structure,liquibase.structurecompare,liquibase.lockservice,liquibase.sdk,liquibase.ext"}
  :target-path "target/%s"
  ;; :jar-exclusions [#"\.java"] Circle CI doesn't like regexes because it's using the EDN reader and is retarded
  :ring {:handler metabase.core/app
         :init metabase.core/init}
  :eastwood {:exclude-namespaces [:test-paths]
             :add-linters [:unused-private-vars]
             :exclude-linters [:constant-test]}                       ; korma macros generate some formats with if statements that are always logically true or false
  :profiles {:dev {:dependencies [[org.clojure/tools.nrepl "0.2.8"]   ; REPL <3
                                  [expectations "2.1.0"]              ; unit tests
                                  [marginalia "0.8.0"]                ; for documentation
                                  [ring/ring-mock "0.2.0"]]
                   :plugins [[cider/cider-nrepl "0.9.0-SNAPSHOT"]     ; Interactive development w/ cider NREPL in Emacs
                             [jonase/eastwood "0.2.1"]                ; Linting
                             [lein-ancient "0.6.5"]                   ; Check project for outdated dependencies + plugins w/ 'lein ancient'
                             [lein-expectations "0.0.8"]              ; run unit tests with 'lein expectations'
                             [lein-instant-cheatsheet "2.0.0"]        ; use awesome instant cheatsheet created by yours truly w/ 'lein instant-cheatsheet'
                             [lein-marginalia "0.8.0"]]               ; generate documentation with 'lein marg'
                   :jvm-opts ["-Dlogfile.path=target/log"
                              "-Xms1024m"                             ; give JVM a decent heap size to start with
                              "-Xmx2048m"                             ; hard limit of 2GB so we stop hitting the 4GB container limit on CircleCI
                              "-XX:+CMSClassUnloadingEnabled"         ; let Clojure's dynamically generated temporary classes be GC'ed from PermGen
                              "-XX:+UseConcMarkSweepGC"]}             ; Concurrent Mark Sweep GC needs to be used for Class Unloading (above)
             :expectations {:resource-paths ["test_resources"]
                            :jvm-opts ["-Dmb.db.file=target/metabase-test"
                                       "-Dmb.jetty.join=false"
                                       "-Dmb.jetty.port=3001"]}
             :uberjar {:aot :all
                       :prep-tasks ["npm" "gulp" "javac" "compile"]}})

;; -*- comment-column: 60; -*-
;; full set of options are here .. https://github.com/technomancy/leiningen/blob/master/sample.project.clj

(defproject metabase "metabase-0.1.0-SNAPSHOT"
  :description "Metabase Community Edition"
  :url "http://metabase.com/"
  :min-lein-version "2.3.0"
  :dependencies [[org.clojure/clojure "1.6.0"]
                 [org.clojure/core.async "LATEST"]          ; facilities for async programming + communication (using 'LATEST' because this is an alpha library)
                 [org.clojure/core.match "0.3.0-alpha4"]    ; optimized pattern matching library for Clojure
                 [org.clojure/math.numeric-tower "0.0.4"]   ; math functions like `ceil`
                 [org.clojure/core.memoize "0.5.7"]         ; needed by core.match; has useful FIFO, LRU, etc. caching mechanisms
                 [org.clojure/data.csv "0.1.2"]             ; CSV parsing / generation
                 [org.clojure/data.json "0.2.6"]            ; JSON parsing / generation
                 [org.clojure/java.jdbc "0.3.6"]            ; basic jdbc access from clojure
                 [org.clojure/tools.logging "0.3.1"]        ; logging framework
                 [org.clojure/tools.macro "0.1.5"]          ; tools for writing macros
                 [org.clojure/tools.trace "0.7.8"]          ; "tracing macros/fns to help you see what your code is doing"
                 [cheshire "5.4.0"]                         ; fast JSON encoding (used by Ring JSON middleware)
                 [clj-time "0.9.0"]                         ; library for dealing with date/time
                 [com.cemerick/friend "0.2.1"]              ; auth library
                 [com.h2database/h2 "1.4.186"]              ; embedded SQL database
                 [com.mattbertolini/liquibase-slf4j "1.2.1"]
                 [compojure "1.3.2"]                        ; HTTP Routing library built on Ring
                 [environ "1.0.0"]                          ; easy environment management
                 [korma "0.4.0"]                            ; SQL lib
                 [log4j/log4j "1.2.17"
                  :exclusions [javax.mail/mail
                               javax.jms/jms
                               com.sun.jdmk/jmxtools
                               com.sun.jmx/jmxri]]
                 [marginalia "0.8.0"]                       ; for documentation
                 [medley "0.5.5"]                           ; lightweight lib of useful functions
                 [org.liquibase/liquibase-core "3.3.2"]     ; migration management (Java lib)
                 [org.slf4j/slf4j-log4j12 "1.7.10"]
                 [org.yaml/snakeyaml "1.15"]                ; YAML parser (required by liquibase)
                 [postgresql "9.3-1102.jdbc41"]             ; Postgres driver
                 [ring/ring-jetty-adapter "1.3.2"]          ; Ring adapter using Jetty webserver (used to run a Ring server for unit tests)
                 [ring/ring-json "0.3.1"]                   ; Ring middleware for reading/writing JSON automatically
                 [swiss-arrows "1.0.0"]]                    ; 'Magic wand' macro -<>, etc.
  :plugins [[cider/cider-nrepl "0.9.0-SNAPSHOT"]            ; Interactive development w/ cider NREPL in Emacs
            [jonase/eastwood "0.2.1"]                       ; Linting
            [lein-ancient "0.6.4"]                          ; Check project for outdated dependencies + plugins w/ 'lein ancient'
            [lein-environ "0.5.0"]                          ; easy access to environment variables
            [lein-expectations "0.0.7"]                     ; run unit tests with 'lein expectations'
            [lein-marginalia "LATEST"]                      ; generate documentation with 'lein marg'
            [lein-ring "0.8.10"]]                           ; start the HTTP server with 'lein ring server'
  :java-source-paths ["src/java"]
  :main ^:skip-aot metabase.core
  :manifest {"Liquibase-Package" "liquibase.change,liquibase.changelog,liquibase.database,liquibase.parser,liquibase.precondition,liquibase.datatype,liquibase.serializer,liquibase.sqlgenerator,liquibase.executor,liquibase.snapshot,liquibase.logging,liquibase.diff,liquibase.structure,liquibase.structurecompare,liquibase.lockservice,liquibase.sdk,liquibase.ext"}
  :target-path "target/%s"
  ;; :jar-exclusions [#"\.java"] Circle CI doesn't like regexes because it's using the EDN reader and is retarded
  :ring {:handler metabase.core/app}
  :eastwood {:exclude-namespaces [:test-paths]
             :add-linters [:unused-private-vars]
             :exclude-linters [:constant-test]}             ; korma macros generate some formats with if statements that are always logically true or false
  :profiles {:dev {:dependencies [[clj-http "1.0.1"]                         ; HTTP Client
                                  [expectations "2.0.16"]   ; unit tests
                                  [ring/ring-mock "0.2.0"]]
                   :jvm-opts ["-Dlogfile.path=target/log"]}
             :uberjar {:aot :all
                       :prep-tasks ["npm" "gulp" "javac" "compile"]}})

;; -*- comment-column: 60; -*-

(defproject metabase "metabase-0.1.0-SNAPSHOT"
  :description "Metabase Community Edition"
  :url "http://metabase.com/"
  :license {:name "Eclipse Public License"
            :url "http://www.eclipse.org/legal/epl-v10.html"}
  :min-lein-version "2.0.0"
  :dependencies [[org.clojure/clojure "1.6.0"]
                 [org.clojure/core.async "LATEST"]          ; facilities for async programming + communication (using 'LATEST' because this is an alpha library)
                 [org.clojure/core.match "0.3.0-alpha4"]    ; optimized pattern matching library for Clojure
                 [org.clojure/math.numeric-tower "0.0.4"]   ; math functions like `ceil`
                 [org.clojure/core.memoize "0.5.6"]         ; needed by core.match; has useful FIFO, LRU, etc. caching mechanisms
                 [org.clojure/data.csv "0.1.2"]             ; CSV parsing / generation
                 [org.clojure/data.json "0.2.5"]            ; JSON parsing / generation
                 [org.clojure/java.jdbc "0.3.6"]            ; basic jdbc access from clojure
                 [org.clojure/tools.logging "0.3.1"]        ; logging framework
                 [org.clojure/tools.macro "0.1.2"]          ; tools for writing macros
                 [clj-time "0.5.1"]                         ; library for dealing with date/time
                 [com.cemerick/friend "0.2.1"]              ; auth library
                 [com.h2database/h2 "1.3.170"]              ; embedded SQL database
                 [com.mattbertolini/liquibase-slf4j "1.2.1"]
                 [compojure "1.3.1"]                        ; HTTP Routing library built on Ring
                 [environ "0.5.0"]                          ; easy environment management
                 [korma "0.4.0"]                            ; SQL lib
                 [log4j/log4j "1.2.17"
                  :exclusions [javax.mail/mail
                               javax.jms/jms
                               com.sun.jdmk/jmxtools
                               com.sun.jmx/jmxri]]
                 [marginalia "0.7.1"]                       ; for documentation
                 [medley "0.5.5"]                           ; lightweight lib of useful functions
                 [org.liquibase/liquibase-core "3.3.2"]     ; migration management (Java lib)
                 [org.slf4j/slf4j-log4j12 "1.7.1"]
                 [org.yaml/snakeyaml "1.14"]                ; YAML parser (required by liquibase)
                 [postgresql "9.1-901.jdbc4"]               ; Postgres driver
                 [ring/ring-json "0.3.1"]                   ; Ring middleware for reading/writing JSON automatically
                 [swiss-arrows "1.0.0"]                     ; 'Magic wand' macro -<>, etc.
                 ]
  :plugins [[cider/cider-nrepl "0.9.0-SNAPSHOT"]            ; Interactive development w/ cider NREPL in Emacs
            [lein-environ "0.5.0"]                          ; easy access to environment variables
            [lein-expectations "0.0.7"]                     ; run unit tests with 'lein expectations'
            [lein-marginalia "LATEST"]                      ; generate documentation with 'lein marg'
            [lein-ring "0.8.10"]                            ; start the HTTP server with 'lein ring server'
            ]
  :java-source-paths ["src/java"]
  :main ^:skip-aot metabase.core
  :target-path "target/%s"
  :ring {:handler metabase.core/app}
  :profiles {:dev {:dependencies [[expectations "2.0.12"]   ; unit tests
                                  ]
                   :jvm-opts ["-Dlogfile.path=target/log"]}
             :uberjar {:aot :all}})

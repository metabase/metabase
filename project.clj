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
                 [org.clojure/data.json "0.2.5"]            ; JSON parsing / generation
                 [org.clojure/tools.logging "0.3.1"]        ; logging framework
                 [org.clojure/tools.macro "0.1.2"]          ; tools for writing macros
                 [com.cemerick/friend "0.2.1"]              ; auth library
                 [com.h2database/h2 "1.3.170"]              ; embedded SQL database
                 [compojure "1.3.1"]                        ; HTTP Routing library built on Ring
                 [environ "0.5.0"]                          ; easy environment management
                 [expectations "2.0.12"]                    ; unit tests
                 [hiccup "1.0.5"]                           ; HTML templating
                 [korma "0.4.0"]                            ; SQL lib
                 [log4j/log4j "1.2.17"
                  :exclusions [javax.mail/mail
                               javax.jms/jms
                               com.sun.jdmk/jmxtools
                               com.sun.jmx/jmxri]]
                 [marginalia "0.7.1"]                       ; for documentation
                 [ring/ring-json "0.3.1"]                   ; Ring middleware for reading/writing JSON automatically
                 [swiss-arrows "1.0.0"]                     ; 'Magic wand' macro -<>, etc.
                 ]
  :plugins [[cider/cider-nrepl "LATEST"]                    ; Interactive development w/ cider NREPL in Emacs
            [lein-environ "0.5.0"]                          ; easy access to environment variables
            [lein-expectations "0.0.7"]                     ; run unit tests with 'lein expectations'
            [lein-midje "3.1.3"]                            ; another unit testing option
            [lein-marginalia "LATEST"]                      ; generate documentation with 'lein marg'
            [lein-ring "0.8.10"]                            ; start the HTTP server with 'lein ring server'
            ]
  :main ^:skip-aot metabase.core
  :target-path "target/%s"
  :ring {:handler metabase.core/app}
  :profiles {:dev {:dependencies [[midje "1.6.3"]]
                   :jvm-opts ["-Dlogfile.path=target/log"]}
             :uberjar {:aot :all}})

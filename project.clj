;; -*- comment-column: 70; -*-
;; full set of options are here .. https://github.com/technomancy/leiningen/blob/master/sample.project.clj

(defproject metabase-core "1.0.0-SNAPSHOT"
  :description      "Metabase Community Edition"
  :url              "https://metabase.com/"
  :min-lein-version "2.5.0"

  :aliases
  {"generate-sample-dataset"           ["with-profile" "+generate-sample-dataset" "run"]
   "profile"                           ["with-profile" "+profile" "run" "profile"]
   "h2"                                ["with-profile" "+h2-shell" "run" "-url" "jdbc:h2:./metabase.db"
                                        "-user" "" "-password" "" "-driver" "org.h2.Driver"]
   "generate-automagic-dashboards-pot" ["with-profile" "+generate-automagic-dashboards-pot" "run"]
   "install"                           ["with-profile" "+install" "install"]
   "install-for-building-drivers"      ["with-profile" "install-for-building-drivers" "install"]
   "test"                              ["with-profile" "+expectations" "expectations"]
   "bikeshed"                          ["with-profile" "+bikeshed" "bikeshed" "--max-line-length" "205"]
   "eastwood"                          ["with-profile" "+eastwood" "eastwood"]
   "check-reflection-warnings"         ["with-profile" "+reflection-warnings" "check"]
   "docstring-checker"                 ["with-profile" "+docstring-checker" "docstring-checker"]
   "strip-and-compress"                ["with-profile" "+strip-and-compress" "run"]}

  ;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  ;; !!                                   PLEASE KEEP THESE ORGANIZED ALPHABETICALLY                                  !!
  ;; !!                                   AND ADD A COMMENT EXPLAINING THEIR PURPOSE                                  !!
  ;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  :dependencies
  [[org.clojure/clojure "1.9.0"]
   [org.clojure/core.async "0.4.490"
    :exclusions [org.clojure/tools.reader]]
   [org.clojure/core.match "0.3.0-alpha4"]                            ; optimized pattern matching library for Clojure
   [org.clojure/core.memoize "0.7.1"]                                 ; needed by core.match; has useful FIFO, LRU, etc. caching mechanisms
   [org.clojure/data.csv "0.1.4"]                                     ; CSV parsing / generation
   [org.clojure/java.classpath "0.3.0"]                               ; examine the Java classpath from Clojure programs
   [org.clojure/java.jdbc "0.7.8"]                                    ; basic JDBC access from Clojure
   [org.clojure/math.combinatorics "0.1.4"]                           ; combinatorics functions
   [org.clojure/math.numeric-tower "0.0.4"]                           ; math functions like `ceil`
   [org.clojure/tools.logging "0.4.1"]                                ; logging framework
   [org.clojure/tools.namespace "0.2.11"]
   [amalloy/ring-buffer "1.2.2"
    :exclusions [org.clojure/clojure
                 org.clojure/clojurescript]]                          ; fixed length queue implementation, used in log buffering
   [amalloy/ring-gzip-middleware "0.1.3"]                             ; Ring middleware to GZIP responses if client can handle it
   [aleph "0.4.6" :exclusions [org.clojure/tools.logging]]            ; Async HTTP library; WebSockets
   [bigml/histogram "4.1.3"]                                          ; Histogram data structure
   [buddy/buddy-core "1.5.0"]                                         ; various cryptograhpic functions
   [buddy/buddy-sign "3.0.0"]                                         ; JSON Web Tokens; High-Level message signing library
   [cheshire "5.8.1"]                                                 ; fast JSON encoding (used by Ring JSON middleware)
   [clj-http "3.9.1"                                                  ; HTTP client
    :exclusions [commons-codec
                 commons-io
                 slingshot]]
   [clj-time "0.15.1"]                                                ; library for dealing with date/time
   [clojurewerkz/quartzite "2.1.0"                                    ; scheduling library
    :exclusions [c3p0]]
   [colorize "0.1.1" :exclusions [org.clojure/clojure]]               ; string output with ANSI color codes (for logging)
   [com.cemerick/friend "0.2.3"                                       ; auth library
    :exclusions [commons-codec
                 org.apache.httpcomponents/httpclient
                 net.sourceforge.nekohtml/nekohtml
                 ring/ring-core]]
   [com.clearspring.analytics/stream "2.9.6"                          ; Various sketching algorithms
    :exclusions [org.slf4j/slf4j-api
                 it.unimi.dsi/fastutil]]
   [com.draines/postal "2.0.3"]                                       ; SMTP library
   [com.jcraft/jsch "0.1.55"]                                         ; SSH client for tunnels
   [com.h2database/h2 "1.4.197"]                                      ; embedded SQL database
   [com.mattbertolini/liquibase-slf4j "2.0.0"]                        ; Java Migrations lib logging. We don't actually use this AFAIK (?)
   [com.mchange/c3p0 "0.9.5.2"]                                       ; connection pooling library
   [com.taoensso/nippy "2.14.0"]                                      ; Fast serialization (i.e., GZIP) library for Clojure
   [compojure "1.6.1" :exclusions [ring/ring-codec]]                  ; HTTP Routing library built on Ring
   [crypto-random "1.2.0"]                                            ; library for generating cryptographically secure random bytes and strings
   [dk.ative/docjure "1.13.0"]                                        ; Excel export
   [environ "1.1.0"]                                                  ; easy environment management
   [hiccup "1.0.5"]                                                   ; HTML templating
   [honeysql "0.9.4" :exclusions [org.clojure/clojurescript]]         ; Transform Clojure data structures to SQL
   [io.forward/yaml "1.0.9"                                           ; Clojure wrapper for YAML library SnakeYAML (which we already use for liquidbase)
    :exclusions [org.clojure/clojure
                 org.flatland/ordered
                 org.yaml/snakeyaml]]
   [kixi/stats "0.4.4" :exclusions [org.clojure/data.avl]]            ; Various statistic measures implemented as transducers
   [log4j/log4j "1.2.17"                                              ; logging framework. TODO - consider upgrading to Log4j 2 -- see https://logging.apache.org/log4j/log4j-2.6.1/manual/migration.html
    :exclusions [javax.mail/mail
                 javax.jms/jms
                 com.sun.jdmk/jmxtools
                 com.sun.jmx/jmxri]]
   [medley "1.0.0"]                                                   ; lightweight lib of useful functions
   [metabase/throttle "1.0.1"]                                        ; Tools for throttling access to API endpoints and other code pathways
   [mysql/mysql-connector-java "5.1.45"]                              ; MySQL JDBC driver
   [javax.xml.bind/jaxb-api "2.4.0-b180830.0359"]                     ; add the `javax.xml.bind` classes which we're still using but were removed in Java 11
   [jdistlib "0.5.1" :exclusions [com.github.wendykierp/JTransforms]] ; Distribution statistic tests
   [net.sf.cssbox/cssbox "4.12" :exclusions [org.slf4j/slf4j-api]]    ; HTML / CSS rendering
   [org.clojars.pntblnk/clj-ldap "0.0.16"]                            ; LDAP client
   [org.flatland/ordered "1.5.7"]                                     ; ordered maps & sets
   [org.liquibase/liquibase-core "3.6.2"                              ; migration management (Java lib)
    :exclusions [ch.qos.logback/logback-classic]]
   [org.postgresql/postgresql "42.2.5"]                               ; Postgres driver
   [org.slf4j/slf4j-log4j12 "1.7.25"]                                 ; abstraction for logging frameworks -- allows end user to plug in desired logging framework at deployment time
   [org.tcrawley/dynapath "1.0.0"]                                    ; Dynamically add Jars (e.g. Oracle or Vertica) to classpath
   [org.yaml/snakeyaml "1.23"]                                        ; YAML parser (required by liquibase)
   [prismatic/schema "1.1.9"]                                         ; Data schema declaration and validation library
   [puppetlabs/i18n "0.8.0"]                                          ; Internationalization library
   [redux "0.1.4"]                                                    ; Utility functions for building and composing transducers
   [ring/ring-core "1.7.1"]
   [ring/ring-jetty-adapter "1.7.1"]                                  ; Ring adapter using Jetty webserver (used to run a Ring server for unit tests)
   [org.eclipse.jetty/jetty-server "9.4.14.v20181114"]                ; We require JDK 8 which allows us to run Jetty 9.4, ring-jetty-adapter runs on 1.7 which forces an older version
   [ring/ring-json "0.4.0"]                                           ; Ring middleware for reading/writing JSON automatically
   [stencil "0.5.0"]                                                  ; Mustache templates for Clojure
   [expectations "2.2.0-beta2"]
   [toucan "1.1.9" :exclusions [org.clojure/java.jdbc honeysql]]]     ; Model layer, hydration, and DB utilities

  :main ^:skip-aot metabase.core

  ;; TODO - WHAT DOES THIS DO?
  :manifest {"Liquibase-Package"
             #=(eval
                (str "liquibase.change,liquibase.changelog,liquibase.database,liquibase.parser,liquibase.precondition,"
                     "liquibase.datatype,liquibase.serializer,liquibase.sqlgenerator,liquibase.executor,"
                     "liquibase.snapshot,liquibase.logging,liquibase.diff,liquibase.structure,"
                     "liquibase.structurecompare,liquibase.lockservice,liquibase.sdk,liquibase.ext"))}

  :target-path "target/%s"

  :jvm-opts
  ["-XX:+IgnoreUnrecognizedVMOptions"                                 ; ignore things not recognized for our Java version instead of refusing to start
   "-Xverify:none"                                                    ; disable bytecode verification when running in dev so it starts slightly faster
   "-Djava.awt.headless=true"]                                        ; prevent Java icon from randomly popping up in dock when running `lein ring server`

  :javac-options ["-target" "1.8", "-source" "1.8"]
  :uberjar-name "metabase.jar"

  :ring
  {:handler      metabase.core/app
   :init         metabase.core/init!
   :destroy      metabase.core/destroy
   :reload-paths ["src"]}

  :profiles
  {:dev
   {:dependencies
    [[clj-http-fake "1.0.3" :exclusions [slingshot]]                  ; Library to mock clj-http responses
     [expectations "2.2.0-beta2"]                                     ; unit tests
     [ring/ring-mock "0.3.2"]]

    :plugins
    [[docstring-checker "1.0.3"]                                      ; Check that all public vars have docstrings. Run with 'lein docstring-checker'
     [jonase/eastwood "0.3.1"
      :exclusions [org.clojure/clojure]]                              ; Linting
     [lein-bikeshed "0.4.1"]                                          ; Linting
     [lein-environ "1.1.0"]                                           ; easy access to environment variables
     [lein-expectations "0.0.8"]                                      ; run unit tests with 'lein expectations'
     [lein-ring "0.12.3"                                              ; start the HTTP server with 'lein ring server'
      :exclusions [org.clojure/clojure]]]

    :env      {:mb-run-mode "dev"}
    :jvm-opts ["-Dlogfile.path=target/log"]
    ;; Log appender class needs to be compiled for log4j to use it. Same with the Quartz class load helper
    :aot      [metabase.logger
               metabase.task.DynamicClassLoadHelper]}

   :ci
   {:jvm-opts ["-Xmx2500m"]}

   :install
   {:aot [metabase.logger
          metabase.task.DynamicClassLoadHelper]}

   :install-for-building-drivers
   {:auto-clean true
    :aot        :all}

   :with-include-drivers-middleware
   {:plugins
    [[metabase/lein-include-drivers "1.0.4"]]

    :middleware
    [leiningen.include-drivers/middleware]}

   :expectations
   [:with-include-drivers-middleware
    {:injections
     [(require 'metabase.test-setup                                   ; for test setup stuff
               'metabase.test.util)]                                  ; for the toucan.util.tes t default values for temp models

     :resource-paths
     ["test_resources"]

     :env
     {:mb-test-setting-1 "ABCDEFG"
      :mb-run-mode       "test"}

     :jvm-opts
     ["-Xms1024m"                                                     ; give JVM a decent heap size to start with
      "-Duser.timezone=UTC"
      "-Dmb.db.in.memory=true"
      "-Dmb.jetty.join=false"
      "-Dmb.jetty.port=3010"
      "-Dmb.api.key=test-api-key"
      "-Duser.language=en"]}]

   :include-all-drivers
   [:with-include-drivers-middleware
    {:include-drivers :all}]

   :bikeshed
   [:include-all-drivers]

   :eastwood
   [:include-all-drivers
    {:eastwood
     {:exclude-namespaces [:test-paths]
      :config-files       ["./test_resources/eastwood-config.clj"]
      :add-linters        [:unused-private-vars
                           :unused-namespaces
                           ;; These linters are pretty useful but give a few false positives and can't be selectively disabled (yet)
                           ;; For example see https://github.com/jonase/eastwood/issues/193
                           ;; It's still useful to re-enable them and run them every once in a while because they catch a lot of actual errors too. Keep an eye on the issue above
                           ;; and re-enable them if we can get them to work
                           #_:unused-fn-args
                           #_:unused-locals]
      ;; Turn this off temporarily until we finish removing self-deprecated functions & macros
      :exclude-linters    [:deprecations]}}]

   ;; run `lein check-reflection-warnings` to check for reflection warnings
   :reflection-warnings
   [:include-all-drivers
    {:global-vars {*warn-on-reflection* true}}]

   :docstring-checker
   [:include-all-drivers
    {:docstring-checker
     {:include [#"^metabase"]
      :exclude [#"test"
                #"^metabase\.http-client$"]}}]

   ;; build the uberjar with `lein uberjar`
   :uberjar
   {:auto-clean true
    :aot        :all}

   ;; generate sample dataset with `lein generate-sample-dataset`
   :generate-sample-dataset
   {:dependencies [[faker "0.3.2"]]                                   ; Fake data generator -- port of Perl/Ruby library
    :source-paths ["lein-commands/sample-dataset"]
    :main         ^:skip-aot metabase.sample-dataset.generate}

   :strip-and-compress
   {:source-paths ["src"
                   "lein-commands/strip-and-compress"]
    :main ^:skip-aot metabase.strip-and-compress-module}

   ;; Profile Metabase start time with `lein profile`
   :profile
   {:jvm-opts ["-XX:+CITime"                                          ; print time spent in JIT compiler
               "-XX:+PrintGC"]}                                       ; print a message when garbage collection takes place

   ;; get the H2 shell with 'lein h2'
   :h2-shell
   {:main org.h2.tools.Shell}

   :generate-automagic-dashboards-pot
   {:main metabase.automagic-dashboards.rules}})

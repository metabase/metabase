;; -*- comment-column: 70; -*-
;; full set of options are here .. https://github.com/technomancy/leiningen/blob/master/sample.project.clj

(defproject metabase-core "1.0.0-SNAPSHOT"
  :description      "Metabase"
  :url              "https://metabase.com/"
  :min-lein-version "2.5.0"

  :aliases
  {"profile"                           ["with-profile" "+profile" "run" "profile"]
   "h2"                                ["with-profile" "+h2-shell" "run" "-url" "jdbc:h2:./metabase.db"
                                        "-user" "" "-password" "" "-driver" "org.h2.Driver"]
   "generate-automagic-dashboards-pot" ["with-profile" "+generate-automagic-dashboards-pot" "run"]
   "install"                           ["with-profile" "+install" "install"]
   "install-ee"                        ["with-profile" "+install,+ee" "install"]
   "install-for-building-drivers"      ["with-profile" "install-for-building-drivers" "install"]
   "install-for-building-drivers-ee"   ["with-profile" "install-for-building-drivers,+ee" "install"]
   "run"                               ["with-profile" "+run" "run"]
   "run-ee"                            ["with-profile" "+run,+ee" "run"]
   "run-with-repl"                     ["with-profile" "+run-with-repl" "repl"]
   "run-with-repl-ee"                  ["with-profile" "+run-with-repl,+ee" "repl"]
   ;; "ring"                              ["with-profile" "+ring" "ring"]
   ;; "ring-ee"                           ["with-profile" "+ring,+ee" "ring"]
   "test"                              ["with-profile" "+test" "test"]
   "test-ee"                           ["with-profile" "+test,+ee" "test"]
   "bikeshed"                          ["with-profile" "+bikeshed" "bikeshed"
                                        "--max-line-length" "205"
                                        ;; see https://github.com/dakrone/lein-bikeshed/issues/41
                                        "--exclude-profiles" "dev"]
   "check-namespace-decls"             ["with-profile" "+check-namespace-decls" "check-namespace-decls"]
   "eastwood"                          ["with-profile" "+eastwood" "eastwood"]
   "check-reflection-warnings"         ["with-profile" "+reflection-warnings" "check"]
   "docstring-checker"                 ["with-profile" "+docstring-checker" "docstring-checker"]
   "cloverage"                         ["with-profile" "+cloverage" "cloverage"]
   ;; `lein lint` will run all linters
   "lint"                              ["do" ["eastwood"] ["bikeshed"] ["check-namespace-decls"] ["docstring-checker"] ["cloverage"]]
   "repl"                              ["with-profile" "+repl" "repl"]
   "repl-ee"                           ["with-profile" "+repl,+ee" "repl"]
   "uberjar"                           ["uberjar"]
   "uberjar-ee"                        ["with-profile" "+ee" "uberjar"]}

  ;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  ;; !!                                   PLEASE KEEP THESE ORGANIZED ALPHABETICALLY                                  !!
  ;; !!                                   AND ADD A COMMENT EXPLAINING THEIR PURPOSE                                  !!
  ;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  :dependencies
  [[org.clojure/clojure "1.10.1"]
   [org.clojure/core.async "0.4.500"
    :exclusions [org.clojure/tools.reader]]
   [joda-time/joda-time "2.10.8"]
   [org.clojure/core.logic "1.0.0"]
   [org.clojure/core.match "0.3.0"]                                   ; optimized pattern matching library for Clojure
   [org.clojure/core.memoize "1.0.236"]                               ; needed by core.match and search; has useful FIFO, LRU, etc. caching mechanisms
   [org.clojure/data.csv "0.1.4"]                                     ; CSV parsing / generation
   [org.clojure/java.classpath "1.0.0"]                               ; examine the Java classpath from Clojure programs
   [org.clojure/java.jdbc "0.7.11"]                                   ; basic JDBC access from Clojure
   [org.clojure/math.combinatorics "0.1.4"]                           ; combinatorics functions
   [org.clojure/math.numeric-tower "0.0.4"]                           ; math functions like `ceil`
   [org.clojure/tools.logging "1.1.0"]                                ; logging framework
   [org.clojure/tools.namespace "1.0.0"]
   [org.clojure/tools.trace "0.7.10"]                                 ; function tracing
   [amalloy/ring-buffer "1.2.2"
    :exclusions [org.clojure/clojure
                 org.clojure/clojurescript]]                          ; fixed length queue implementation, used in log buffering
   [amalloy/ring-gzip-middleware "0.1.4"]                             ; Ring middleware to GZIP responses if client can handle it
   [aleph "0.4.6" :exclusions [org.clojure/tools.logging]]            ; Async HTTP library; WebSockets
   [bigml/histogram "4.1.3"]                                          ; Histogram data structure
   [buddy/buddy-core "1.5.0"                                          ; various cryptograhpic functions
    :exclusions [commons-codec
                 org.bouncycastle/bcprov-jdk15on
                 org.bouncycastle/bcpkix-jdk15on]]
   [buddy/buddy-sign "3.0.0"]                                         ; JSON Web Tokens; High-Level message signing library
   [cheshire "5.10.0"]                                                ; fast JSON encoding (used by Ring JSON middleware)
   [clj-http "3.10.3"                                                 ; HTTP client
    :exclusions [commons-codec
                 commons-io
                 slingshot]]
   ;; fork to address #13102 - see upstream PR: https://github.com/dm3/clojure.java-time/pull/60
   ;; TODO: switch back to the upstream once a version is released with the above patch
   [robdaemon/clojure.java-time "0.3.3-SNAPSHOT"]                     ; Java 8 java.time wrapper
   [clojurewerkz/quartzite "2.1.0"                                    ; scheduling library
    :exclusions [c3p0]]
   [colorize "0.1.1" :exclusions [org.clojure/clojure]]               ; string output with ANSI color codes (for logging)
   [com.cemerick/friend "0.2.3"                                       ; auth library
    :exclusions [commons-codec
                 org.apache.httpcomponents/httpclient
                 net.sourceforge.nekohtml/nekohtml
                 ring/ring-core
                 slingshot]]
   [com.clearspring.analytics/stream "2.9.6"                          ; Various sketching algorithms
    :exclusions [org.slf4j/slf4j-api
                 it.unimi.dsi/fastutil]]
   [com.draines/postal "2.0.3"]                                       ; SMTP library
   [com.google.guava/guava "28.2-jre"]                                ; dep for BigQuery, Spark, and GA. Require here rather than letting different dep versions stomp on each other — see comments on #9697
   [com.h2database/h2 "1.4.197"]                                      ; embedded SQL database
   [com.taoensso/nippy "2.14.0"]                                      ; Fast serialization (i.e., GZIP) library for Clojure
   [commons-codec/commons-codec "1.15"]                               ; Apache Commons -- useful codec util fns
   [commons-io/commons-io "2.8.0"]                                    ; Apache Commons -- useful IO util fns
   [commons-validator/commons-validator "1.6"                         ; Apache Commons -- useful validation util fns
    :exclusions [commons-beanutils
                 commons-digester
                 commons-logging]]
   [compojure "1.6.1" :exclusions [ring/ring-codec]]                  ; HTTP Routing library built on Ring
   [crypto-random "1.2.0"]                                            ; library for generating cryptographically secure random bytes and strings
   [dk.ative/docjure "1.14.0" :exclusions [org.apache.poi/poi
                                           org.apache.poi/poi-ooxml]] ; excel export
   [environ "1.2.0"]                                                  ; easy environment management
   [hiccup "1.0.5"]                                                   ; HTML templating
   [honeysql "1.0.461" :exclusions [org.clojure/clojurescript]]       ; Transform Clojure data structures to SQL
   [instaparse "1.4.10"]                                              ; Make your own parser
   [io.forward/yaml "1.0.9"                                           ; Clojure wrapper for YAML library SnakeYAML (which we already use for liquibase)
    :exclusions [org.clojure/clojure
                 org.flatland/ordered
                 org.yaml/snakeyaml]]
   [javax.xml.bind/jaxb-api "2.4.0-b180830.0359"]                     ; add the `javax.xml.bind` classes which we're still using but were removed in Java 11
   [kixi/stats "0.4.4" :exclusions [org.clojure/data.avl]]            ; Various statistic measures implemented as transducers
   [me.raynes/fs "1.4.6"                                              ; Filesystem tools
    :exclusions [org.apache.commons/commons-compress]]
   [medley "1.3.0"]                                                   ; lightweight lib of useful functions
   [metabase/connection-pool "1.1.1"]                                 ; simple wrapper around C3P0. JDBC connection pools
   [metabase/saml20-clj "2.0.0"]                                      ; EE SAML integration
   [metabase/throttle "1.0.2"]                                        ; Tools for throttling access to API endpoints and other code pathways
   [net.cgrand/macrovich "0.2.1"]                                     ; utils for writing macros for both Clojure & ClojureScript
   [net.redhogs.cronparser/cron-parser-core "3.4"                     ; describe Cron schedule in human-readable language
    :exclusions [org.slf4j/slf4j-api joda-time]]                      ; exclude joda time 2.3 which has outdated timezone information
   [net.sf.cssbox/cssbox "4.12" :exclusions [org.slf4j/slf4j-api]]    ; HTML / CSS rendering
   [org.apache.commons/commons-compress "1.20"]                       ; compression utils
   [org.apache.commons/commons-lang3 "3.10"]                          ; helper methods for working with java.lang stuff
   [org.apache.logging.log4j/log4j-api "2.13.3"]                      ; apache logging framework
   [org.apache.logging.log4j/log4j-1.2-api "2.13.3"]                  ; add compatibility with log4j 1.2
   [org.apache.logging.log4j/log4j-core "2.13.3"]                     ; apache logging framework
   [org.apache.logging.log4j/log4j-jcl "2.13.3"]                      ; allows the commons-logging API to work with log4j 2
   [org.apache.logging.log4j/log4j-liquibase "2.13.3"]                ; liquibase logging via log4j 2
   [org.apache.logging.log4j/log4j-slf4j-impl "2.13.3"]               ; allows the slf4j API to work with log4j 2
   [org.apache.poi/poi "5.0.0"]                                       ; Work with Office documents (e.g. Excel spreadsheets) -- newer version than one specified by Docjure
   [org.apache.poi/poi-ooxml "5.0.0"
    :exclusions [org.bouncycastle/bcprov-jdk15on
                 org.bouncycastle/bcpkix-jdk15on]]
   [org.apache.sshd/sshd-core "2.4.0"]                                ; ssh tunneling and test server
   [org.bouncycastle/bcprov-jdk15on "1.68"]                           ; Bouncy Castle crypto library -- explicit version of BC specified to resolve illegal reflective access errors
   [org.bouncycastle/bcpkix-jdk15on "1.68"]
   [org.clojars.pntblnk/clj-ldap "0.0.16"]                            ; LDAP client
   [org.eclipse.jetty/jetty-server "9.4.32.v20200930"]                ; We require JDK 8 which allows us to run Jetty 9.4, ring-jetty-adapter runs on 1.7 which forces an older version
   [org.flatland/ordered "1.5.9"]                                     ; ordered maps & sets
   [org.graalvm.js/js "21.0.0.2"]                                     ; JavaScript engine
   [org.graalvm.js/js-scriptengine "21.0.0.2"]
   [org.liquibase/liquibase-core "3.6.3"                              ; migration management (Java lib)
    :exclusions [ch.qos.logback/logback-classic]]
   [org.mariadb.jdbc/mariadb-java-client "2.6.2"]                     ; MySQL/MariaDB driver
   [org.postgresql/postgresql "42.2.18"]                              ; Postgres driver
   [org.slf4j/slf4j-api "1.7.30"]                                     ; abstraction for logging frameworks -- allows end user to plug in desired logging framework at deployment time
   [org.tcrawley/dynapath "1.1.0"]                                    ; Dynamically add Jars (e.g. Oracle or Vertica) to classpath
   [org.threeten/threeten-extra "1.5.0"]                               ; extra Java 8 java.time classes like DayOfMonth and Quarter
   [org.yaml/snakeyaml "1.23"]                                        ; YAML parser (required by liquibase)
   [potemkin "0.4.5" :exclusions [riddley]]                           ; utility macros & fns
   [pretty "1.0.5"]                                                   ; protocol for defining how custom types should be pretty printed
   [prismatic/schema "1.1.12"]                                        ; Data schema declaration and validation library
   [redux "0.1.4"]                                                    ; Utility functions for building and composing transducers
   [riddley "0.2.0"]                                                  ; code walking lib -- used interally by Potemkin, manifold, etc.
   [ring/ring-core "1.8.1"]
   [ring/ring-jetty-adapter "1.8.1"]                                  ; Ring adapter using Jetty webserver (used to run a Ring server for unit tests)
   [ring/ring-json "0.5.0"]                                           ; Ring middleware for reading/writing JSON automatically
   [slingshot "0.12.2"]                                               ; enhanced throw/catch, used by other deps
   [stencil "0.5.0"]                                                  ; Mustache templates for Clojure
   [toucan "1.15.3" :exclusions [org.clojure/java.jdbc                ; Model layer, hydration, and DB utilities
                                 org.clojure/tools.logging
                                 org.clojure/tools.namespace
                                 honeysql]]
   [user-agent "0.1.0"]                                               ; User-Agent string parser, for Login History page & elsewhere
   [weavejester/dependency "0.2.1"]                                   ; Dependency graphs and topological sorting
   [org.clojure/java.jmx "1.0.0"]]                                    ; JMX bean library, for exporting diagnostic info

  :main ^:skip-aot metabase.core

  :manifest
  {;; Liquibase uses this manifest parameter to dynamically find extensions at startup (via classpath scanning, etc)
   "Liquibase-Package"
   #= (eval
       (str "liquibase.change,liquibase.changelog,liquibase.database,liquibase.parser,liquibase.precondition,"
            "liquibase.datatype,liquibase.serializer,liquibase.sqlgenerator,liquibase.executor,"
            "liquibase.snapshot,liquibase.logging,liquibase.diff,liquibase.structure,"
            "liquibase.structurecompare,liquibase.lockservice,liquibase.sdk,liquibase.ext"))}

  :jvm-opts
  ["-XX:+IgnoreUnrecognizedVMOptions"                                 ; ignore things not recognized for our Java version instead of refusing to start
   "-Djava.awt.headless=true"]                                        ; prevent Java icon from randomly popping up in dock when running `lein ring server`

  :target-path "target/%s"

  :javac-options
  ["-target" "1.8", "-source" "1.8"]

  :source-paths
  ["src" "backend/mbql/src" "shared/src"]

  :java-source-paths
  ["java"]

  :uberjar-name
  "metabase.jar"

  :profiles
  {:oss ; exists for symmetry with the ee profile
   {}

   :ee
   {:source-paths ["enterprise/backend/src"]
    :test-paths   ["enterprise/backend/test"]}

   :socket
   {:dependencies
    [[vlaaad/reveal "1.3.196"]]
    :jvm-opts
    ["-Dclojure.server.repl={:port 5555 :accept clojure.core.server/repl}"]}

   :dev
   {:source-paths ["dev/src" "local/src"]
    :test-paths   ["test" "backend/mbql/test" "shared/test"]

    :dependencies
    [[clj-http-fake "1.0.3" :exclusions [slingshot]]                  ; Library to mock clj-http responses
     [jonase/eastwood "0.3.11" :exclusions [org.clojure/clojure]]     ; to run Eastwood
     [methodical "0.9.4-alpha"]
     [pjstadig/humane-test-output "0.10.0"]
     [reifyhealth/specmonstah "2.0.0"]                                ; Generate fixtures to test huge databases
     [ring/ring-mock "0.4.0"]
     [talltale "0.5.4"]]                                               ; Generate realistic data for fixtures


    :plugins
    [[lein-environ "1.1.0"] ; easy access to environment variables
     [lein-licenses "LATEST"]]

    :injections
    [(require 'pjstadig.humane-test-output)
     (pjstadig.humane-test-output/activate!)
     ;; redefs lives in the `test/` directory; it's only relevant to tests, so if it's not there (e.g. when running
     ;; `lein ring server` or the like) it doesn't matter
     (try (require 'metabase.test.redefs)
          (catch Throwable _))]

    :env
    {:mb-run-mode       "dev"
     :mb-field-filter-operators-enabled "true"
     :mb-test-env-setting "ABCDEFG"}

    :jvm-opts
    ["-Dlogfile.path=target/log"]

    :repl-options
    {:init-ns user ; starting in the user namespace is a lot faster than metabase.core since it has less deps
     :timeout 240000}}

   ;; output test results in JUnit XML format
   :junit
   {:dependencies
    [[pjstadig/humane-test-output "0.10.0"]
     [test-report-junit-xml "0.2.0"]]

    :plugins
    [[lein-test-report-junit-xml "0.2.0"]]

    ;; the custom JUnit formatting logic lives in `backend/junit/test/metabase/junit.clj`
    :test-paths ["backend/junit/test"]

    :injections
    [(require 'metabase.junit)]

    :test-report-junit-xml
    {:output-dir    "target/junit"
     :format-result metabase.junit/format-result}}

   :ci
   {}

   :install
   {}

   :install-for-building-drivers
   {:auto-clean true
    :aot        :all}

   :exclude-tests
   {:test-paths ^:replace []}

   :run
   [:include-all-drivers
    :exclude-tests {}]

   :run-with-repl
   [:exclude-tests
    :include-all-drivers

    {:env
     {:mb-jetty-join "false"}

     :repl-options
     {:init    (do (require 'metabase.core)
                   (metabase.core/-main))
      :timeout 240000}}]

   ;; DISABLED FOR NOW SINCE IT'S BROKEN -- SEE #12181
   ;; start the dev HTTP server with 'lein ring server'
   ;; :ring
   ;; [:exclude-tests
   ;;  :include-all-drivers
   ;;  {:dependencies
   ;;   ;; used internally by lein ring to track namespace changes. Newer version contains fix by yours truly with 1000x
   ;;   ;; faster launch time
   ;;   [[ns-tracker "0.4.0"]]

   ;;   :plugins
   ;;   [[lein-ring "0.12.5" :exclusions [org.clojure/clojure]]]

   ;;   :ring
   ;;   {:handler      metabase.server.handler/app
   ;;    :init         metabase.core/init!
   ;;    :async?       true
   ;;    :destroy      metabase.core/destroy
   ;;    :reload-paths ["src"]}}]

   :with-include-drivers-middleware
   {:plugins
    [[metabase/lein-include-drivers "1.0.9"]]

    :middleware
    [leiningen.include-drivers/middleware]}

   ;; shared config used by various commands that run tests (lein test and lein cloverage)
   :test-common
   {:resource-paths
    ["test_resources"]

    :env
    {:mb-run-mode     "test"
     :mb-db-in-memory "true"
     :mb-jetty-join   "false"
     :mb-field-filter-operators-enabled "true"
     :mb-api-key      "test-api-key"
     ;; use a random port between 3001 and 3501. That way if you run multiple sets of tests at the same time locally
     ;; they won't stomp on each other
     :mb-jetty-port   #= (eval (str (+ 3001 (rand-int 500))))}

    :jvm-opts
    ["-Duser.timezone=UTC"
     "-Duser.language=en"]}

   :test
   [:with-include-drivers-middleware :test-common]

   :include-all-drivers
   [:with-include-drivers-middleware
    {:include-drivers :all
     :injections
     [(require 'metabase.plugins)
      (metabase.plugins/load-plugins!)]}]

   :repl
   [:include-all-drivers
    ;; so running the tests doesn't give you different answers
    {:jvm-opts ["-Duser.timezone=UTC"]}]

   ;; shared stuff between all linter profiles.
   :linters-common
   [:include-all-drivers
    :ee
    :test-common
    ;; always use in-memory H2 database for linters
    {:env {:mb-db-type "h2"}}]

   :bikeshed
   [:linters-common
    {:plugins
     [[lein-bikeshed "0.5.2"]]}]

   :eastwood
   [:linters-common
    {:plugins
     [[jonase/eastwood "0.3.6" :exclusions [org.clojure/clojure]]]

     :eastwood
     {:exclude-namespaces [:test-paths dev dev.test]
      :config-files       ["./test_resources/eastwood-config.clj"]
      :add-linters        [:unused-private-vars
                           ;; These linters are pretty useful but give a few false positives and can't be selectively
                           ;; disabled (yet)
                           ;;
                           ;; For example see https://github.com/jonase/eastwood/issues/193
                           ;;
                           ;; It's still useful to re-enable them and run them every once in a while because they catch
                           ;; a lot of actual errors too. Keep an eye on the issue above and re-enable them if we can
                           ;; get them to work
                           #_:unused-fn-args
                           #_:unused-locals]
      :exclude-linters    [    ; Turn this off temporarily until we finish removing self-deprecated functions & macros
                           :deprecations
                           ;; this has a fit in libs that use Potemkin `import-vars` such as `java-time`
                           :implicit-dependencies
                           ;; too many false positives for now
                           :unused-ret-vals]}}]

   ;; run ./bin/reflection-linter to check for reflection warnings
   :reflection-warnings
   [:include-all-drivers
    :ee
    {:global-vars {*warn-on-reflection* true}}]

   ;; Check that all public vars have docstrings. Run with 'lein docstring-checker'
   :docstring-checker
   [:linters-common
    {:plugins
     [[docstring-checker "1.1.0"]]

     :docstring-checker
     {:include [#"^metabase"]
      :exclude [#"test"
                #"^metabase\.http-client$"]}}]

   :check-namespace-decls
   [:linters-common
    {:plugins               [[lein-check-namespace-decls "1.0.3"]]
     :check-namespace-decls {:prefix-rewriting false}}]

   :cloverage
   [:test-common
    {:dependencies [[camsaul/cloverage "1.2.1.1" :exclusions [riddley]]]
     :plugins      [[camsaul/lein-cloverage  "1.2.1.1"]]
     :source-paths ^:replace ["src" "backend/mbql/src" "enterprise/backend/src" "shared/src"]
     :test-paths   ^:replace ["test" "backend/mbql/test" "enterprise/backend/test" "shared/test"]
     :cloverage    {:fail-threshold 69
                    :exclude-call
                    [;; don't instrument logging forms, since they won't get executed as part of tests anyway
                     ;; log calls expand to these
                     clojure.tools.logging/logf
                     clojure.tools.logging/logp]
                    ;; don't instrument Postgres/MySQL driver namespaces, because we don't current run tests for them
                    ;; as part of recording test coverage, which means they can give us false positives.
                    :ns-exclude-regex
                    [#"metabase\.driver\.mysql"
                     #"metabase\.driver\.postgres"]}}]

   ;; build the uberjar with `lein uberjar`
   :uberjar
   {:auto-clean true
    :aot        :all}

   ;; Profile Metabase start time with `lein profile`
   :profile
   {:jvm-opts ["-XX:+CITime"                                          ; print time spent in JIT compiler
               "-XX:+PrintGC"]} ; print a message when garbage collection takes place

   ;; get the H2 shell with 'lein h2'
   :h2-shell
   {:main org.h2.tools.Shell}

   :generate-automagic-dashboards-pot
   {:main metabase.automagic-dashboards.rules}})

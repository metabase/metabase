;; -*- comment-column: 70; -*-
;; full set of options are here .. https://github.com/technomancy/leiningen/blob/master/sample.project.clj

(defproject metabase-core "1.0.0-SNAPSHOT"
  :description      "Metabase Community Edition"
  :url              "https://metabase.com/"
  :min-lein-version "2.5.0"

  :aliases
  {"profile"                           ["with-profile" "+profile" "run" "profile"]
   "h2"                                ["with-profile" "+h2-shell" "run" "-url" "jdbc:h2:./metabase.db"
                                        "-user" "" "-password" "" "-driver" "org.h2.Driver"]
   "generate-automagic-dashboards-pot" ["with-profile" "+generate-automagic-dashboards-pot" "run"]
   "install"                           ["with-profile" "+install" "install"]
   "install-for-building-drivers"      ["with-profile" "install-for-building-drivers" "install"]
   "run"                               ["with-profile" "+run" "run"]
   "run-with-repl"                     ["with-profile" "+run-with-repl" "repl"]
   "ring"                              ["with-profile" "+ring" "ring"]
   "test"                              ["with-profile" "+test" "test"]
   "bikeshed"                          ["with-profile" "+bikeshed" "bikeshed"
                                        "--max-line-length" "205"
                                        ;; see https://github.com/dakrone/lein-bikeshed/issues/41
                                        "--exclude-profiles" "compare-h2-dbs,dev"]
   "check-namespace-decls"             ["with-profile" "+check-namespace-decls" "check-namespace-decls"]
   "eastwood"                          ["with-profile" "+eastwood" "eastwood"]
   "check-reflection-warnings"         ["with-profile" "+reflection-warnings" "check"]
   "docstring-checker"                 ["with-profile" "+docstring-checker" "docstring-checker"]
   "cloverage"                         ["with-profile" "+cloverage" "cloverage"]
   ;; `lein lint` will run all linters
   "lint"                              ["do" ["eastwood"] ["bikeshed"] ["check-namespace-decls"] ["docstring-checker"] ["cloverage"]]
   "repl"                              ["with-profile" "+repl" "repl"]
   "strip-and-compress"                ["with-profile" "+strip-and-compress,-user,-dev" "run"]
   "compare-h2-dbs"                    ["with-profile" "+compare-h2-dbs" "run"]}

  ;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  ;; !!                                   PLEASE KEEP THESE ORGANIZED ALPHABETICALLY                                  !!
  ;; !!                                   AND ADD A COMMENT EXPLAINING THEIR PURPOSE                                  !!
  ;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
  :dependencies
  [[org.clojure/clojure "1.10.1"]
   [org.clojure/core.async "0.4.500"
    :exclusions [org.clojure/tools.reader]]
   [org.clojure/core.match "0.3.0"]                                   ; optimized pattern matching library for Clojure
   [org.clojure/core.memoize "1.0.236"]                               ; needed by core.match; has useful FIFO, LRU, etc. caching mechanisms
   [org.clojure/data.csv "0.1.4"]                                     ; CSV parsing / generation
   [org.clojure/java.classpath "0.3.0"]                               ; examine the Java classpath from Clojure programs
   [org.clojure/java.jdbc "0.7.11"]                                   ; basic JDBC access from Clojure
   [org.clojure/math.combinatorics "0.1.4"]                           ; combinatorics functions
   [org.clojure/math.numeric-tower "0.0.4"]                           ; math functions like `ceil`
   [org.clojure/tools.logging "1.1.0"]                                ; logging framework
   [org.clojure/tools.namespace "0.2.11"]
   [org.clojure/tools.trace "0.7.10"]                                 ; function tracing
   [amalloy/ring-buffer "1.2.2"
    :exclusions [org.clojure/clojure
                 org.clojure/clojurescript]]                          ; fixed length queue implementation, used in log buffering
   [amalloy/ring-gzip-middleware "0.1.4"]                             ; Ring middleware to GZIP responses if client can handle it
   [aleph "0.4.6" :exclusions [org.clojure/tools.logging]]            ; Async HTTP library; WebSockets
   [bigml/histogram "4.1.3"]                                          ; Histogram data structure
   [buddy/buddy-core "1.5.0"                                          ; various cryptograhpic functions
    :exclusions [commons-codec]]
   [buddy/buddy-sign "3.0.0"]                                         ; JSON Web Tokens; High-Level message signing library
   [cheshire "5.8.1"]                                                 ; fast JSON encoding (used by Ring JSON middleware)
   [clj-http "3.9.1"                                                  ; HTTP client
    :exclusions [commons-codec
                 commons-io
                 slingshot]]
   [clojure.java-time "0.3.2"]                                        ; Java 8 java.time wrapper
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
   [com.google.guava/guava "28.2-jre"]                                ; dep for BigQuery, Spark, and GA. Require here rather than letting different dep versions stomp on each other — see comments on #9697
   [com.h2database/h2 "1.4.197"]                                      ; embedded SQL database
   [com.mattbertolini/liquibase-slf4j "2.0.0"]                        ; Java Migrations lib logging. We don't actually use this AFAIK (?)
   [com.taoensso/nippy "2.14.0"]                                      ; Fast serialization (i.e., GZIP) library for Clojure
   [commons-codec/commons-codec "1.14"]                               ; Apache Commons -- useful codec util fns
   [commons-io/commons-io "2.6"]                                      ; Apache Commons -- useful IO util fns
   [commons-validator/commons-validator "1.6"                         ; Apache Commons -- useful validation util fns
    :exclusions [commons-beanutils
                 commons-digester
                 commons-logging]]
   [compojure "1.6.1" :exclusions [ring/ring-codec]]                  ; HTTP Routing library built on Ring
   [crypto-random "1.2.0"]                                            ; library for generating cryptographically secure random bytes and strings
   [dk.ative/docjure "1.13.0"]                                        ; Excel export
   [environ "1.2.0"]                                                  ; easy environment management
   [hiccup "1.0.5"]                                                   ; HTML templating
   [honeysql "0.9.5" :exclusions [org.clojure/clojurescript]]         ; Transform Clojure data structures to SQL
   [instaparse "1.4.10"]                                              ; Make your own parser
   [io.forward/yaml "1.0.9"                                           ; Clojure wrapper for YAML library SnakeYAML (which we already use for liquidbase)
    :exclusions [org.clojure/clojure
                 org.flatland/ordered
                 org.yaml/snakeyaml]]
   [javax.xml.bind/jaxb-api "2.4.0-b180830.0359"]                     ; add the `javax.xml.bind` classes which we're still using but were removed in Java 11
   [kixi/stats "0.4.4" :exclusions [org.clojure/data.avl]]            ; Various statistic measures implemented as transducers
   [log4j/log4j "1.2.17"                                              ; logging framework. TODO - consider upgrading to Log4j 2 -- see https://logging.apache.org/log4j/log4j-2.6.1/manual/migration.html
    :exclusions [javax.mail/mail
                 javax.jms/jms
                 com.sun.jdmk/jmxtools
                 com.sun.jmx/jmxri]]
   [medley "1.3.0"]                                                   ; lightweight lib of useful functions
   [metabase/connection-pool "1.1.1"]                                 ; simple wrapper around C3P0. JDBC connection pools
   [metabase/throttle "1.0.2"]                                        ; Tools for throttling access to API endpoints and other code pathways
   [net.sf.cssbox/cssbox "4.12" :exclusions [org.slf4j/slf4j-api]]    ; HTML / CSS rendering
   [org.apache.commons/commons-lang3 "3.10"]                          ; helper methods for working with java.lang stuff
   [org.apache.sshd/sshd-core "2.4.0"]                                ; ssh tunneling and test server
   [org.bouncycastle/bcprov-jdk15on "1.65"]                           ; Bouncy Castle crypto library -- explicit version of BC specified to resolve illegal reflective access errors
   [org.clojars.pntblnk/clj-ldap "0.0.16"]                            ; LDAP client
   [org.eclipse.jetty/jetty-server "9.4.27.v20200227"]                ; We require JDK 8 which allows us to run Jetty 9.4, ring-jetty-adapter runs on 1.7 which forces an older version
   [org.flatland/ordered "1.5.9"]                                     ; ordered maps & sets
   [org.liquibase/liquibase-core "3.6.3"                              ; migration management (Java lib)
    :exclusions [ch.qos.logback/logback-classic]]
   [org.mariadb.jdbc/mariadb-java-client "2.5.1"]                     ; MySQL/MariaDB driver
   [org.postgresql/postgresql "42.2.8"]                               ; Postgres driver
   [org.slf4j/slf4j-api "1.7.30"]                                     ; abstraction for logging frameworks -- allows end user to plug in desired logging framework at deployment time
   [org.slf4j/slf4j-log4j12 "1.7.30"]                                 ; ^^
   [org.tcrawley/dynapath "1.1.0"]                                    ; Dynamically add Jars (e.g. Oracle or Vertica) to classpath
   [org.threeten/threeten-extra "1.5.0"]                               ; extra Java 8 java.time classes like DayOfMonth and Quarter
   [org.yaml/snakeyaml "1.23"]                                        ; YAML parser (required by liquibase)
   [potemkin "0.4.5" :exclusions [riddley]]                           ; utility macros & fns
   [pretty "1.0.4"]                                                   ; protocol for defining how custom types should be pretty printed
   [prismatic/schema "1.1.11"]                                        ; Data schema declaration and validation library
   [redux "0.1.4"]                                                    ; Utility functions for building and composing transducers
   [riddley "0.2.0"]                                                  ; code walking lib -- used interally by Potemkin, manifold, etc.
   [ring/ring-core "1.8.0"]
   [ring/ring-jetty-adapter "1.8.1"]                                  ; Ring adapter using Jetty webserver (used to run a Ring server for unit tests)
   [ring/ring-json "0.5.0"]                                           ; Ring middleware for reading/writing JSON automatically
   [stencil "0.5.0"]                                                  ; Mustache templates for Clojure
   [toucan "1.15.1" :exclusions [org.clojure/java.jdbc                ; Model layer, hydration, and DB utilities
                                 org.clojure/tools.logging
                                 org.clojure/tools.namespace
                                 honeysql]]
   [weavejester/dependency "0.2.1"]                                   ; Dependency graphs and topological sorting
   ]

  :main ^:skip-aot metabase.core

  ;; TODO - WHAT DOES THIS DO?
  :manifest
  {"Liquibase-Package"
   #= (eval
       (str "liquibase.change,liquibase.changelog,liquibase.database,liquibase.parser,liquibase.precondition,"
            "liquibase.datatype,liquibase.serializer,liquibase.sqlgenerator,liquibase.executor,"
            "liquibase.snapshot,liquibase.logging,liquibase.diff,liquibase.structure,"
            "liquibase.structurecompare,liquibase.lockservice,liquibase.sdk,liquibase.ext"))}

  :jvm-opts
  ["-XX:+IgnoreUnrecognizedVMOptions"                                 ; ignore things not recognized for our Java version instead of refusing to start
   "-Xverify:none"                                                    ; disable bytecode verification when running in dev so it starts slightly faster
   "-Djava.awt.headless=true"]                                        ; prevent Java icon from randomly popping up in dock when running `lein ring server`

  :target-path "target/%s"

  :javac-options
  ["-target" "1.8", "-source" "1.8"]

  :source-paths
  ["src" "backend/mbql/src"]

  :java-source-paths
  ["java"]

  :uberjar-name
  "metabase.jar"

  :profiles
  {:dev
   {:source-paths ["dev/src" "local/src"]

    :test-paths ["test" "backend/mbql/test"]

    :dependencies
    [[clj-http-fake "1.0.3" :exclusions [slingshot]]                  ; Library to mock clj-http responses
     [jonase/eastwood "0.3.11" :exclusions [org.clojure/clojure]]     ; to run Eastwood
     [methodical "0.9.4-alpha"]
     [pjstadig/humane-test-output "0.10.0"]
     [ring/ring-mock "0.4.0"]]

    :plugins
    [[lein-environ "1.1.0"]] ; easy access to environment variables

    :injections
    [(require 'pjstadig.humane-test-output)
     (pjstadig.humane-test-output/activate!)
     ;; redefs lives in the `test/` directory; it's only relevant to tests, so if it's not there (e.g. when running
     ;; `lein ring server` or the like) it doesn't matter
     (try (require 'metabase.test.redefs)
          (catch Throwable _))]

    :env
    {:mb-run-mode       "dev"
     :mb-test-setting-1 "ABCDEFG"}

    :jvm-opts
    ["-Dlogfile.path=target/log"]

    :repl-options
    {:init-ns user}} ; starting in the user namespace is a lot faster than metabase.core since it has less deps

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
   {:jvm-opts ["-Xmx2500m"]}

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
      :timeout 60000}}]

   ;; start the dev HTTP server with 'lein ring server'
   :ring
   [:exclude-tests
    :include-all-drivers
    {:dependencies
     ;; used internally by lein ring to track namespace changes. Newer version contains fix by yours truly with 1000x
     ;; faster launch time
     [[ns-tracker "0.4.0"]]

     :plugins
     [[lein-ring "0.12.5" :exclusions [org.clojure/clojure]]]

     :ring
     {:handler      metabase.handler/app
      :init         metabase.core/init!
      :async?       true
      :destroy      metabase.core/destroy
      :reload-paths ["src"]}}]

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
     :mb-api-key      "test-api-key"
     ;; use a random port between 3001 and 3501. That way if you run multiple sets of tests at the same time locally
     ;; they won't stomp on each other
     :mb-jetty-port   #=(eval (str (+ 3001 (rand-int 500))))}

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

   :bikeshed
   [:include-all-drivers
    {:plugins
     [[lein-bikeshed "0.5.2"]]}]

   :eastwood
   [:include-all-drivers
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
      :exclude-linters    [; Turn this off temporarily until we finish removing self-deprecated functions & macros
                           :deprecations
                           ;; this has a fit in libs that use Potemin `import-vars` such as `java-time`
                           :implicit-dependencies
                           ;; too many false positives for now
                           :unused-ret-vals]}}]

   ;; run ./bin/reflection-linter to check for reflection warnings
   :reflection-warnings
   [:include-all-drivers
    {:global-vars {*warn-on-reflection* true}}]

   ;; Check that all public vars have docstrings. Run with 'lein docstring-checker'
   :docstring-checker
   [:include-all-drivers
    {:plugins
     [[docstring-checker "1.1.0"]]

     :docstring-checker
     {:include [#"^metabase"]
      :exclude [#"test"
                #"^metabase\.http-client$"]}}]

   :check-namespace-decls
   [:include-all-drivers
    {:plugins               [[lein-check-namespace-decls "1.0.2"]]
     :source-paths          ^:replace ["src" "backend/mbql/src" "test" "backend/mbql/test"]
     :check-namespace-decls {:prefix-rewriting true}}]

   :cloverage
   [:test-common
    {:dependencies [[cloverage "1.2.0" :exclusions [riddley]]]
     :plugins      [[lein-cloverage  "1.2.0"]]
     :source-paths ^:replace ["src" "backend/mbql/src"]
     :test-paths   ^:replace ["test" "backend/mbql/test"]
     :cloverage    {:fail-threshold 69
                    :exclude-call
                    [;; don't instrument logging forms, since they won't get executed as part of tests anyway
                     ;; log calls expand to these
                     clojure.tools.logging/logf
                     clojure.tools.logging/logp
                     ;; defonce and defmulti forms get instrumented incorrectly and are false negatives
                     ;; -- see https://github.com/cloverage/cloverage/issues/294. Once this issue is
                     ;; fixed we can remove this exception.
                     defonce
                     defmulti]}}]

   ;; build the uberjar with `lein uberjar`
   :uberjar
   {:auto-clean true
    :aot        :all}

   ;; lein strip-and-compress my-plugin.jar [path/to/metabase.jar]
   ;; strips classes from my-plugin.jar that already exist in other JAR and recompresses with higher compression ratio.
   ;; Second arg (other JAR) is optional; defaults to target/uberjar/metabase.jar
   :strip-and-compress
   {:aliases      ^:replace {"run" ["run"]}
    :source-paths ^:replace ["lein-commands/strip-and-compress"]
    :test-paths   ^:replace []
    :main         ^:skip-aot metabase.strip-and-compress-module}

   ;; Profile Metabase start time with `lein profile`
   :profile
   {:jvm-opts ["-XX:+CITime"                                          ; print time spent in JIT compiler
               "-XX:+PrintGC"]} ; print a message when garbage collection takes place

   ;; get the H2 shell with 'lein h2'
   :h2-shell
   {:main org.h2.tools.Shell}

   :generate-automagic-dashboards-pot
   {:main metabase.automagic-dashboards.rules}

   :compare-h2-dbs
   {:aliases      ^:replace  {"run" ["run"]}
    :main         ^:skip-aot metabase.cmd.compare-h2-dbs
    :source-paths ["test"]}})

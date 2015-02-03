(defproject metabase "metabase-0.1.0-SNAPSHOT"
  :description "Metabase Community Edition"
  :url "http://metabase.com/"
  :license {:name "Eclipse Public License"
            :url "http://www.eclipse.org/legal/epl-v10.html"}
  :min-lein-version "2.0.0"
  :dependencies [[org.clojure/clojure "1.6.0"]
                 [expectations "2.0.12"]     ; unit tests
                 [marginalia "0.7.1"]        ; for documentation
                 [environ "0.5.0"]                              ; easy environment management
                 [org.clojure/tools.logging "0.3.1"]            ; logging framework
                 [log4j/log4j "1.2.17" :exclusions [javax.mail/mail
                                                    javax.jms/jms
                                                    com.sun.jdmk/jmxtools
                                                    com.sun.jmx/jmxri]]
                 [korma "0.4.0"]                                ; SQL lib
                 ]
  :plugins [[cider/cider-nrepl "0.8.2"]      ; Interactive development w/ cider NREPL in Emacs
            [lein-environ "0.5.0"]           ; easy access to environment variables
            [lein-expectations "0.0.7"]      ; run unit tests with 'lein expectations'
            [lein-midje "3.1.3"]             ; another unit testing option
            [lein-marginalia "0.7.0"]        ; generate documentation with 'lein marg'
            ]
  :main ^:skip-aot metabase.core
  :target-path "target/%s"
  :profiles {:dev {:dependencies [[midje "1.6.3"]]
                   :jvm-opts ["-Dlogfile.path=target/log"]}
             :uberjar {:aot :all}})

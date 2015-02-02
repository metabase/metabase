(defproject metabase-init "0.1.0-SNAPSHOT"
  :description "FIXME: write description"
  :url "http://example.com/FIXME"
  :license {:name "Eclipse Public License"
            :url "http://www.eclipse.org/legal/epl-v10.html"}
  :min-lein-version "2.0.0"
  :dependencies [[org.clojure/clojure "1.6.0"]
                 [expectations "2.0.12"]     ; unit tests
                 [marginalia "0.7.1"]        ; for documentation
                 ]
  :plugins [[cider/cider-nrepl "0.8.2"]      ; Interactive development w/ cider NREPL in Emacs
            [lein-expectations "0.0.7"]      ; run unit tests with 'lein expectations'
            [lein-marginalia "0.7.0"]        ; generate documentation with 'lein marg'
            ]
  :main ^:skip-aot metabase-init.core
  :target-path "target/%s"
  :profiles {:uberjar {:aot :all}})

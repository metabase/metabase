(defproject metabase/lein-include-drivers "1.0.9"
  :min-lein-version "2.5.0"
  :eval-in-leiningen true
  :deploy-repositories [["clojars" {:sign-releases false}]]
  :dependencies [[colorize "0.1.1" :exclusions [org.clojure/clojure]]])

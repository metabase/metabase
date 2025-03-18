(ns mage.stats-repl
  (:require
   [babashka.http-client :as http]
   [cheshire.core :as json]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u]))

(defn version-check []
  (let [ours (u/sh "git rev-parse HEAD")
        theirs (-> (http/get "https://stats.metabase.com/api/session/properties")
                   :body
                   (json/parse-string true)
                   :version
                   :hash)]
    (if (str/starts-with? ours theirs)
      (println (c/green "You're on the same metabase version as stats."))
      (do
        (println (c/yellow "\n******************** WARNING ********************"))
        (println (c/yellow "You're on a different metabase version than stats.\n"))
        (println (str "    Your version:  " ours))
        (println (str "    Stats version: " theirs "\n"))
        (println "It is important to be on the same version as stats, because then your local codebase")
        (println "will match the codebase that is running on stats, and you can be sure that you're")
        (println "looking at the same code that is currently running up there.\n")
        (println (str "Checkout the same version as stats with: \n"))
        (println (str "git checkout " theirs "\n"))
        (System/exit 0)))))

(defn ikwid-check []
  (if (u/env "MAGE_IKWID" (constantly nil))
    (println (c/green "You know what you're doing."))
    (do
      (println "Make sure you know what you're doing!")
      (println "Any code you change will be running in stats.")
      (println "We reccomend you do read-only type of operations, and if you setup some kind of")
      (println "instrumentation, make sure you take it out before you close the repl session.")
      (println)
      (println "If you're a little unsure, please read more about Socket REPLs before proceeeding:")
      (println "https://lambdaisland.com/guides/clojure-repls/clojure-repls#org259d775")
      (println "export MAGE_IKWID=y in your environment to acknowledge that you know what you're doing."))))

(defn connect [_]
  (println "Doing some checks to make sure you're good to connect...")
  (version-check)
  (ikwid-check)
  (println (c/blue "Make sure you're connected to the metabase tailscale, and run the socket repl with:"))
  (println)
  (println "rlwrap nc repl.staging.metabase.com 32500")
  (println)
  (println "Known issues:")
  (println "  If the connection over nc is hanging and not connecting within a second or so,")
  (println "  then we need to 'hit start' on the stats' store page. Contact @Filipe"))

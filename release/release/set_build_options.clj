(ns release.set-build-options
  (:require [clojure.string :as str]
            [release.common :as c]))

(defn prompt-and-set-build-options! []
  (let [[current-branch] (c/step "Determine current branch"
                           (c/sh "git" "symbolic-ref" "--short" "HEAD"))]
    (loop []
      (let [version (c/read-line-with-prompt "What version are we building (e.g. 0.36.0)?")
            branch  (c/read-line-with-prompt "What branch are we building from?" :default current-branch)
            edition (c/read-line-with-prompt "Is this a [C]ommunity Edition release or an [E]nterprise Edition release? (type C or E)"
                                             :validator (fn [line]
                                                          (when-not (#{"c" "e"} (str/lower-case line))
                                                            "Please enter 'C' or 'E'")))
            edition (case (str/lower-case edition)
                      "c" :ce
                      "e" :ee)
            y-or-n  (c/read-line-with-prompt (format "Building %s version %s from branch %s. Is this correct? [y/n]"
                                                     (pr-str edition) (pr-str version) (pr-str branch))
                                             :validator (fn [line]
                                                          (when-not (#{"y" "n"} (str/lower-case line))
                                                            "Please type 'y' or 'n'")))]
        (if (= y-or-n "n")
            (do
              (println "Please enter new build options, or press Ctrl-C to quit.")
              (recur))
            (do
              (c/set-version! version)
              (c/set-branch! branch)
              (c/set-edition! edition)))))))

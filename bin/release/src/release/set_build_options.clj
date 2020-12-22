(ns release.set-build-options
  (:require [metabuild-common.core :as u]
            [release.common :as c]))

(defn prompt-and-set-build-options! []
  (let [[current-branch] (u/step "Determine current branch"
                           (u/sh "git" "symbolic-ref" "--short" "HEAD"))]
    (loop []
      (let [version (u/read-line-with-prompt "What version are we building (e.g. 0.36.0)?")
            branch  current-branch
            edition (case (first version)
                      \0 :ce
                      \1 :ee)]
        (if-not (u/yes-or-no-prompt (format "Building %s version %s from branch %s. Is this correct?"
                                            (pr-str edition) (pr-str version) (pr-str branch)))
          (do
            (println "Please enter new build options, or press Ctrl-C to quit.")
            (recur))
          (do
            (c/set-version! version)
            (c/set-branch! branch)
            (c/set-edition! edition)))))))

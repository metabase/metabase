(ns metabuild-common.input
  (:require [clojure.string :as str]
            [environ.core :as env]
            [metabuild-common.output :as out]))

(defn interactive?
  "Whether we're running these scripts interactively, and can prompt the user for input. By default, this is
  true (except when running in CircleCI), but if the env var `INTERACTIVE=false` is set, these scripts will not prompt
  for input. Be sure to set this when running scripts in CI or other places that automate them."
  []
  (if-let [env-var (env/env :interactive)]
    (Boolean/parseBoolean env-var)
    (not (:circleci env/env))))

(defn read-line-with-prompt
  "Prompt for and read a value from stdin. Accepts two options: `:default`, which is the default value to use if the
  user does not enter something else; and `:validator`, a one-arg function that should return an error message if the
  value is invalid, or `nil` if it is valid."
  [prompt & {:keys [default validator]}]
  (if-not (interactive?)
    (or default
        (throw (ex-info "Cannot prompt for a value when script is ran non-interactively; specify a :default value.")))
    (loop []
      (print (str prompt " "))
      (when default
        (printf "(default %s) " (pr-str default)))
      (flush)
      (let [line (or (not-empty (str/trim (read-line)))
                     default)]
        (newline)
        (flush)
        (cond
          (empty? line)
          (recur)

          validator
          (let [error (validator line)]
            (if error
              (do
                (println error)
                (recur))
              line))

          :else
          line)))))

(defn letter-options-prompt
  "Prompt user to enter a letter from amongst `letters`; prompt will repeat until a valid option is chosen. Returns
  chosen letter as lower-cased keyword.

    (letter-options-prompt \"Is this a [C]ommunity Edition release or an [E]nterprise Edition release?\"
                           [:c :e])
    ;-> :c"
  [prompt letters & options]
  (let [letter-strs (map #(str/upper-case (if (keyword? %)
                                            (name %)
                                            (str %)))
                         letters)
        letter      (apply
                     read-line-with-prompt
                     (format "%s [%s]" prompt (str/join "/" letter-strs))
                     :validator (fn [line]
                                  (when-not (contains? (set letter-strs) (str/trim (str/upper-case line)))
                                    (format "Please enter %s" (str/join " or " (map pr-str letter-strs)))))
                     options)]
    (out/safe-println (str/trim letter))
    (keyword (str/trim (str/lower-case letter)))))

(defn yes-or-no-prompt
  "Prompt user to type `Y` or `N`; prompt will repeat until one of those two letters is typed. Returns `true` or `false`
  based on user input."
  [prompt & options]
  (case (apply letter-options-prompt prompt [:y :n] options)
    :y true
    :n false))

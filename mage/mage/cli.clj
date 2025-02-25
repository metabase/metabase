(ns mage.cli
  (:require
   [clojure.string :as str]
   [clojure.tools.cli :refer [parse-opts]]
   [mage.color :as c]
   [mage.util :as u]
   [table.core :as t]))

(set! *warn-on-reflection* true)

(defn tbl
  "Prints a table in unicode 3d style."
  [x]
  (t/table x
           :fields [:short :long :msg :default :options :id :prompt]
           :style :github-markdown))

(defn- ->cli-tools-option [{:keys [msg short long id default parse-fn update-fn validate] :as _opt}]
  (vec (concat [short long msg]
               (when id [:id id])
               (when default [:default default])
               (when parse-fn [:parse-fn parse-fn])
               (when update-fn [:update-fn update-fn])
               (when validate [:validate validate]))))

(defn- check-print-help [current-task options args]
  (when (or (get (set args) "-h")
            (get (set args) "--help"))
    (println (c/green (str "  " (:doc current-task))))
    (doseq [opt options]
      (println (c/cyan " " (:short opt) " " (:long opt) " " (:msg opt)
                       (when-let [more (-> opt (dissoc :id :short :long :msg :parse-fn) not-empty)]
                         (c/uncolor "| "  more)))))
    (when-let [examples (:examples current-task)]
      (println "\n\nExamples:")
      (doseq [[cmd effect] examples]
        (println "\n" cmd "\n -" (c/magenta effect))))
    (System/exit 0)))

(defn- try-eval [maybe-code-str]
  (try #_:clj-kondo/ignore
   (eval maybe-code-str)
       (catch Exception _ ::nope)))

(defn- ->ask [{:keys [id title prompt choices] :as _option}]
  {:id id
   :msg title
   :type prompt
   :choices (cond
              (delay? choices) @choices
              (not= ::nope (try-eval choices)) (try-eval choices)
              :else choices)})

(defn- ask-unknown! [cli-options all-options]
  (let [answered-ids (set (keys cli-options))
        unanswered (remove #(or (nil? (:prompt %)) (answered-ids (:id %))) all-options)
        to-ask (mapv ->ask unanswered)]
    (u/debug "to-ask:" to-ask)
    (if (empty? to-ask)
      cli-options
      (throw (ex-info (str "Missing cli args:\n"
                           (pr-str to-ask))
                      {})))))

(defn- menu-cli
  "Gets required cli options through a menu when not provided by users."
  [current-task opts args]
  (check-print-help current-task opts args)
  (let [options (mapv ->cli-tools-option opts)
        _ (u/debug "options:" options)
        {:keys [error summary arguments] parsed-opts :options} (try (parse-opts args options)
                                                                    (catch Throwable _t {:error "parse-opts threw."}))
        _ (when error (println "WARNING:" "args, " args  "options," options " | " error "|" summary))
        required-opts (filter :required opts)
        missing-opts (remove (fn [req-opt] (contains? parsed-opts (:id req-opt))) required-opts)
        missing-and-unaskable (remove #(-> % :options seq) missing-opts)
        missing-and-askable (filter #(-> % :options seq) missing-opts)
        _ (when (seq missing-and-unaskable)
            (println (c/red "Missing required option(s):"))
            (tbl options)
            (System/exit 1))
        asked-opts (into {} (for [hybrid-option missing-and-askable]
                              (println "todo: ask (menu-ask hybrid-option)" (pr-str hybrid-option))))
        cli (assoc (merge parsed-opts asked-opts) :args arguments)
        out (ask-unknown! cli opts)]
    ;; (println out)
    out))

(defn- add-parsing-for-multi [option]
  (if (= :multi (:prompt option))
    (assoc option :parse-fn #(str/split % #","))
    option))

(defn menu!
  "Options have keys that map to clojure.tools.cli options via [[->cli-tools-option]].

  Custom keys are:

  :prompt one of :text :number :select :multi
  When missing a :prompt key, we will not ask this quesion on the cli menu.
  So if it is required, it must be passed via cli flags.

  :choices - a string seq, or a delay that references a string seq.

  n.b. - a handy trick for debugging this is to add a bb task like:

  x (prn (menu! (current-task)
         {:id :fav-foods
          :short \"-p\"
          :long \"--port PORT\"
          :prompt :multi
          :choices [\"apple\" \"banana\" \"egg salad\" \"green onions\" \"mango\"]}))

  and call it via running `bb x` in your terminal.


 - to pass values into a :multi :prompt from the cli, seperate them with commas, like so:
   bb mytask --multi a,b,c

  "
  [current-task]
  (menu-cli current-task
            (map add-parsing-for-multi (:options current-task))
            *command-line-args*))

(ns metabase-enterprise.data-sensitivity.core
  "Shared parts of the LLM metadata generation runner and review: the Metabot pre-flight [[unavailable-reason]], the
  per-field diff [[diff-field]], the connection pre-flight [[sample-connection-error]], and [[bad-request]]. The
  Metabot group permissions are bypassed for the LLM call because only a superuser may start a run; the instance
  gates (Metabot enabled, provider configured, usage limits) still apply and are reported by [[unavailable-reason]]."
  (:require
   [metabase-enterprise.data-sensitivity.context :as context]
   [metabase-enterprise.data-sensitivity.llm :as llm]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.util :as driver.u]
   [metabase.metabot.core :as metabot]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn bad-request
  "An exception for a 400 response with `message`."
  [message]
  (ex-info message {:status-code 400}))

(def required-permission
  "The Metabot permission the structured call declares. Granted by the all-yes binding, so it only labels the call;
  the API limits callers to superusers instead."
  :permission/metabot-other-tools)

;;; Schemas

(mr/def ::field-result
  [:map
   [:field_id          pos-int?]
   [:name              :string]
   [:display_name      [:maybe :string]]
   [:base_type         :keyword]
   [:current           [:map
                        [:data_sensitivity [:maybe :keyword]]
                        [:human_set       :boolean]
                        [:state            [:enum :human :classifier :unscanned]]
                        [:semantic_type    [:maybe :keyword]]]]
   [:proposed          [:map
                        [:data_sensitivity [:maybe :keyword]]
                        [:confidence       [:maybe :string]]
                        [:semantic_type    [:maybe :keyword]]
                        [:reasoning        [:maybe :string]]]]
   [:status            [:enum :agree :disagree :new :abstain :dropped]]
   [:semantic_changed :boolean]])

;;; Pre-flight

(defn unavailable-reason
  "Why an LLM classification cannot run right now, or nil when it can: `:metabot-disabled`, `:no-llm`, or
  `:usage-limit`. Evaluated under the all-yes permission binding, so `:permission-denied` is not a possible answer."
  []
  (metabot/do-with-all-metabot-permissions
   #(metabot/llm-call-unavailable-reason required-permission)))

;;; Diff

(def ^:private dropped-entry
  {:data-sensitivity nil :confidence nil :semantic-type nil :reasoning nil :status :dropped})

(mu/defn diff-field :- ::field-result
  "Join one packet field to its parsed model entry. `:status` is `:abstain` or `:dropped` when the parse said so,
  `:new` when the field has no current label, `:agree` when the proposal equals the current label, otherwise
  `:disagree`. `:state` says where the current label came from so a nil reads as unscanned rather than blank.
  `[:proposed :semantic_type]` is the effective type: the model's proposal when it made one, else the current type,
  so nil means the field has none and none was proposed; `:semantic_changed` says whether they differ."
  [{:keys [id name display_name base_type semantic_type current]} :- ::context/field
   entry                                                          :- [:maybe ::llm/entry]]
  (let [{:keys [status] :as entry} (or entry dropped-entry)
        current-label  (:data_sensitivity current)
        human-set?     (:human_set current)
        proposed-label (:data-sensitivity entry)
        proposed-st    (:semantic-type entry)
        effective-st   (or proposed-st semantic_type)]
    {:field_id          id
     :name              name
     :display_name      display_name
     :base_type         base_type
     :current           {:data_sensitivity current-label
                         :human_set       human-set?
                         :state            (cond
                                             human-set?            :human
                                             (some? current-label) :classifier
                                             :else                 :unscanned)
                         :semantic_type    semantic_type}
     :proposed          {:data_sensitivity proposed-label
                         :confidence       (:confidence entry)
                         :semantic_type    effective-st
                         :reasoning        (:reasoning entry)}
     :status            (case status
                          :abstain :abstain
                          :dropped :dropped
                          :labeled (cond
                                     (nil? current-label)               :new
                                     (= proposed-label current-label)   :agree
                                     :else                              :disagree))
     :semantic_changed (boolean (and proposed-st (not= proposed-st semantic_type)))}))

;;; Connection pre-flight

(defn- connection-error
  "The message of a failed connection test against `database`, or nil when it connects. Existing H2 and SQLite
  databases may be tested, as sync does. An interrupt during the test is not a connection error: it sets the interrupt
  flag again and throws an `InterruptedException`."
  [{:keys [engine details]}]
  (binding [driver.settings/*allow-testing-h2-connections*     true
            driver.settings/*allow-testing-sqlite-connections* true]
    (try
      (driver.u/can-connect-with-details? engine details :throw-exceptions)
      nil
      (catch Throwable e
        (when (or (context/interrupted? e) (.isInterrupted (Thread/currentThread)))
          (.interrupt (Thread/currentThread))
          (throw (doto (InterruptedException. "Data-sensitivity connection test interrupted")
                   (.initCause e))))
        (or (ex-message e) (str (class e)))))))

(defn sample-connection-error
  "When `opts` ask for values and `database` cannot connect, the connection error; otherwise nil. Tested once per run
  so a dead database costs one connection timeout rather than one per table."
  [database opts]
  (when (:include-values? (context/with-defaults opts))
    (when-let [error (connection-error database)]
      (log/warnf "Database %d cannot connect, classifying on metadata alone: %s" (:id database) error)
      error)))

(defn assert-unique-names!
  "Throw when two packet fields share a name. The model keys its entries by name, so a duplicate would join one
  entry to two fields."
  [table fields]
  (when-let [dupes (seq (for [[field-name n] (frequencies (map :name fields)) :when (> n 1)] field-name))]
    (throw (ex-info (format "Table %d has fields with duplicate names: %s" (:id table) (pr-str (sort dupes)))
                    {:table-id (:id table) :duplicate-names (vec (sort dupes))}))))

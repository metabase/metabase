(ns metabase.metabot.tools.skills
  "The `load_skill` tool: loads the full body of one or more skills on demand.

  Skill bodies are returned as the tool result (i.e. into the message stream,
  below the system cache breakpoint) so the cached system prefix stays stable as
  skills are loaded."
  (:require
   [clojure.string :as str]
   [metabase.metabot.skills :as skills]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- load-one
  "Resolve and format a single skill id, or an inline message when it is unknown
  or not available to the current user."
  [id]
  (let [skill (skills/get-skill-by-id-string id)]
    (cond
      (nil? skill)
      (do (log/info "Unknown skill requested by load_skill" {:id id})
          (format "Unknown skill: \"%s\". Load only ids listed under \"Available skills\"." id))

      (not (skills/skill-loadable? skill))
      (do (log/info "Skill not available to current request" {:id id})
          (format "Skill \"%s\" is not available to you." id))

      :else
      (format "<skill id=\"%s\">\n%s\n</skill>" (name (:id skill)) (:body skill)))))

(mu/defn ^{:tool-name "load_skill"}
  load-skill-tool
  "Load the full instructions for one or more skills listed under \"Available
  skills\". Call this immediately before doing the related work; you may load
  several skills at once. Load only what is relevant to the current task."
  [{:keys [ids]} :- [:map {:closed true}
                     [:ids [:sequential
                            [:string {:description "A skill id, e.g. construct-notebook-query-core"}]]]]]
  (try
    {:output (str/join "\n\n" (map load-one ids))}
    (catch Exception e
      (log/error e "Failed to load skill(s)" {:ids ids})
      {:output (str "Failed to load skill(s): " (or (ex-message e) "Unknown error"))})))

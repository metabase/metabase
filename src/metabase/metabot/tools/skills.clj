(ns metabase.metabot.tools.skills
  "The `load_skill` tool: loads the full body of one or more skills on demand.

  Skill bodies are returned as the tool result (i.e. into the message stream,
  below the system cache breakpoint) so the cached system prefix stays stable as
  skills are loaded."
  (:require
   [clojure.string :as str]
   [metabase.metabot.skills :as skills]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private max-echoed-id-chars
  "The failure repeats at most this many characters of the requested ID, which the model supplies."
  100)

(defn- loadable-skill-ids
  "The IDs of the skills the current request may load, sorted."
  []
  (->> (skills/all-skills)
       (filter skills/skill-loadable?)
       (map (comp name :id))
       sort
       vec))

(tools/defrecoverable unknown-skill!
  "No skill has the requested ID, or the current request may not load it."
  {:payload [:map {:closed true}
             [:id       :string]
             [:loadable [:sequential :string]]]}
  [{:keys [id loadable]}]
  ;; A missing skill and a hidden one get the same sentence, so the reply reveals nothing about hidden skills
  {:message  (str "No skill with ID " (pr-str (llm-shape/truncate id max-echoed-id-chars)) " can be loaded here. "
                  (if (seq loadable)
                    (str "Skill IDs you can load: " (str/join ", " loadable) ".")
                    "No skills can be loaded here."))
   :recovery []})

(def ^:private skill-id-schema
  [:string {:description "A skill id, e.g. construct-notebook-query-core"}])

(defrecord LoadSkillTool []
  tools/Tool
  (declaration [_]
    {:name        "load_skill"
     :description (str "Load the full instructions for a skill listed under \"Available skills\". Call this "
                       "immediately before doing the related work. Load only what is relevant to the current task.")
     :args        [:map {:closed true} [:id skill-id-schema]]})

  (handle [_ {:keys [id]} _ctx]
    (let [skill (skills/get-skill-by-id-string id)]
      (when-not (some-> skill skills/skill-loadable?)
        (if skill
          (log/info "Skill not available to current request" {:id id})
          (log/info "Unknown skill requested by load_skill"))
        (unknown-skill! {:id id :loadable (loadable-skill-ids)}))
      {:output (format "<skill id=\"%s\">\n%s\n</skill>" (name (:id skill)) (:body skill))}))

  tools/BatchedTool
  (batched-declaration [_ declared]
    (assoc declared
           :description (str "Load the full instructions for one or more skills listed under \"Available "
                             "skills\". Call this immediately before doing the related work; you may load several "
                             "skills at once. Load only what is relevant to the current task.")
           ;; The dialect preload's synthetic call sends `ids` too (`skills/dialect-preload-parts`)
           :args [:map {:closed true}
                  [:ids [:sequential {:min 1 :error/message "must be an array of at least one skill id"}
                         skill-id-schema]]]))

  (batched-args [_ {:keys [ids]}]
    (mapv (fn [id] {:id id}) ids))

  (compose [_ entries _ctx]
    {:output (str/join "\n\n" (map :output entries))}))

(def load-skill-tool
  "`load_skill`: one skill through [[tools/handle]], several through [[tools/run-batched]]."
  (->LoadSkillTool))

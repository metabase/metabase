(ns metabase-enterprise.metabot-v3.config)

(def internal-metabot-id
  "The ID of the internal Metabot instance."
  "b5716059-ad40-4d83-a4e1-673af020b2d8")

(def embedded-metabot-id
  "The ID of the embedded Metabot instance."
  "c61bf5f5-1025-47b6-9298-bf1827105bb6")

(def metabot-config
  "The name of the collection exposed by the answer-sources tool."
  {internal-metabot-id {:profile-id "experimental"
                        :collection-name "__METABOT__"}
   embedded-metabot-id {:profile-id "default"
                        :collection-name "__METABOT_EMBEDDING__"}})

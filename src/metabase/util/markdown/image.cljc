(ns metabase.util.markdown.image
  "Markdown image handling shared between the backend notification renderer and the app's markdown
  renderer (compiled to JS via the shadow-cljs :app build), so both accept the same inline images.")

(def ^:export data-image-uri-pattern
  "Inline base64 image URIs markdown may embed directly, in addition to regular http(s) images."
  #"(?i)^data:image/(?:png|jpeg|jpg|gif|svg\+xml|webp);base64,")

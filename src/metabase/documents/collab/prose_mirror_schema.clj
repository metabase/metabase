(ns metabase.documents.collab.prose-mirror-schema
  "JVM ProseMirror `Schema` matching Metabase's TipTap editor config.

   Consumed by yprosemirror's typed `YCrdtConverter` / `ProseMirrorConverter`
   to validate and round-trip documents between YDoc XML fragments and
   ProseMirror JSON with typed attrs (integer `heading.level`, integer
   `cardEmbed.id`, etc.).

   Every node in this schema must match what the Metabase frontend's
   TipTap editor produces. If the frontend adds a new extension, add a
   corresponding entry here or documents using it will fail schema
   validation on load. See
   `frontend/src/metabase/documents/components/Editor/Editor.tsx` for the
   authoritative extension list."
  (:import
   (com.atlassian.prosemirror.model Schema SchemaSpec)
   (com.atlassian.prosemirror.testbuilder AttributeSpecImpl MarkSpecImpl NodeSpecImpl)))

(set! *warn-on-reflection* true)

(defn- attr ^AttributeSpecImpl [default]
  ;; 2-arg ctor: (Object default, String validateString) — sets hasDefault=true,
  ;; no validator. Pass nil for validateString rather than "" for clarity.
  (AttributeSpecImpl. default nil))

(defn- attrs-map [attrs]
  (when (seq attrs)
    (into {} (map (fn [[k default]] [(name k) (attr default)])) attrs)))

(defn- node-spec
  "Construct a `NodeSpecImpl` via its 20-arg constructor (Kotlin data-class).
   Only the handful of fields we care about are keyword args; everything else
   defaults to nil or sensible booleans."
  ^NodeSpecImpl [& {:keys [content marks group inline atom code attrs
                           selectable draggable defining isolating]
                    :or   {inline false, atom false, code false
                           selectable true, draggable false}}]
  (NodeSpecImpl. content                       ; content: String
                 marks                         ; marks: String
                 group                         ; group: String
                 (boolean inline)              ; inline: boolean
                 (boolean atom)                ; atom: boolean
                 (attrs-map attrs)             ; attrs: Map<String,AttributeSpec>
                 (boolean selectable)          ; selectable: boolean
                 (boolean draggable)           ; draggable: boolean
                 (boolean code)                ; code: boolean
                 nil                           ; whitespace
                 nil                           ; definingAsContext
                 nil                           ; definingForContent
                 defining                      ; defining: Boolean
                 isolating                     ; isolating: Boolean
                 nil                           ; toDebugString
                 nil                           ; leafText
                 nil                           ; toDOM
                 nil                           ; parseDOM
                 nil                           ; autoFocusable
                 nil))                         ; linebreakReplacement

(defn- mark-spec
  ^MarkSpecImpl [& {:keys [attrs inclusive excludes group spanning]}]
  (MarkSpecImpl. (attrs-map attrs)
                 inclusive
                 excludes
                 group
                 spanning
                 nil                           ; toDOM
                 nil))                         ; parseDOM

(defn- build-tiptap-schema ^Schema []
  (let [nodes {"doc"            (node-spec :content "block+")

               ;; StarterKit (via CustomStarterKit): every custom Metabase
               ;; node adds `_id` for block-level comment targeting.
               "paragraph"      (node-spec :content "inline*" :group "block"
                                           :attrs {:_id nil})
               "heading"        (node-spec :content "inline*" :group "block"
                                           :attrs {:level 1, :_id nil})
               "blockquote"     (node-spec :content "block+" :group "block"
                                           :attrs {:_id nil})
               "codeBlock"      (node-spec :content "text*" :group "block"
                                           :code true :attrs {:language nil, :_id nil})
               "bulletList"     (node-spec :content "listItem+" :group "block"
                                           :attrs {:_id nil})
               "orderedList"    (node-spec :content "listItem+" :group "block"
                                           :attrs {:start 1, :type nil, :_id nil})
               "listItem"       (node-spec :content "paragraph (paragraph | bulletList | orderedList)*")
               "hardBreak"      (node-spec :group "inline" :inline true :atom true)
               "horizontalRule" (node-spec :group "block" :atom true)
               "text"           (node-spec :group "inline" :inline true)

               ;; Metabase custom nodes.
               "cardEmbed"      (node-spec :group "block" :atom true :draggable true
                                           :attrs {:id nil, :name nil, :_id nil})
               "flexContainer"  (node-spec :content "(supportingText|cardEmbed){1,3}"
                                           :group "block" :defining true :selectable false
                                           :attrs {:columnWidths nil})
               "supportingText" (node-spec :content "(paragraph|heading|bulletList|orderedList|blockquote|codeBlock)+"
                                           :group "block" :isolating true :draggable true
                                           :attrs {:_id nil})
               "resizeNode"     (node-spec :content "(flexContainer|cardEmbed)"
                                           :group "block" :selectable false
                                           :attrs {:height 442, :minHeight 280})
               "smartLink"      (node-spec :group "inline" :inline true :atom true
                                           :attrs {:entityId nil, :model nil, :label nil, :href "/"})
               "metabot"        (node-spec :content "inline*" :group "block"
                                           :code true :marks "" :draggable true)

               ;; @tiptap/extension-image
               "image"          (node-spec :group "block" :atom true
                                           :attrs {:src "", :alt "", :title ""})}

        marks {"bold"   (mark-spec)
               "italic" (mark-spec)
               "strike" (mark-spec)
               "code"   (mark-spec)
               "link"   (mark-spec :inclusive false
                                   :attrs {:href "", :title nil})}]
    (Schema. (SchemaSpec. nodes marks "doc" "" "" ""))))

(def tiptap-schema
  "Cached `Schema` for TipTap compatibility. Initialized on first deref;
   thread-safe via `delay`."
  (delay (build-tiptap-schema)))

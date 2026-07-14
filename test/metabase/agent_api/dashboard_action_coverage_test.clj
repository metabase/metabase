(ns metabase.agent-api.dashboard-action-coverage-test
  "The completeness oracle for `dashboard_write`.

   A tool that covers a product surface has no way of knowing what it is missing: nothing fails when the editor
   grows a gesture the tool cannot express, and the gap is discovered by a user who asked for it. So the oracle is
   the editor itself. `frontend/src/metabase/dashboard/actions/` is the canonical enumeration of every edit a
   person can make to a dashboard, and [[coverage]] pairs each one with the op that performs it or with the reason
   it is out of scope.

   **This test fails when a new action creator appears in that directory and nobody has said what it maps to.** It
   fails, equally, when a mapping outlives the action it mapped — a coverage map that still claims a gesture the
   editor dropped is a coverage map nobody is reading. Adding the name to [[coverage]] is the work: deciding
   whether the tool can already do it, needs an op, or should not do it at all."
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.agent-api.dashboard-write :as dashboard-write]))

(set! *warn-on-reflection* true)

(def ^:private actions-dir
  "frontend/src/metabase/dashboard/actions")

(def ^:private coverage
  "Every export of the dashboard editor's action layer, and what `dashboard_write` does about it.

   A vector of ops means the gesture is expressible: those ops perform it. A keyword means it is deliberately not
   an op, and says why:

   - `:ephemeral` — client-side UI state (a sidebar, a selection, a toast, an undo). Nothing is persisted, so
     there is nothing for a tool to write.
   - `:fetching` — loading and caching card data. A tool's reads are its own.
   - `:not-an-action` — an exported helper, type, reducer, or test hook, not an action creator.
   - `:internal-primitive` — the low-level reducer action a persisted gesture dispatches through. The gesture it
     serves is covered; the primitive is not a gesture.
   - `:the-save` — the save itself, which is what the op compiler produces. Covering it is what this tool *is*.
   - `:dashboard-field` — a field of the dashboard rather than of its layout, written by a named argument of the
     tool rather than by an op.
   - `:another-tool` — a capability with a home elsewhere in the catalog, named in the comment beside it.
   - `:out-of-scope` — deliberately not exposed, with the reason beside it."
  {;; core.ts — the primitives every persisted edit dispatches through
   "core.ts/setEditingDashboard"                        :ephemeral
   "core.ts/cancelEditingDashboard"                     :ephemeral
   "core.ts/setDashboardAttributes"                     :dashboard-field
   "core.ts/setDashCardAttributes"                      ["move" "resize" "set_series" "patch_dashcard"]
   "core.ts/setMultipleDashCardAttributes"              ["move" "resize" "set_series" "patch_dashcard"]
   "core.ts/onUpdateDashCardVisualizationSettings"      ["patch_dashcard"]
   "core.ts/onUpdateDashCardColumnSettings"             ["patch_dashcard"]
   "core.ts/onReplaceAllDashCardVisualizationSettings"  ["patch_dashcard"]

   ;; cards-typed.ts — the cards
   "cards-typed.ts/markNewCardSeen"                     :ephemeral
   "cards-typed.ts/addCardToDash"                       :internal-primitive
   "cards-typed.ts/addManyCardsToDash"                  :internal-primitive
   "cards-typed.ts/addDashCardToDashboard"              ["add_card" "add_text" "add_heading" "add_link"
                                                         "add_iframe" "add_action"]
   "cards-typed.ts/addCardToDashboard"                  ["add_card"]
   "cards-typed.ts/addHeadingDashCardToDashboard"       ["add_heading"]
   "cards-typed.ts/addMarkdownDashCardToDashboard"      ["add_text"]
   "cards-typed.ts/addIFrameDashCardToDashboard"        ["add_iframe"]
   "cards-typed.ts/addLinkDashCardToDashboard"          ["add_link"]
   "cards-typed.ts/replaceCard"                         ["replace_card"]
   "cards-typed.ts/addCardWithVisualization"            ["add_card" "patch_dashcard"]
   "cards-typed.ts/replaceCardWithVisualization"        ["replace_card" "patch_dashcard"]
   "cards-typed.ts/duplicateCard"                       ["duplicate_card"]
   "cards-typed.ts/removeCardFromDashboard"             ["remove"]
   "cards-typed.ts/undoRemoveCardFromDashboard"         :ephemeral
   ;; The editor's "move to trash" archives the card and takes it off the dashboard. Trashing a card is
   ;; `question_write` with `archived: true`; taking it off the dashboard is `remove`.
   "cards-typed.ts/trashDashboardQuestion"              :another-tool
   ;; A section is a client-side template — several dashcards in a canned arrangement. The ops that place them
   ;; are covered; the template is a menu item, not a capability.
   "cards-typed.ts/addSectionToDashboard"               :out-of-scope

   ;; cards.ts
   "cards.ts/addActionToDashboard"                      ["add_action"]

   ;; tabs.ts
   "tabs.ts/createNewTab"                               ["add_tab"]
   "tabs.ts/duplicateTab"                               ["duplicate_tab"]
   "tabs.ts/deleteTab"                                  ["remove_tab"]
   "tabs.ts/undoDeleteTab"                              :ephemeral
   "tabs.ts/renameTab"                                  ["rename_tab"]
   "tabs.ts/moveTab"                                    ["move_tab"]
   "tabs.ts/moveDashCardToTab"                          ["move"]
   "tabs.ts/undoMoveDashCardToTab"                      :ephemeral
   "tabs.ts/initTabs"                                   :ephemeral
   "tabs.ts/resetTempTabId"                             :not-an-action
   "tabs.ts/getPrevDashAndTabs"                         :not-an-action
   "tabs.ts/getDefaultTab"                              :not-an-action
   "tabs.ts/getIdFromSlug"                              :not-an-action
   "tabs.ts/tabsReducer"                                :not-an-action

   ;; parameters.tsx — the filters
   "parameters.tsx/addParameter"                        ["add_parameter"]
   "parameters.tsx/removeParameter"                     ["remove_parameter"]
   "parameters.tsx/removeParameterAndReferences"        ["remove_parameter"]
   "parameters.tsx/moveParameter"                       ["move_parameter"]
   "parameters.tsx/setParameterIndex"                   ["move_parameter"]
   "parameters.tsx/setParameterMapping"                 ["wire_parameter"]
   "parameters.tsx/resetParameterMapping"               ["unwire_parameter"]
   ;; The editor drops a text card's mappings when the `{{tag}}` they filled in is edited out of its text. The op
   ;; that edits the text is the op that drops them.
   "parameters.tsx/updateParameterMappingsForDashcardText" ["patch_dashcard"]
   ;; Every property of a filter is a field of one object — the sidebar's ten controls all write to it — so one op
   ;; sets all of them.
   "parameters.tsx/setParameterName"                    ["update_parameter"]
   "parameters.tsx/setParameterType"                    ["update_parameter"]
   "parameters.tsx/setParameterDefaultValue"            ["update_parameter"]
   "parameters.tsx/setParameterRequired"                ["update_parameter"]
   "parameters.tsx/setParameterIsMultiSelect"           ["update_parameter"]
   "parameters.tsx/setParameterTemporalUnits"           ["update_parameter"]
   "parameters.tsx/setParameterQueryType"               ["update_parameter"]
   "parameters.tsx/setParameterSourceType"              ["update_parameter"]
   "parameters.tsx/setParameterSourceConfig"            ["update_parameter"]
   "parameters.tsx/setParameterFilteringParameters"     ["update_parameter"]
   ;; Duplicating a filter is adding one with the same settings, which a call already has in front of it.
   "parameters.tsx/duplicateParameters"                 ["add_parameter"]
   ;; The action a button on the dashboard runs is fixed when the button is placed: swapping it is removing the
   ;; button and placing another.
   "parameters.tsx/setActionForDashcard"                ["remove" "add_action"]
   "parameters.tsx/toggleAutoApplyFilters"              :dashboard-field
   "parameters.tsx/setEditingParameter"                 :ephemeral
   "parameters.tsx/setParameterValue"                   :ephemeral
   "parameters.tsx/setParameterValueToDefault"          :ephemeral
   "parameters.tsx/setOrUnsetParameterValues"           :ephemeral
   "parameters.tsx/setParameterValuesFromQueryParams"   :ephemeral
   "parameters.tsx/applyDraftParameterValues"           :ephemeral
   "parameters.tsx/resetParameters"                     :ephemeral
   "parameters.tsx/hideAddParameterPopover"             :ephemeral
   "parameters.tsx/showAutoApplyFiltersToast"           :ephemeral
   "parameters.tsx/closeAutoApplyFiltersToast"          :ephemeral

   ;; save.ts — the save the op compiler produces
   "save.ts/updateDashboardAndCards"                    :the-save
   "save.ts/updateDashboard"                            :the-save

   ;; trash.ts — named arguments of the tool, not ops
   "trash.ts/setArchivedDashboard"                      :dashboard-field
   "trash.ts/moveDashboardToCollection"                 :dashboard-field

   ;; revisions.ts
   "revisions.ts/revertToRevision"                      :another-tool ; `revert_content`

   ;; actions.ts — writeback actions
   "actions.ts/executeRowAction"                        :out-of-scope ; running an action is not authoring
   "actions.ts/setEditingDashcardId"                    :ephemeral

   ;; sharing.ts — the subscriptions sidebar. Public links and embedding are admin surfaces.
   "sharing.ts/setSharing"                              :ephemeral
   "sharing.ts/closeSidebarIfSubscriptionsSidebarOpen"  :ephemeral
   "sharing.ts/toggleSharing"                           :ephemeral

   ;; ui.ts — sidebars
   "ui.ts/setSidebar"                                   :ephemeral
   "ui.ts/closeSidebar"                                 :ephemeral
   "ui.ts/showClickBehaviorSidebar"                     :ephemeral
   "ui.ts/toggleSidebar"                                :ephemeral
   "ui.ts/openAddQuestionSidebar"                       :ephemeral
   "ui.ts/closeDashboard"                               :ephemeral

   ;; navigation.ts
   "navigation.ts/editQuestion"                         :ephemeral
   "navigation.ts/navigateToNewCardFromDashboard"       :ephemeral

   ;; data-fetching.ts — loading and caching
   "data-fetching.ts/fetchDashboard"                    :fetching
   "data-fetching.ts/fetchDashboardCardData"            :fetching
   "data-fetching.ts/fetchDashboardCardDataAction"      :fetching
   "data-fetching.ts/fetchCardData"                     :fetching
   "data-fetching.ts/fetchCardDataAction"               :fetching
   "data-fetching.ts/reloadDashboardCards"              :fetching
   "data-fetching.ts/cancelFetchDashboardCardData"      :fetching
   "data-fetching.ts/cancelFetchCardData"               :fetching
   "data-fetching.ts/clearCardData"                     :fetching
   "data-fetching.ts/addDashcardIdsToLoadingQueue"      :fetching
   "data-fetching.ts/markCardAsSlow"                    :fetching
   "data-fetching.ts/setDocumentTitle"                  :ephemeral
   "data-fetching.ts/setShowLoadingCompleteFavicon"     :ephemeral

   ;; auto-wire-parameters/ — the editor's offer to wire the rest of the cards, which the server performs. The
   ;; toasts are the offer; `wire_parameter` with `autowire` is the wiring.
   "auto-wire-parameters/actions.ts/showAutoWireToast"        ["wire_parameter"]
   "auto-wire-parameters/actions.ts/showAutoWireToastNewCard" ["wire_parameter"]
   "auto-wire-parameters/toasts.ts/showAutoWireParametersToast"      :ephemeral
   "auto-wire-parameters/toasts.ts/showAddedCardAutoWireParametersToast" :ephemeral
   "auto-wire-parameters/toasts.ts/closeAutoWireParameterToast"      :ephemeral
   "auto-wire-parameters/toasts.ts/closeAddCardAutoWireToasts"       :ephemeral
   "auto-wire-parameters/utils.ts/getAllDashboardCardsWithUnmappedParameters" :not-an-action
   "auto-wire-parameters/utils.ts/getMatchingParameterOption"        :not-an-action
   "auto-wire-parameters/utils.ts/getAutoWiredMappingsForDashcards"  :not-an-action
   "auto-wire-parameters/utils.ts/getParameterMappings"              :not-an-action

   ;; utils.ts, getNewCardUrl.ts — helpers
   "utils.ts/getExistingDashCards"                      :not-an-action
   "utils.ts/hasDashboardChanged"                       :not-an-action
   "utils.ts/haveDashboardCardsChanged"                 :not-an-action
   "utils.ts/getDashCardMoveToTabUndoMessage"           :not-an-action
   "utils.ts/trackAddedIFrameDashcards"                 :not-an-action
   "getNewCardUrl.ts/getNewCardUrl"                     :not-an-action
   "getNewCardUrl.ts/getParametersMappedToCard"         :not-an-action
   "getNewCardUrl.ts/remapParameterValuesToTemplateTags" :not-an-action})

(def ^:private export-pattern
  ;; An `export const`/`export function` at the top level. A SCREAMING_SNAKE name is an action-type constant, not
  ;; a creator, and is filtered out below; everything else is enumerated whether or not it turns out to be an
  ;; action, because the point of the oracle is that nobody gets to decide a new export is uninteresting silently.
  #"(?m)^export (?:const|function) ([A-Za-z][A-Za-z0-9_]*)")

(defn- exports
  "Every export of the action layer, as `\"file.ts/name\"` — and, for the auto-wire that lives in a directory of its
   own, `\"auto-wire-parameters/file.ts/name\"`."
  []
  (let [dir  (io/file actions-dir)
        path (fn [^java.io.File f]
               (subs (.getPath f) (inc (count actions-dir))))]
    (into #{}
          (comp (filter #(re-find #"\.tsx?$" (.getName ^java.io.File %)))
                (remove #(str/includes? (.getName ^java.io.File %) ".unit.spec."))
                (remove #(= "index.ts" (.getName ^java.io.File %)))
                (mapcat (fn [^java.io.File f]
                          (for [[_ export-name] (re-seq export-pattern (slurp f))
                                :when           (not (re-matches #"[A-Z0-9_]+" export-name))]
                            (str (path f) "/" export-name)))))
          (file-seq dir))))

(deftest ^:parallel every-dashboard-action-creator-is-mapped-test
  (testing "the dashboard editor is the enumeration of what a person can do to a dashboard, and every gesture in
            it is either an op of `dashboard_write` or a decision not to have one"
    (let [found   (exports)
          mapped  (set (keys coverage))
          unmapped (set/difference found mapped)
          stale    (set/difference mapped found)]
      (is (empty? unmapped)
          (str "The dashboard editor has action creators `dashboard_write` says nothing about. Add each to "
               "`coverage`, mapped to the ops that perform it or to the reason it has none:\n  "
               (str/join "\n  " (sort unmapped))))
      (is (empty? stale)
          (str "`coverage` maps action creators the editor no longer has. Drop them — a coverage map that "
               "claims gestures nobody can make is a coverage map nobody is reading:\n  "
               (str/join "\n  " (sort stale)))))))

(deftest ^:parallel every-op-the-coverage-map-names-is-an-op-test
  (testing "a mapping that names an op the tool does not have would report coverage the tool does not have"
    (let [named (into #{} (comp (filter vector?) cat) (vals coverage))]
      (is (empty? (set/difference named (set dashboard-write/ops)))
          "`coverage` names ops `dashboard_write` does not publish."))))

(deftest ^:parallel every-op-is-reachable-from-a-gesture-test
  (testing "an op no editor gesture maps to is an op nobody asked for — the oracle runs both ways"
    (let [covered (into #{} (comp (filter vector?) cat) (vals coverage))]
      (is (empty? (set/difference (set dashboard-write/ops) covered))
          "`dashboard_write` publishes ops that no dashboard-editor gesture maps to."))))

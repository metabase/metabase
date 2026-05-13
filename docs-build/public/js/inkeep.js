/*
 * Inkeep AI search bar — cxkit-js widget mounted into #inkeep in TopBar.astro.
 *
 * Paths that need to be resolved against DOCS_BASE_PATH are read from
 * window.__INKEEP_CONFIG__, which DocsLayout.astro sets via an inline script
 * before this module loads. Falls back to absolute marketing-site URLs so the
 * widget still works if the inline config is missing.
 */
import "https://cdn.jsdelivr.net/npm/@inkeep/cxkit-js@0.5.117/dist/embed.js";

const injected = window.__INKEEP_CONFIG__ ?? {};
const themeUrl = injected.themeUrl ?? "/css/inkeep.css";
const metabaseIconUrl =
  injected.metabaseIconUrl ?? "https://www.metabase.com/images/icons/metabase-icon.svg";
const personIconUrl =
  injected.personIconUrl ?? "https://www.metabase.com/images/icons/person.svg";

const config = {
  baseSettings: {
    apiKey: "6dd55673e83be3649d9ef8281b40795329b492a8fc320985",
    organizationDisplayName: "Metabase",
    primaryBrandColor: "#509EE3",
    theme: {
      styles: [{ type: "link", value: themeUrl }],
    },
  },
  aiChatSettings: {
    aiAssistantName: "Metabase",
    chatSubjectName: "Metabase",
    placeholder: "How long does it take to bake a pie chart?",
    introMessage:
      "Hi! You can ask me about Metabase. <em>(Please check the sources; I'm still learning.)</em>",
    prompts: ["Be succinct"],
    aiAssistantAvatar: { light: metabaseIconUrl, dark: metabaseIconUrl },
    userAvatar: personIconUrl,
  },
  searchSettings: {
    placeholder: "Search",
  },
  shouldShowAskAICard: false,
  askAILabel: "Ask",
  forceDefaultView: "search",
  modalSettings: { shortcutKey: null },
};

document.addEventListener("DOMContentLoaded", () => {
  if (!document.getElementById("inkeep")) return;
  window.Inkeep.SearchBar("#inkeep", config);
});

import type { VisualizationSettings } from "metabase-types/api";

/**
 * In modular embedding (react sdk and embed-js) we disable internal click behaviors
 * but we want to keep external links (EMB-878) and clicking on the cell should fallback to
 * drills if available (EMB-879)
 */
export function removeInternalClickBehaviors(
  computedSettings: VisualizationSettings,
) {
  if (
    computedSettings.click_behavior &&
    computedSettings.click_behavior.type === "link" &&
    computedSettings.click_behavior.linkType !== "url"
  ) {
    return {
      ...computedSettings,
      click_behavior: undefined,
    };
  }
  return computedSettings;
}

/**
 * Converts link columns to external click behaviors (EMB-890) We do this
 * because click behaviors automatically support `mapQuestionClickActions`, and
 * adding support for that to links would be a bigger effort than the remap
 */
export function convertLinkColumnToClickBehavior(
  computedSettings: VisualizationSettings,
) {
  const isLinkColumn =
    computedSettings.view_as === "link" ||
    (computedSettings.column?.semantic_type === "type/URL" &&
      computedSettings.view_as === "auto");

  if (!isLinkColumn) {
    return computedSettings;
  }

  const linkURL = computedSettings.link_url;
  const linkText = computedSettings.link_text;
  const colName = computedSettings.column?.name;

  return {
    ...computedSettings,
    view_as: undefined,
    link_url: undefined,
    link_text: undefined,
    click_behavior: {
      type: "link",
      linkType: "url",
      linkTextTemplate:
        linkText == null && colName ? `{{${colName}}}` : linkText,
      linkTemplate: linkURL == null && colName ? `{{${colName}}}` : linkURL,
    },
  };
}

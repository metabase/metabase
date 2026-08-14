// Admission rule: code belongs here when its subject is instance branding —
// the OSS defaults behind the EE whitelabel plugin seam.
// Deriving from a whitelabel setting is not enough.

// The module's public interface.
// Names absent here are module-private on purpose — add them only when a real consumer needs them.

export { PLUGIN_SELECTORS, type IllustrationValue } from "./plugin";
export {
  getApplicationName,
  getCanWhitelabel,
  getFont,
  getFontFiles,
  getIsWhiteLabeling,
  getLandingPageIllustration,
  getLoginPageIllustration,
  getNoDataIllustration,
  getNoObjectIllustration,
  getShowMetabaseLinks,
  getWhiteLabeledLoadingMessageFactory,
} from "./selectors";

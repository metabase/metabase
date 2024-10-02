import { updateSetting } from "./api";

export const setupMetabaseCloud = () => {
  updateSetting("site-url", "https://CYPRESSTESTENVIRONMENT.metabaseapp.com");
};

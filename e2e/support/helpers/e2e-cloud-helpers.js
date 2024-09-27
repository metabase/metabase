import { putSetting } from "./api";

export const setupMetabaseCloud = () => {
  putSetting("site-url", "https://CYPRESSTESTENVIRONMENT.metabaseapp.com");
};

import { useSetting } from "../use-setting";

export const useInstanceLocale = () => {
  return useSetting("site-locale");
};

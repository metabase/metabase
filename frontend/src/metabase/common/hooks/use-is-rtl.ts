import { useLocale } from "metabase/common/hooks/use-locale";
import { isRTLLocale } from "metabase/utils/i18n";

/**
 * Whether the *effective* locale is right-to-left.
 *
 * Derived from `useLocale` rather than from `document.documentElement.dir` so
 * that an embed carrying its own `#locale` — an RTL SDK embed inside an LTR host
 * page, or the reverse — resolves to its own direction instead of the host's.
 */
export const useIsRtl = (): boolean => {
  const { locale } = useLocale();
  return isRTLLocale(locale ?? "");
};

/**
 * Metabase instance the SDK stories connect to.
 */
export const STORYBOOK_METABASE_INSTANCE_URL =
  process.env.STORYBOOK_METABASE_INSTANCE_URL || "http://localhost:3000";

// Copied from the instance settings and re-ordered, may go out of sync with the real ones
// Locales in the format `xx_AA` were also changed to `xx-AA`
export const availableLocales = [
  { value: undefined, title: "default (instance locale)" },
  { value: "en", right: "🇺🇸", title: "en" },
  { value: "de", right: "🇩🇪", title: "de" }, // one that we know should be well supported
  { value: "ar", right: "🇸🇦", title: "ar" },
  { value: "ar-SA", right: "🇸🇦", title: "ar-SA" },
  { value: "bg", right: "🇧🇬", title: "bg" },
  { value: "ca", right: "🇪🇺", title: "ca" },
  { value: "cs", right: "🇨🇿", title: "cs" },
  { value: "da", right: "🇩🇰", title: "da" },
  { value: "es", right: "🇪🇺", title: "es" },
  { value: "fa", right: "🇮🇷", title: "fa" },
  { value: "fi", right: "🇫🇮", title: "fi" },
  { value: "fr", right: "🇫🇷", title: "fr" },
  { value: "he", right: "🇮🇱", title: "he" },
  { value: "hu", right: "🇭🇺", title: "hu" },
  { value: "id", right: "🇮🇩", title: "id" },
  { value: "it", right: "🇮🇹", title: "it" },
  { value: "ja", right: "🇯🇵", title: "ja" },
  { value: "ko", right: "🇰🇷", title: "ko" },
  { value: "lv", right: "🇱🇻", title: "lv" },
  { value: "ms", right: "🇲🇾", title: "ms" },
  { value: "nb", right: "🇳🇴", title: "nb" },
  { value: "nl", right: "🇳🇱", title: "nl" },
  { value: "pl", right: "🇵🇱", title: "pl" },
  { value: "pt-BR", right: "🇧🇷", title: "pt-BR" },
  { value: "ru", right: "🇷🇺", title: "ru" },
  { value: "sk", right: "🇸🇰", title: "sk" },
  { value: "sl", right: "🇸🇱", title: "sl" },
  { value: "sq", right: "🇦🇱", title: "sq" },
  { value: "sr", right: "🇷🇸", title: "sr" },
  { value: "sv", right: "🇸🇪", title: "sv" },
  { value: "tr", right: "🇹🇷", title: "tr" },
  { value: "uk", right: "🇺🇦", title: "uk" },
  { value: "vi", right: "🇻🇳", title: "vi" },
  { value: "zh-CN", right: "🇨🇳", title: "zh-CN" },
  { value: "zh-HK", right: "🇭🇰", title: "zh-HK" },
  { value: "zh-TW", right: "🇹🇼", title: "zh-TW" },
];

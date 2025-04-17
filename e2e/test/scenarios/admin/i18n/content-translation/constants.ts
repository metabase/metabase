import type { DictionaryArrayRow } from "metabase/i18n/types";

export const translationsOfColumnNames: [
  DictionaryArrayRow,
  ...DictionaryArrayRow[],
] = [
  { locale: "de", msgid: "Title", msgstr: "Titel" },
  { locale: "de", msgid: "Vendor", msgstr: "Anbieter" },
  { locale: "de", msgid: "Rating", msgstr: "Bewertung" },
  { locale: "de", msgid: "Category", msgstr: "Kategorie" },
  { locale: "de", msgid: "Created At", msgstr: "Erstellt am" },
  { locale: "de", msgid: "Price", msgstr: "Preis" },
];

export const nonAsciiTranslationsOfColumnNames: DictionaryArray = [
  { locale: "ar", msgid: "Title", msgstr: "العنوان" },
  { locale: "el", msgid: "Title", msgstr: "Τίτλος" },
  { locale: "he", msgid: "Title", msgstr: "כותרת" },
  { locale: "ja", msgid: "Title", msgstr: "タイトル" },
  { locale: "ko", msgid: "Title", msgstr: "제목" },
  { locale: "ru", msgid: "Title", msgstr: "Название" },
  { locale: "th", msgid: "Title", msgstr: "ชื่อเรื่อง" },
  { locale: "tr", msgid: "Title", msgstr: "Başlık" },
  { locale: "uk", msgid: "Title", msgstr: "Заголовок" },
  { locale: "vi", msgid: "Title", msgstr: "Tiêu đề" },
  { locale: "zh", msgid: "Title", msgstr: "标题" },
  { locale: "en", msgid: "Butterfly", msgstr: "🦋" },
];

export const columnNamesWithTypeText = ["Title", "Category", "Vendor"];

import type { NonEmpty } from "metabase/i18n/types";
import type { DictionaryArray } from "metabase-types/api";

export const germanFieldNames: NonEmpty<DictionaryArray> = [
  { locale: "de", msgid: "Title", msgstr: "Titel" },
  { locale: "de", msgid: "Vendor", msgstr: "Anbieter" },
  { locale: "de", msgid: "Rating", msgstr: "Bewertung" },
  { locale: "de", msgid: "Category", msgstr: "Kategorie" },
  { locale: "de", msgid: "Created At", msgstr: "Erstellt am" },
  { locale: "de", msgid: "Price", msgstr: "Preis" },
];

export const portugueseFieldNames: DictionaryArray = [
  { locale: "pt-BR", msgid: "Title", msgstr: "Título" },
  { locale: "pt-BR", msgid: "Vendor", msgstr: "Fornecedor" },
  { locale: "pt-BR", msgid: "Rating", msgstr: "Avaliação" },
  { locale: "pt-BR", msgid: "Category", msgstr: "Categoria" },
  { locale: "pt-BR", msgid: "Created At", msgstr: "Criado em" },
  { locale: "pt-BR", msgid: "Price", msgstr: "Preço" },
];

export const nonAsciiFieldNames: DictionaryArray = [
  { locale: "ar", msgid: "Title", msgstr: "العنوان" },
  { locale: "he", msgid: "Title", msgstr: "כותרת" },
  { locale: "ja", msgid: "Title", msgstr: "タイトル" },
  { locale: "ko", msgid: "Title", msgstr: "제목" },
  { locale: "ru", msgid: "Title", msgstr: "Название" },
  { locale: "tr", msgid: "Title", msgstr: "Başlık" },
  { locale: "uk", msgid: "Title", msgstr: "Заголовок" },
  { locale: "vi", msgid: "Title", msgstr: "Tiêu đề" },
  { locale: "zh-TW", msgid: "Title", msgstr: "标题" },
  { locale: "en", msgid: "Butterfly", msgstr: "🦋" },
];

export const columnNamesWithTypeText = ["Title", "Category", "Vendor"];

export const stringTranslatedTwice = structuredClone(germanFieldNames);
stringTranslatedTwice.push({
  locale: "de",
  msgid: "Title",
  msgstr: "Überschrift",
});

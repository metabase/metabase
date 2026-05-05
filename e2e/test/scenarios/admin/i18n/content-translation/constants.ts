import type { NonEmpty } from "metabase/i18n/types";
import { clone } from "metabase/utils/clone";
import type { DictionaryArray } from "metabase-types/api";

export const germanFieldNames: NonEmpty<DictionaryArray> = [
  { locale: "de", msgid: "Title", msgstr: "Titel" },
  { locale: "de", msgid: "Vendor", msgstr: "Anbieter" },
  { locale: "de", msgid: "Rating", msgstr: "Bewertung" },
  { locale: "de", msgid: "Category", msgstr: "Kategorie" },
  { locale: "de", msgid: "Created At", msgstr: "Erstellt am" },
  { locale: "de", msgid: "Price", msgstr: "Preis" },
];

export const germanFieldValues: NonEmpty<DictionaryArray> = [
  { locale: "de", msgid: "Doohickey", msgstr: "Dingsbums" },
  { locale: "de", msgid: "Gadget", msgstr: "Gerät" },
  { locale: "de", msgid: "Gizmo", msgstr: "Apparat" },
  { locale: "de", msgid: "Widget", msgstr: "Steuerelement" },
  {
    locale: "de",
    msgid: "Rustic Paper Wallet",
    msgstr: "Rustikale Papierbörse",
  },
];

export const frenchNames: NonEmpty<DictionaryArray> = [
  { locale: "fr", msgid: "Francesca Gleason", msgstr: "Glacia Froskeon" },
  { locale: "fr", msgid: "Francesca Hammes", msgstr: "Hammera Francite" },
  { locale: "fr", msgid: "Francesco Grant", msgstr: "Granto Francello" },
  { locale: "fr", msgid: "Francisco Robel", msgstr: "Robux Ciscoray" },
  { locale: "fr", msgid: "Franco O'Reilly", msgstr: "O'Reilux Francor" },
];

export const frenchBooleanTranslations: NonEmpty<DictionaryArray> = [
  { locale: "fr", msgid: "true", msgstr: "vrai" },
  { locale: "fr", msgid: "false", msgstr: "faux" },
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

export const invalidLocaleXX = clone(germanFieldNames);
invalidLocaleXX[0].locale = "xx";

export const multipleInvalidLocales = clone(germanFieldNames);
multipleInvalidLocales[0].locale = "ze";
multipleInvalidLocales[3].locale = "qe";

export const stringTranslatedTwice = clone(germanFieldNames);
stringTranslatedTwice.push({
  locale: "de",
  msgid: "Title",
  msgstr: "Überschrift",
});

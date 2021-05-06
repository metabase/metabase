
const TITLE_LOCALES_BN = {
  'sample.question': {
      'en': "Sample Question",
      'bn': "স্যাম্পল প্রশ্ন"
  }
}

export function dashcard_locale_title (locale, title_key) {
    locale = locale === 'bn'? locale: 'en';
    return TITLE_LOCALES_BN[title_key][locale];
}

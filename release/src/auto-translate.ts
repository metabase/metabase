import 'dotenv/config';
import fs from 'fs';

import chalk from 'chalk';
import fetch from 'node-fetch';

const baseUrl = 'https://api.poeditor.com/v2'
const POEDITOR_API_TOKEN = process.env.POEDITOR_API_TOKEN;
const POEDITOR_PROJECT_ID = "200535"; // Metabase POEditor project
const SOURCE_LANGUAGE = "en";
const DEFAULT_PROVIDER = "deepl";
const url = `${baseUrl}/translations/automatic`;

// deepl doesn't support these languages
const google_only_languages = [
  'ar',
  'ar-SA',
  'ca',
  'fa',
  'he',
  'id',
  'ms',
  'sq',
  'sr',
  'vi',
];

// alias from our file names to poeditor's language codes
const aliases: Record<string, string> = {
  "zh": 'zh-Hans',
};

// alias from poeditor's language codes to deepl or google's language codes
const providerAliases: Record<string, string> = {
  'ar-SA': 'ar', // google
  'he': 'iw', // google
  "zh-CN": "zh", // deepl
  "zh-HK": "zh", // deepl
  "zh-TW": "zh", // deepl
  "zh-Hans": "zh", // deepl
};

// for this to work you have to manually "copy terms to translations" in the english poeditor language
// this also requires translations credits. it's like $34 every 6 months or so
// https://poeditor.com/docs/api#translations_automatic
const autoTranslate = async (language: string) => {
  if (language in aliases) {
    language = aliases[language];
  }

  const provider = google_only_languages.includes(language) ? 'google' : DEFAULT_PROVIDER;

  const config = {
    source_language: SOURCE_LANGUAGE,
    provider_source_language: provider === 'deepl'
      ? SOURCE_LANGUAGE.toUpperCase() // deepl uses uppercase
      : SOURCE_LANGUAGE,
    provider,
    target_languages: [{
      project_language: language,
      provider_language: provider === 'deepl'
        ? (providerAliases[language] ?? language).toUpperCase() // deepl uses uppercase
        : (providerAliases[language] ?? language),
    }],
  };

  // poeditor doesn't like the escaping that UrlSearchParams does
  const encodedData = `api_token=${POEDITOR_API_TOKEN}&id=${POEDITOR_PROJECT_ID}&source_language=${config.source_language}&provider_source_language=${config.provider_source_language}&provider=${provider}`
    + `&target_languages=${JSON.stringify(config.target_languages).replaceAll('"', '\"')}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: encodedData,
  });

  const message = (await response.json() as { result?: string })?.result;

  console.log(message);
}

function getExistingLanguages() {
  const localeFiles = fs.readdirSync("./locales");

  return localeFiles.filter(f => /\.po$/.test(f))
    .map(f => f.replace(/\.po$/, ""));
}

export async function autoTranslateSupportedLanguages() {
  const supportedLanguages = getExistingLanguages();

  for (const language of supportedLanguages) {
    // do this in a for/await loop to avoid rate limiting
    console.log(chalk.blue(`\nTranslating ${language}`))
    await autoTranslate(language);
  }
}

import 'zx/globals';

const baseUrl = 'https://api.poeditor.com/v2'
const POEDITOR_API_TOKEN = process.env.POEDITOR_API_TOKEN;
const POEDITOR_PROJECT_ID = "200535"; // Metabae POEditor project
const SOURCE_LANGUAGE = "english";
const PROVIDER = "deepl"; // TODO: fallback to google,

const languages = [
  'es',
  'pl',
];

// https://poeditor.com/docs/api#translations_automatic
const autoTranslate = async (language: string) => {
  const url = `${baseUrl}/translations/automatic`;

  // poeditor doesn't like the escaping that UrlSearchParams does
  const encodedData = `api_token=${POEDITOR_API_TOKEN}&id=${POEDITOR_PROJECT_ID}&source_language="${SOURCE_LANGUAGE}"&provider_source_language="${SOURCE_LANGUAGE}"&provider="${PROVIDER}"`
     + `&target_languages=${JSON.stringify([{
        project_language: language,
        provider_language: language,
      }]).replaceAll('"', '\"')}`;

  console.log(encodedData)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: encodedData,
  });

  console.log(await response.json())
}

await autoTranslate('es');
/**

curl -X POST https://api.poeditor.com/v2/translations/automatic \
     -d api_token="xxx" \
     -d id="200535" \
     -d source_language="en" \
     -d provider_source_language="en" \
     -d provider="deepl" \
     -d target_languages="[{\"project_language\":\"es\",\"provider_language\":\"es\"}]"
 */


import fetchMock from "fetch-mock";

export function setupLocalesEndpoint(
  locale: string,
  translationObject: Record<string, unknown>,
) {
  fetchMock.get(`path:/app/locales/${locale}.json`, translationObject);
}

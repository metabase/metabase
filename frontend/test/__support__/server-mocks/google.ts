import fetchMock from "fetch-mock";

export function setupUpdateGoogleAuthEndpoint(
  { status }: { status?: number } = { status: 204 },
) {
  fetchMock.put(
    new RegExp("/api/google/settings"),
    { status },
    { name: "google-settings-put" },
  );
}

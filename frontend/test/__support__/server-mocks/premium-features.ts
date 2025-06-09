import fetchMock from "fetch-mock";

export const setupTokenStatusEndpoint = (
  valid: boolean,
  features: string[] = [],
) => {
  fetchMock.get(
    "path:/api/premium-features/token/status",
    {
      valid,
      "valid-thru": valid ? "2099-12-31T12:00:00" : null,
      features,
    },
    { overwriteRoutes: true },
  );
};

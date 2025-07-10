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

export const setupTokenStatusEndpointEmpty = () => {
  fetchMock.get("path:/api/premium-features/token/status", 404, {
    overwriteRoutes: true,
  });
};

export const setupTokenActivationEndpoint = ({
  success,
  status,
}: {
  success?: boolean;
  status?: number;
}) => {
  const responseStatus = status ?? (success ? 204 : 400);
  fetchMock.put(
    "path:/api/setting/premium-embedding-token",
    { success, error: success ? undefined : "Invalid token" },
    { response: responseStatus, overwriteRoutes: true },
  );
};

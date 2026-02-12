import fetchMock from "fetch-mock";

export const setupTokenStatusEndpoint = ({
  valid,
  features,
}: {
  valid: boolean;
  features?: string[];
}) => {
  const name = "premium-token-status";
  fetchMock.removeRoute(name);
  fetchMock.get(
    "path:/api/premium-features/token/status",
    {
      valid,
      "valid-thru": valid ? "2099-12-31T12:00:00" : null,
      features,
    },
    { name },
  );
};

export const setupTokenStatusEndpointEmpty = () => {
  fetchMock.get("path:/api/premium-features/token/status", 404, {
    name: "premium-token-status",
  });
};

export const setupTokenRefreshEndpoint = () => {
  fetchMock.post("path:/api/premium-features/token/refresh", 200, {
    name: "premium-token-refresh",
  });
};

export const setupTokenActivationEndpoint = ({
  success,
  status,
}: {
  success?: boolean;
  status?: number;
}) => {
  const name = "premium-token-activation";
  try {
    fetchMock.removeRoute(name);
  } catch {
    // Route might not exist, ignore
  }
  const responseStatus = status ?? (success ? 204 : 400);
  fetchMock.put(
    "path:/api/setting/premium-embedding-token",
    { success, error: success ? undefined : "Invalid token" },
    {
      response: responseStatus,
      name,
    },
  );
};

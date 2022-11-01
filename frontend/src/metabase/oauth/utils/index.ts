import { GoogleCredentialResponse } from "../types";

export function extractClientId(
  credentialResponse: GoogleCredentialResponse,
): string | undefined {
  try {
    const clientId =
      credentialResponse?.clientId ?? credentialResponse?.client_id;
    if (clientId) {
      return clientId;
    }

    if (!credentialResponse?.credential) {
      return undefined;
    }

    const payload = JSON.parse(
      atob(credentialResponse.credential.split(".")[1]),
    );
    return payload?.aud;
  } catch {
    return undefined;
  }
}

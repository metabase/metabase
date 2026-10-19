import { EMBEDDED_DATA_APP_PREFIX } from "embedding-sdk-shared/lib/data-app-embed";
import { api } from "metabase/api/client";

/** Install the authorized app's CSP before any untrusted bundle runs. */
export async function prepareEmbeddedDataApp(name: string) {
  const response = await api.fetch({
    method: "GET",
    url: `${EMBEDDED_DATA_APP_PREFIX}/${encodeURIComponent(name)}`,
    cache: "no-store",
  });

  if (response.status === 404) {
    throw new Error(
      `Data app "${name}" was not found or is disabled. Check the app name in path.`,
    );
  }

  if (!response.ok) {
    throw new Error(
      `Unable to authorize this data app: HTTP ${response.status}`,
    );
  }

  const policy = response.headers.get("Content-Security-Policy");
  // eslint-disable-next-line metabase/no-literal-metabase-strings -- HTTP header name
  const policyType = response.headers.get("X-Metabase-Data-App-Policy");

  if (!policy || policyType !== "authenticated") {
    throw new Error("The authenticated data app policy is missing.");
  }

  const meta = document.createElement("meta");
  meta.httpEquiv = "Content-Security-Policy";
  // frame-ancestors is enforced by the document's response header, not meta.
  meta.content = policy.replace(/frame-ancestors[^;]*;/g, "");
  document.head.appendChild(meta);
}

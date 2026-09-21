/* eslint-disable i18next/no-literal-string */
import type { DataAppManifestStatus } from "../../../types/manifest-status";
import S from "../DevToolbar.module.css";
import { StatusRow } from "../StatusRow/StatusRow";

type Props = {
  manifest: DataAppManifestStatus | null;
};

export const ManifestTab = ({ manifest }: Props) => {
  if (!manifest) {
    return <div className={S.Empty}>Manifest has not been validated yet.</div>;
  }

  return (
    <div className={S.StatusBody}>
      {manifest.restartRequired && (
        <div className={S.Problem}>
          allowed_hosts changed since the dev server started — restart `npm run
          dev` to apply it to the sandbox and CSP.
        </div>
      )}

      {manifest.errors.map((error) => (
        <div key={error} className={S.Problem}>
          {error}
        </div>
      ))}

      {manifest.warnings.map((warning) => (
        <div key={warning} className={S.Warning}>
          {warning}
        </div>
      ))}

      {manifest.errors.length === 0 && manifest.warnings.length === 0 && (
        <div className={S.Empty}>data_app.yaml is valid.</div>
      )}

      <StatusRow label="name">{manifest.name ?? "missing"}</StatusRow>
      <StatusRow label="path">
        {manifest.bundlePath ?? "missing"}
        {manifest.bundlePath != null &&
          !manifest.bundlePathExists &&
          " (file not found)"}
      </StatusRow>
      <StatusRow label="allowed_hosts">
        {manifest.allowedHosts.length > 0
          ? manifest.allowedHosts.join(", ")
          : "none (network egress is blocked)"}
      </StatusRow>
    </div>
  );
};

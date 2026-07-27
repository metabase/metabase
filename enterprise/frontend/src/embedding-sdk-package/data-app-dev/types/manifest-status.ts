export interface DataAppManifestStatus {
  checkedAt: number;
  name: string | null;
  bundlePath: string | null;
  bundlePathExists: boolean;
  allowedHosts: string[];
  errors: string[];
  warnings: string[];
  restartRequired: boolean;
}

export interface DataAppManifestStatus {
  exists: boolean;
  name: string | null;
  bundlePath: string | null;
  bundlePathExists: boolean;
  allowedHosts: string[];
  errors: string[];
  warnings: string[];
  restartRequired: boolean;
}

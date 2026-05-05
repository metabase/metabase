import { updateEnterpriseSettings } from "./api/updateSetting";
import { codeMirrorHelpers } from "./e2e-codemirror-helpers";

export const PythonEditor = codeMirrorHelpers("python-editor", {});

export function setPythonRunnerSettings() {
  updateEnterpriseSettings({
    "python-runner-url": "http://localhost:5001",
    "python-runner-api-token": "dev-token-12345",
    "python-storage-s-3-endpoint": "http://localhost:4566",
    "python-storage-s-3-region": "us-east-1",
    "python-storage-s-3-bucket": "metabase-python-runner",
    "python-storage-s-3-prefix": "test-prefix",
    "python-storage-s-3-access-key": "test",
    "python-storage-s-3-secret-key": "test",
    "python-storage-s-3-container-endpoint": "http://localstack:4566",
    "python-storage-s-3-path-style-access": true,
  });
}

import { useCallback, useEffect, useState } from "react";

import SlackSetup from "../../containers/SlackSetup";
import SlackStatus from "../../containers/SlackStatus";

export interface SlackSettingsProps {
  isApp?: boolean;
  onLoadManifest: () => Promise<SlackManifestPayload>;
}

export interface SlackManifestPayload {
  payload: string;
}

const SlackSettings = ({
  isApp,
  onLoadManifest,
}: SlackSettingsProps): JSX.Element => {
  const [manifest, setManifest] = useState<string>();

  const handleMount = useCallback(async () => {
    if (!isApp) {
      const { payload } = await onLoadManifest();
      setManifest(payload);
    }
  }, [isApp, onLoadManifest]);

  useEffect(() => {
    handleMount();
  }, [isApp, handleMount]);

  return isApp ? <SlackStatus /> : <SlackSetup manifest={manifest} />;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SlackSettings;

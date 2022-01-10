import React, { useCallback, useEffect, useState } from "react";
import SlackStatus from "../../containers/SlackStatus";
import SlackSetup from "../../containers/SlackSetup";

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
  }, [onLoadManifest]);

  useEffect(() => {
    handleMount();
  }, [isApp, handleMount]);

  return isApp ? <SlackStatus /> : <SlackSetup manifest={manifest} />;
};

export default SlackSettings;

import cx from "classnames";
import { useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import Breadcrumbs from "metabase/components/Breadcrumbs";
import CS from "metabase/css/core/index.css";
import { Stack } from "metabase/ui";

import SlackSetup from "../../containers/SlackSetup";
import SlackStatus from "../../containers/SlackStatus";

const BREADCRUMBS = [
  [t`Notification channels`, "/admin/settings/notifications"],
  ["Slack"],
];

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

  return (
    <Stack>
      <Breadcrumbs crumbs={BREADCRUMBS} className={cx(CS.mb2, CS.pl2)} />
      {isApp ? <SlackStatus /> : <SlackSetup manifest={manifest} />}
    </Stack>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SlackSettings;

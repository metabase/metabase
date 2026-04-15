import { jt, t } from "ttag";
import _ from "underscore";

import type { Engine } from "metabase-types/api";

import { Warning, WarningLink } from "./DatabaseEngineWarning.styled";

export interface DatabaseEngineWarningProps {
  engineKey?: string;
  engines: Record<string, Engine>;
  onChange?: (engine: string) => void;
}

const DatabaseEngineWarning = ({
  engineKey,
  engines,
  onChange,
}: DatabaseEngineWarningProps): JSX.Element | null => {
  const engine = engineKey ? engines[engineKey] : undefined;

  if (!engine) {
    return null;
  }

  const engineName = engine["driver-name"];
  const engineSourceType = engine?.source?.type || "community";

  const newEngineKey = engine["superseded-by"];
  const newEngine = newEngineKey ? engines[newEngineKey] : undefined;
  const newEngineName = newEngine?.["driver-name"];
  const handleChangeToNew = () => newEngineKey && onChange?.(newEngineKey);

  const oldEngineKey = _.findKey(engines, { "superseded-by": engineKey });
  const oldEngine = oldEngineKey ? engines[oldEngineKey] : undefined;
  const handleChangeToOld = () => oldEngineKey && onChange?.(oldEngineKey);

  const warnings = [];

  if (newEngine) {
    warnings.push(
      <NewEngineWarning
        key="new"
        engineName={newEngineName || ""}
        onChange={handleChangeToNew}
      />,
    );
  }

  if (oldEngine) {
    warnings.push(
      <OldEngineWarning
        key="old"
        engineName={engineName}
        onChange={handleChangeToOld}
      />,
    );
  }

  if (engineSourceType === "community") {
    warnings.push(<CommunityEngineWarning key="community" />);
  }

  return <>{warnings}</>;
};

interface NewEngineWarningProps {
  engineName: string;
  onChange: () => void;
}

const NewEngineWarning = ({ engineName, onChange }: NewEngineWarningProps) => (
  <Warning>
    {t`This driver will be removed in a future release.`}{" "}
    {jt`We recommend you upgrade to the ${(
      <WarningLink key="link" onClick={onChange}>
        {t`new ${engineName} driver`}
      </WarningLink>
    )}.`}
  </Warning>
);

interface OldEngineWarningProps {
  engineName: string;
  onChange: () => void;
}

const OldEngineWarning = ({ engineName, onChange }: OldEngineWarningProps) => (
  <Warning>
    {t`This is our new ${engineName} driver.`}{" "}
    {t`The old driver has been deprecated and will be removed in a future release.`}{" "}
    {jt`If you really need to use it, you can ${(
      <WarningLink key="link" onClick={onChange}>
        {t`find it here`}
      </WarningLink>
    )}.`}
  </Warning>
);

const CommunityEngineWarning = () => (
  <Warning icon="info">
    {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Metabase settings */}
    {t`This is a community-developed driver and not supported by Metabase. `}
  </Warning>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseEngineWarning;

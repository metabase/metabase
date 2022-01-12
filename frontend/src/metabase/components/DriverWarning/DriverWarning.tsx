import React from "react";
import { jt, t } from "ttag";
import _ from "underscore";
import { Engine } from "metabase-types/api";
import { WarningLink, WarningRoot } from "./DriverWarning.styled";

export interface DriverWarningProps {
  engine?: string;
  engines: Record<string, Engine>;
  onChange?: (engine: string) => void;
}

const DriverWarning = ({
  engine: engineKey,
  engines,
  onChange,
}: DriverWarningProps): JSX.Element | null => {
  const engine = engineKey ? engines[engineKey] : undefined;
  const engineName = engine?.["display-name"];

  const newEngineKey = engine?.["superseded-by"];
  const newEngine = newEngineKey ? engines[newEngineKey] : undefined;
  const newEngineName = newEngine?.["display-name"];
  const handleChangeToNew = () => newEngineKey && onChange?.(newEngineKey);

  const oldEngineKey = _.findKey(engines, { "superseded-by": engineKey });
  const oldEngine = oldEngineKey ? engines[oldEngineKey] : undefined;
  const handleChangeToOld = () => oldEngineKey && onChange?.(oldEngineKey);

  if (newEngine) {
    return (
      <WarningRoot>
        {t`This driver will be removed in a future release.`}{" "}
        {jt`We recommend you upgrade to the ${(
          <WarningLink key="link" onClick={handleChangeToNew}>
            {t`new ${newEngineName} driver`}
          </WarningLink>
        )}.`}
      </WarningRoot>
    );
  }

  if (oldEngine) {
    return (
      <WarningRoot>
        {t`This is our new ${engineName} driver.`}{" "}
        {t`The old driver has been deprecated and will be removed in a future release.`}{" "}
        {jt`If you really need to use it, you can ${(
          <WarningLink key="link" onClick={handleChangeToOld}>
            {t`find it here`}
          </WarningLink>
        )}.`}
      </WarningRoot>
    );
  }

  return null;
};

export default DriverWarning;

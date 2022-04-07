import React from "react";
import { jt, t } from "ttag";
import _ from "underscore";
import { Engine } from "metabase-types/api";
import { WarningLink, WarningRoot } from "./DriverWarning.styled";
import Icon from "metabase/components/Icon";

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
        handleChange={handleChangeToNew}
      />,
    );
  }

  if (oldEngine) {
    warnings.push(
      <OldEngineWarning
        key="old"
        engineName={engineName}
        handleChange={handleChangeToOld}
      />,
    );
  }

  if (engineSourceType === "community") {
    warnings.push(<CommunityDriverWarning key="community" />);
  } else if (engineSourceType === "partner") {
    warnings.push(
      <PartnerDriverWarning
        key="partner"
        sourceName={engine?.source?.contact?.name}
        sourceContact={engine?.source?.contact?.address}
      />,
    );
  }

  return <>{warnings}</>;
};

const NewEngineWarning = ({
  engineName,
  handleChange,
}: {
  engineName: string;
  handleChange: () => void;
}) => (
  <WarningRoot hasBorder>
    <p>
      {t`This driver will be removed in a future release.`}{" "}
      {jt`We recommend you upgrade to the ${(
        <WarningLink key="link" onClick={handleChange}>
          {t`new ${engineName} driver`}
        </WarningLink>
      )}.`}
    </p>
  </WarningRoot>
);

const OldEngineWarning = ({
  engineName,
  handleChange,
}: {
  engineName: string;
  handleChange: () => void;
}) => (
  <WarningRoot hasBorder>
    <p>
      {t`This is our new ${engineName} driver.`}{" "}
      {t`The old driver has been deprecated and will be removed in a future release.`}{" "}
      {jt`If you really need to use it, you can ${(
        <WarningLink key="link" onClick={handleChange}>
          {t`find it here`}
        </WarningLink>
      )}.`}
    </p>
  </WarningRoot>
);

const CommunityDriverWarning = () => (
  <WarningRoot hasBorder>
    <Icon name="info" className="pr2" />
    <p>
      {t`This is a community-developed driver and not supported by Metabase. `}
    </p>
  </WarningRoot>
);

const PartnerDriverWarning = ({
  sourceName,
  sourceContact,
}: {
  sourceName: string | undefined;
  sourceContact: string | undefined;
}) => {
  const contactLink = sourceContact ? (
    <WarningLink
      href={
        sourceContact.includes("@") ? `mailto:${sourceContact}` : sourceContact
      }
      rel="noopener noreferrer"
      target="_blank"
    >
      {sourceName || "our partner"}
    </WarningLink>
  ) : null;

  return (
    <WarningRoot hasBorder>
      <Icon name="info" className="pr2" />
      <p>
        {t`This is a partner-developed driver. Though Metabase can’t provide support for it, if you need help you can contact the fine folks at `}
        {contactLink}
        {!contactLink && (sourceName || "our partner")}.
      </p>
    </WarningRoot>
  );
};

export default DriverWarning;

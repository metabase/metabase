import React from "react";
import PropTypes from "prop-types";

import { t } from "ttag";

import {
  allEngines,
  engineSupersedesMap,
} from "metabase/entities/databases/forms";

import {
  CardContent,
  DriverWarningContainer,
  IconContainer,
  WarningIcon,
  WarningParagraph,
} from "./DriverWarning.styled";

import ExternalLink from "metabase/components/ExternalLink";
import Icon from "metabase/components/Icon";
import MetabaseSettings from "metabase/lib/settings";

const propTypes = {
  engine: PropTypes.string.isRequired,
  hasCircle: PropTypes.bool.isRequired,
  onChangeEngine: PropTypes.func.isRequired,
};

const driverUpgradeHelpLink = MetabaseSettings.docsUrl(
  "administration-guide/01-managing-databases",
);

function getSupersedesWarningContent(
  newDriver,
  supersedesDriver,
  onChangeEngine,
) {
  return (
    <div>
      <WarningParagraph className="text-medium m0">
        {t`This is our new ${
          allEngines[newDriver]["driver-name"]
        } driver, which is faster and more reliable.`}
      </WarningParagraph>

      <WarningParagraph className="text-medium m0" hasMargin={true}>
        {t`The old driver has been deprecated and will be removed in the next release. If you really
      need to use it, you can `}
        &nbsp;
        <a
          className="text-brand text-bold"
          onClick={() => onChangeEngine(supersedesDriver)}
        >{t`find it here`}</a>
        .
      </WarningParagraph>
    </div>
  );
}

function getSupersededByWarningContent(engine, onChangeEngine) {
  return (
    <div>
      <WarningParagraph className="text-medium m0">
        {t`This driver has been deprecated and will be removed in the next release.`}
      </WarningParagraph>
      <WarningParagraph className="text-medium m0" hasMargin={true}>
        {t`We recommend that you upgrade to the`}
        &nbsp;
        <a
          className="text-brand text-bold"
          onClick={() => onChangeEngine(engine)}
        >{t`new ${allEngines[engine]["driver-name"]} driver`}</a>
        {t`, which is faster and more reliable.`}
      </WarningParagraph>
      <ExternalLink
        href={driverUpgradeHelpLink}
        className="text-brand text-bold"
      >
        {t`How to upgrade a driver`}
      </ExternalLink>
    </div>
  );
}

function DriverWarning({ engine, hasCircle = true, onChangeEngine, ...props }) {
  const supersededBy = engineSupersedesMap["superseded_by"][engine];
  const supersedes = engineSupersedesMap["supersedes"][engine];

  if (!supersedes && !supersededBy) {
    return null;
  }

  const warningContent = supersedes
    ? getSupersedesWarningContent(engine, supersedes, onChangeEngine)
    : getSupersededByWarningContent(supersededBy, onChangeEngine);

  return (
    <DriverWarningContainer p={2} {...props}>
      <IconContainer
        align="center"
        justify="center"
        className="flex-no-shrink circular"
        hasCircle={hasCircle}
      >
        {(supersededBy && <WarningIcon size={20} name="warning" />) ||
          (supersedes && <Icon size={20} name="info" />)}
      </IconContainer>
      <CardContent className="ml2">{warningContent}</CardContent>
    </DriverWarningContainer>
  );
}

DriverWarning.propTypes = propTypes;

export default DriverWarning;

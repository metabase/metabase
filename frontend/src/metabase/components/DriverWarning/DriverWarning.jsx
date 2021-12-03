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
  Link,
  WarningIcon,
  WarningParagraph,
} from "./DriverWarning.styled";

import Icon from "metabase/components/Icon";
import MetabaseSettings from "metabase/lib/settings";

const propTypes = {
  engine: PropTypes.string.isRequired,
  hasCircle: PropTypes.bool,
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
      <WarningParagraph>
        {t`This is our new ${allEngines[newDriver]["driver-name"]} driver, which is faster and more reliable.`}
      </WarningParagraph>

      <WarningParagraph hasMargin>
        {t`The old driver has been deprecated and will be removed in a future release. If you really
      need to use it, you can `}
        &nbsp;
        <Link
          onClick={() => onChangeEngine(supersedesDriver)}
        >{t`find it here`}</Link>
        .
      </WarningParagraph>
    </div>
  );
}

function getSupersededByWarningContent(engine, onChangeEngine) {
  return (
    <div>
      <WarningParagraph>
        {t`This driver has been deprecated and will be removed in a future release.`}
      </WarningParagraph>
      <WarningParagraph hasMargin>
        {t`We recommend that you upgrade to the`}
        &nbsp;
        <Link
          onClick={() => onChangeEngine(engine)}
        >{t`new ${allEngines[engine]["driver-name"]} driver`}</Link>
        {t`, which is faster and more reliable.`}
      </WarningParagraph>
      <Link href={driverUpgradeHelpLink} target={"_blank"}>
        {t`How to upgrade a driver`}
      </Link>
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
      <IconContainer hasCircle={hasCircle}>
        {(supersededBy && <WarningIcon size={20} name="warning" />) ||
          (supersedes && <Icon size={20} name="info" />)}
      </IconContainer>
      <CardContent className="ml2">{warningContent}</CardContent>
    </DriverWarningContainer>
  );
}

DriverWarning.propTypes = propTypes;

export default DriverWarning;

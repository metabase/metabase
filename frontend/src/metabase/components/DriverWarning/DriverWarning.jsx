import React from "react";
import PropTypes from "prop-types";

import { t } from "ttag";

import {
  allEngines,
  engineSupersedesMap,
} from "metabase/entities/databases/forms";

import Warnings from "metabase/query_builder/components/Warnings";

import { CardContent, DriverWarningContainer } from "./DriverWarning.styled";

const propTypes = {
  engine: PropTypes.string.isRequired,
};

function getSupersedesFor(engine) {
  return t`This driver replaces the legacy version, which is called ${
    allEngines[engine]["driver-name"]
  }.  If you need
    to use the legacy driver, you can select it now.  Please let us know if you have any issues with this new driver.`;
}

function getSupersededByMessageFor(engine) {
  return t`This driver is a legacy driver, and will eventually be removed from Metabase.  Please use the newer version,
    which is called ${
      allEngines[engine]["driver-name"]
    }. Please let us know if you have any issues with this new
    driver.`;
}

function DriverWarning({ engine, ...props }) {
  const supersededBy = engineSupersedesMap["superseded_by"][engine];
  const supersedes = engineSupersedesMap["supersedes"][engine];

  if (!supersedes && !supersededBy) {
    return null;
  }

  const tooltipWarning = supersedes ? t`New driver` : t`Driver deprecated`;
  const message = supersedes
    ? getSupersedesFor(supersedes)
    : getSupersededByMessageFor(supersededBy);

  return (
    <DriverWarningContainer p={2} {...props}>
      <Warnings
        className="mx2 align-self-end text-gold"
        warnings={[tooltipWarning]}
        size={20}
      />
      <CardContent flexDirection="column" justify="center" className="ml2">
        <div>
          <p className="text-medium m0">{message}</p>
        </div>
      </CardContent>
    </DriverWarningContainer>
  );
}

DriverWarning.propTypes = propTypes;

export default DriverWarning;

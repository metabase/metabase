import React from "react";
import PropTypes from "prop-types";

import { t } from "ttag";

// TODO: is this really the best way?
import {
  allEngines,
  engineSupersedesMap,
} from "../../entities/databases/forms";

import { CardContent, DriverWarningContainer } from "./DriverWarning.styled";

import Warnings from "metabase/query_builder/components/Warnings";

const propTypes = {
  engine: PropTypes.string.isRequired,
};

function DriverWarning({ engine, ...props }) {
  const supersededBy = engineSupersedesMap["superseded_by"][engine];
  const supersedes = engineSupersedesMap["supersedes"][engine];

  if (supersedes) {
    return (
      <DriverWarningContainer p={2} {...props}>
        <Warnings
          className="mx2 align-self-end text-gold"
          warnings={[t`New driver`]}
          size={20}
        />

        <CardContent flexDirection="column" justify="center" className="ml2">
          <div>
            <p className="text-medium m0">
              {t`This driver replaces the legacy version, which is called ${
                allEngines[supersedes]["driver-name"]
              }.
                If you need to use the legacy driver, you can select it now.  Please let us know if you have any issues
                with this new driver.`}
            </p>
          </div>
        </CardContent>
      </DriverWarningContainer>
    );
  } else if (supersededBy) {
    return (
      <DriverWarningContainer p={2} {...props}>
        <Warnings
          className="mx2 align-self-end text-gold"
          warnings={[t`Driver deprecated`]}
          size={20}
        />
        <CardContent flexDirection="column" justify="center" className="ml2">
          <div>
            <p className="text-medium m0">
              {t`This driver is a legacy driver, and will eventually be removed from Metabase.  Please use the newer
                version, which is called ${
                  allEngines[supersededBy]["driver-name"]
                }. Please let us know if you have any
                issues with this new driver.`}
            </p>
          </div>
        </CardContent>
      </DriverWarningContainer>
    );
  } else {
    return null;
  }
}

DriverWarning.propTypes = propTypes;

export default DriverWarning;

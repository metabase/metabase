import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";

import { conjunct } from "metabase/lib/formatting";

import { Icon } from "metabase/core/components/Icon";
import Heading from "./Heading";

// TODO: will need improved formatting for operator parameter filters
function formatDefaultParamValues(parameters) {
  return parameters
    .map(parameter => {
      const value = conjunct([].concat(parameter.default), t`and`);
      return value && `${parameter.name} is ${value}`;
    })
    .filter(Boolean);
}

function DefaultParametersSection({ className, parameters }) {
  const formattedParameterValues = formatDefaultParamValues(parameters);

  return (
    <div className={cx(className, "text-bold")}>
      <Heading>
        {t`Filter values`}
        <Icon
          name="info"
          className="text-medium ml1"
          size={12}
          tooltip={t`You can customize filter values for each subscription with paid plans.`}
        />
      </Heading>
      <div className="pt1 text-small text-normal text-medium">{t`If a dashboard filter has a default value, it’ll be applied when your subscription is sent.`}</div>
      {formattedParameterValues.map((formattedValue, index) => {
        return (
          <div className="pt1 text-medium" key={index}>
            {formattedValue}
          </div>
        );
      })}
    </div>
  );
}

DefaultParametersSection.propTypes = {
  className: PropTypes.string,
  parameters: PropTypes.array.isRequired,
};

export default DefaultParametersSection;

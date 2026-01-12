import cx from "classnames";
import PropTypes from "prop-types";
import { t } from "ttag";

import { Badge } from "metabase/common/components/Badge";
import CS from "metabase/css/core/index.css";
import { conjunct } from "metabase/lib/formatting";
import { formatDateValue } from "metabase/parameters/utils/date-formatting";
import { Icon } from "metabase/ui";

import Heading from "./Heading";

// TODO: will need improved formatting for operator parameter filters
function formatDefaultParamValues(parameters) {
  return parameters
    .map((parameter) => {
      const { name, type, default: defaultValue } = parameter;

      if (!defaultValue) {
        return null;
      }

      let formattedValue;
      if (type.startsWith("date/")) {
        const values = [].concat(defaultValue);
        const formattedValues = values
          .map((val) => formatDateValue(parameter, val))
          .filter(Boolean);

        if (formattedValues.length > 0) {
          formattedValue = conjunct(formattedValues, t`and`);
        }
      } else {
        formattedValue = conjunct([].concat(defaultValue), t`and`);
      }

      if (formattedValue) {
        return { name, value: formattedValue };
      }
      return null;
    })
    .filter(Boolean);
}

function DefaultParametersSection({ className, parameters }) {
  const formattedParameterValues = formatDefaultParamValues(parameters);

  return (
    <div className={cx(className, CS.textBold)}>
      <Heading>
        {t`Filter values`}
        <Icon
          name="info"
          className={cx(CS.textMedium, CS.ml1)}
          size={12}
          tooltip={t`Customize filter values for each subscription on Pro and Enterprise plans.`}
        />
      </Heading>
      <div
        className={cx(CS.pt1, CS.textSmall, CS.textNormal, CS.textMedium)}
      >{t`If a dashboard filter has a default value, it'll be applied when your subscription is sent.`}</div>
      {formattedParameterValues.map((param, index) => {
        return (
          <div
            className={cx(CS.pt1, CS.flex, CS.alignCenter, CS.flexWrap)}
            key={index}
          >
            <Badge inactiveColor="text-primary" isSingleLine={true}>
              {param.name}: {param.value}
            </Badge>
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

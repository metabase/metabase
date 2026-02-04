import cx from "classnames";
import { t } from "ttag";

import { Badge } from "metabase/common/components/Badge";
import CS from "metabase/css/core/index.css";
import { conjunct } from "metabase/lib/formatting";
import { formatDateValue } from "metabase/parameters/utils/date-formatting";
import { Icon, Title } from "metabase/ui";
import type { Parameter } from "metabase-types/api";

interface FormattedParam {
  name: string;
  value: string;
}

// TODO: will need improved formatting for operator parameter filters
function formatDefaultParamValues(parameters: Parameter[]): FormattedParam[] {
  return parameters
    .map((parameter) => {
      const { name, type, default: defaultValue } = parameter;

      if (!defaultValue) {
        return null;
      }

      let formattedValue;
      if (type.startsWith("date/")) {
        const values = ([] as string[]).concat(defaultValue as string);
        const formattedValues = values
          .map((val) => formatDateValue(parameter, val))
          .filter((val): val is string => val != null);

        if (formattedValues.length > 0) {
          formattedValue = conjunct(formattedValues, t`and`);
        }
      } else {
        formattedValue = conjunct(
          ([] as string[]).concat(defaultValue as string),
          t`and`,
        );
      }

      if (formattedValue) {
        return { name, value: formattedValue };
      }
      return null;
    })
    .filter((item): item is FormattedParam => item !== null);
}

interface DefaultParametersSectionProps {
  className?: string;
  parameters: Parameter[];
}

function DefaultParametersSection({
  className,
  parameters,
}: DefaultParametersSectionProps) {
  const formattedParameterValues = formatDefaultParamValues(parameters);

  return (
    <div className={cx(className, CS.textBold)}>
      <Title order={4}>
        {t`Filter values`}
        <Icon
          name="info"
          className={cx(CS.textMedium, CS.ml1)}
          size={12}
          tooltip={t`Customize filter values for each subscription on Pro and Enterprise plans.`}
        />
      </Title>
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DefaultParametersSection;

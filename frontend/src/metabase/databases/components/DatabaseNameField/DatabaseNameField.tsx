import { t } from "ttag";

import FormInput from "metabase/core/components/FormInput";
import { PLUGIN_DB_ROUTING } from "metabase/plugins";
import type { Engine } from "metabase-types/api";

export interface DatabaseNameFieldProps {
  engine: Engine;
  isSlug: boolean;
  autoFocus?: boolean;
}

const DatabaseNameField = ({
  engine,
  autoFocus,
  isSlug,
  ...props
}: DatabaseNameFieldProps): JSX.Element => {
  const name = engine["driver-name"] ?? t`Database`;

  return (
    <FormInput
      name="name"
      title={isSlug ? t`Slug` : t`Display name`}
      placeholder={t`Our ${name}`}
      {...PLUGIN_DB_ROUTING.getDatabaseNameFieldProps(isSlug)}
      rightIcon="info"
      // eslint-disable-next-line no-literal-metabase-strings -- Admin settings
      rightIconTooltip={t`Choose what this data will be called in Metabase.`}
      autoFocus={autoFocus}
      data-autofocus={autoFocus}
      {...props}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseNameField;

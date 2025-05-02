import { t } from "ttag";

import FormInput from "metabase/core/components/FormInput";
import { PLUGIN_DB_ROUTING } from "metabase/plugins";
import type { Engine } from "metabase-types/api";

import type { DatabaseFormConfig } from "../DatabaseForm";

export interface DatabaseNameFieldProps {
  engine: Engine;
  config: DatabaseFormConfig;
  autoFocus?: boolean;
  onPaste?: (event: React.ClipboardEvent<HTMLInputElement>) => void;
}

const DatabaseNameField = ({
  engine,
  autoFocus,
  config,
  onPaste,
  ...props
}: DatabaseNameFieldProps): JSX.Element => {
  const name = engine["driver-name"] ?? t`Database`;
  const autoFocusProps = autoFocus
    ? { autoFocus: true, "data-autofocus": true }
    : {};

  return (
    <FormInput
      name="name"
      onPaste={onPaste}
      title={t`Display name`}
      placeholder={t`Our ${name}`}
      {...PLUGIN_DB_ROUTING.getDatabaseNameFieldProps(
        config.name?.isSlug || false,
      )}
      rightIcon="info"
      // eslint-disable-next-line no-literal-metabase-strings -- Admin settings
      rightIconTooltip={t`Choose what this data will be called in Metabase.`}
      {...autoFocusProps}
      {...props}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseNameField;

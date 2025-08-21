import { t } from "ttag";

import { FormTextInput } from "metabase/forms";
import { PLUGIN_DB_ROUTING } from "metabase/plugins";
import { Icon, Tooltip } from "metabase/ui";
import type { Engine } from "metabase-types/api";

import type { DatabaseFormConfig } from "../DatabaseForm";

export interface DatabaseNameFieldProps {
  engine: Engine;
  config: DatabaseFormConfig;
  autoFocus?: boolean;
}

export const DatabaseNameField = ({
  engine,
  autoFocus,
  config,
  ...props
}: DatabaseNameFieldProps): JSX.Element => {
  const name = engine["driver-name"] ?? t`Database`;
  const autoFocusProps = autoFocus
    ? { autoFocus: true, "data-autofocus": true }
    : {};

  return (
    <FormTextInput
      name="name"
      label={t`Display name`}
      placeholder={t`Our ${name}`}
      {...PLUGIN_DB_ROUTING.getDatabaseNameFieldProps(
        config.name?.isSlug || false,
      )}
      rightSection={
        // eslint-disable-next-line no-literal-metabase-strings -- Admin settings
        <Tooltip label={t`Choose what this data will be called in Metabase.`}>
          <Icon name="info" />
        </Tooltip>
      }
      mb="md"
      {...autoFocusProps}
      {...props}
    />
  );
};

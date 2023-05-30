import React, { useCallback } from "react";
import { useField, useFormikContext } from "formik";
import { jt, t } from "ttag";
import { useUniqueId } from "metabase/hooks/use-unique-id";
import Link from "metabase/core/components/Link/Link";
import { FormField } from "metabase/core/components/FormField";
import { DatabaseData } from "metabase-types/api";
import DatabaseCacheTimeInput from "../DatabaseCacheTimeInput";

const FIELD = "cache_ttl";
const SECTION = "advanced-options";

const DatabaseCacheTimeField = () => {
  const id = useUniqueId();
  const [{ value, onBlur }, { error, touched }, { setValue }] = useField(FIELD);
  const { values } = useFormikContext<DatabaseData>();

  const handleChange = useCallback(
    (value?: number) => setValue(value != null ? value : null),
    [setValue],
  );

  if (!values.details[SECTION]) {
    return null;
  }

  return (
    <FormField
      title={t`Default result cache duration`}
      description={<DatabaseCacheTimeDescription />}
      htmlFor={id}
      error={touched ? error : undefined}
    >
      <DatabaseCacheTimeInput
        id={id}
        name={FIELD}
        value={value ?? undefined}
        error={touched && error != null}
        onChange={handleChange}
        onBlur={onBlur}
      />
    </FormField>
  );
};

const DatabaseCacheTimeDescription = (): JSX.Element => {
  return (
    <div>
      {jt`How long to keep question results. By default, Metabase will use the value you supply on the ${(
        <Link key="link" to="/admin/settings/caching">
          {t`cache settings page`}
        </Link>
      )}, but if this database has other factors that influence the freshness of data, it could make sense to set a custom duration. You can also choose custom durations on individual questions or dashboards to help improve performance.`}
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseCacheTimeField;

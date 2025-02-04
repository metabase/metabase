import { P, match } from "ts-pattern";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { Button, Icon } from "metabase/ui";
import { useGetFixedSqlQuery } from "metabase-enterprise/api";
import type * as Lib from "metabase-lib";
import type { DatasetError } from "metabase-types/api";

import { getFixRequest, getFixedQuery } from "./utils";

type MetabotFixSqlButtonProps = {
  query: Lib.Query;
  queryError: DatasetError;
  onChange: (newQuery: Lib.Query) => void;
};

export function FixSqlButton({
  query,
  queryError,
  onChange,
}: MetabotFixSqlButtonProps) {
  const request = getFixRequest(query, queryError);
  const { data, error, isFetching } = useGetFixedSqlQuery(request ?? skipToken);

  const handleClick = () => {
    if (data) {
      onChange(getFixedQuery(query, data.fixes));
    }
  };

  if (!request) {
    return null;
  }

  const props = match({ data, error, isFetching })
    .with({ isFetching: true }, () => ({
      loading: true,
      children: t`Trying to find a fix`,
    }))
    .with({ data: P.nonNullable, error: P.nullish }, () => ({
      leftIcon: <Icon name="metabot" />,
      children: t`Have Metabot fix it`,
    }))
    .otherwise(() => ({
      disabled: true,
      leftIcon: <Icon name="metabot" />,
      children: t`Metabot can't fix it`,
    }));

  return <Button {...props} onClick={handleClick} />;
}

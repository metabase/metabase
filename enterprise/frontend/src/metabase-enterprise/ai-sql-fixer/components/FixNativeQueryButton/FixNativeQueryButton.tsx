import { P, match } from "ts-pattern";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import type { FixNativeQueryButtonProps } from "metabase/plugins";
import { Button, Icon } from "metabase/ui";
import { useGetFixedNativeQueryQuery } from "metabase-enterprise/api";

import { getFixRequest, getFixedQuery } from "./utils";

export function FixNativeQueryButton({
  query,
  queryError,
  onQueryFix,
}: FixNativeQueryButtonProps) {
  const request = getFixRequest(query, queryError);
  const { data, error, isFetching } = useGetFixedNativeQueryQuery(
    request ?? skipToken,
  );

  const handleClick = () => {
    if (data) {
      onQueryFix(getFixedQuery(query, data.fixes));
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
      leftIcon: <Icon name="metabot_sad" />,
      children: t`Metabot can't fix it`,
    }));

  return <Button {...props} onClick={handleClick} />;
}

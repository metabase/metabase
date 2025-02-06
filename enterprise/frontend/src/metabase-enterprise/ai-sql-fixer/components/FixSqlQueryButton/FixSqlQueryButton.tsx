import { P, match } from "ts-pattern";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import type { FixSqlQueryButtonProps } from "metabase/plugins";
import { Button, Icon } from "metabase/ui";
import { useGetFixedSqlQueryQuery } from "metabase-enterprise/api";

import { getFixRequest, getFixedLineNumbers, getFixedQuery } from "./utils";

export function FixSqlQueryButton({
  query,
  queryError,
  queryErrorType,
  onQueryFix,
  onHighlightLines,
}: FixSqlQueryButtonProps) {
  const request = getFixRequest(query, queryError, queryErrorType);
  const { data, error, isFetching } = useGetFixedSqlQueryQuery(
    request ?? skipToken,
  );

  const handleClick = () => {
    if (data) {
      const fixedQuery = getFixedQuery(query, data.fixes);
      const fixedLineNumbers = getFixedLineNumbers(data.fixes);
      onQueryFix(fixedQuery, fixedLineNumbers);
    }
  };

  const handleMouseEnter = () => {
    if (data) {
      onHighlightLines(getFixedLineNumbers(data.fixes));
    }
  };

  const handleMouseLeave = () => {
    onHighlightLines([]);
  };

  if (!request) {
    return null;
  }

  const props = match({ data, error, isFetching })
    .with({ isFetching: true }, () => ({
      loading: true,
      children: t`Trying to find a fix`,
    }))
    .with({ data: { fixes: [P._, ...P.array()] }, error: P.nullish }, () => ({
      leftIcon: <Icon name="metabot" />,
      children: t`Have Metabot fix it`,
    }))
    .otherwise(() => ({
      disabled: true,
      leftIcon: <Icon name="metabot_sad" />,
      children: t`Metabot can't fix it`,
    }));

  return (
    <Button
      {...props}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    />
  );
}

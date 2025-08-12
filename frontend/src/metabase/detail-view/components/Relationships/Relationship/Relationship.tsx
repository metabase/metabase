import cx from "classnames";
import { inflect } from "inflection";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Loader, Stack, Text, rem } from "metabase/ui";
import type { ForeignKey } from "metabase-types/api";

import S from "./Relationship.module.css";

interface Props {
  fk: ForeignKey;
  fkCount: number;
  fkCountInfo: { status: number; value: number } | undefined;
  onClick: (fk: ForeignKey) => void;
}

export const Relationship = ({ fk, fkCount, fkCountInfo, onClick }: Props) => {
  const fkCountValue = fkCountInfo?.value || 0;
  const isLoaded = fkCountInfo?.status === 1;
  const fkClickable = isLoaded && Boolean(fkCountInfo.value);
  const originTableName = fk.origin?.table?.display_name ?? "";
  const relationName = inflect(originTableName, fkCountValue);

  return (
    <Stack
      className={cx({
        [S.clickable]: fkClickable,
      })}
      gap={rem(12)}
      onClick={fkClickable ? () => onClick(fk) : undefined}
    >
      <Text
        c={fkCountValue === 0 ? "text-light" : "text-medium"}
        className={S.text}
        fw="bold"
        fz={rem(24)}
        lh={1}
      >
        {isLoaded ? fkCountValue : <Loader size="xs" />}
      </Text>

      <Text
        c={fkCountValue === 0 ? "text-light" : "text-medium"}
        className={S.text}
        fw="bold"
        lh={1}
      >
        {relationName}

        {fkCount > 1 && (
          <span className={cx(CS.textMedium, CS.textNormal)}>
            {" "}
            {t`via ${originTableName}`}
          </span>
        )}
      </Text>
    </Stack>
  );
};

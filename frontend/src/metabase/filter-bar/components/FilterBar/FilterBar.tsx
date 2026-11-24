import { useMemo } from "react";
import { t } from "ttag";

import { ActionIcon, Flex, Icon } from "metabase/ui";

import { isHiddenToken } from "../../model/is-hidden-token";
import { stagesToTokens } from "../../model/stages-to-tokens";
import { getStageIndex } from "../../model/utils";
import type { FilterBarProps } from "../../types";
import { FilterBarToken } from "../FilterBarToken/FilterBarToken";

export const FilterBar = <F,>({
  value,
  onChange,
  adapter,
}: FilterBarProps<F>) => {
  const tokens = useMemo(
    () => stagesToTokens(value, adapter),
    [value, adapter],
  );

  return (
    <Flex
      wrap="wrap"
      align="center"
      gap="sm"
      mih="3rem"
      py="md"
      px="xxl"
      bg="background_page-secondary"
    >
      {tokens.map((token, index) =>
        isHiddenToken(tokens, index) ? null : (
          <FilterBarToken
            key={index}
            token={token}
            stageAdapter={adapter.stage(getStageIndex(tokens, index))}
          />
        ),
      )}
      {tokens.length > 0 && (
        <ActionIcon
          ml="auto"
          my="-xxs"
          size="md"
          variant="subtle"
          aria-label={t`Clear all filters`}
          onClick={() => onChange([])}
        >
          <Icon name="trash" />
        </ActionIcon>
      )}
    </Flex>
  );
};

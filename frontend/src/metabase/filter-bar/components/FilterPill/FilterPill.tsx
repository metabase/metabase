import { P, match } from "ts-pattern";
import { t } from "ttag";

import { ActionIcon, FixedSizeIcon, Flex, Icon } from "metabase/ui";

import {
  type FilterParts,
  type PillContent,
  isExpressionPillContent,
  isOpaquePillContent,
  isPartsPillContent,
} from "../../types";
import { PillPart } from "../PillPart/PillPart";
import { PillParts } from "../PillParts/PillParts";

import S from "./FilterPill.module.css";

type FilterPillProps = {
  content: PillContent;
  formatValues: (parts: FilterParts) => string;
  isSelected: boolean;
  hasError: boolean;
  onRemove: () => void;
};

export const FilterPill = ({
  content,
  formatValues,
  isSelected,
  hasError,
  onRemove,
}: FilterPillProps) => {
  const isOpaque = isOpaquePillContent(content);

  return (
    <Flex
      className={S.pill}
      component="span"
      align="center"
      gap="xxs"
      py="xxs"
      pr="xs"
      pl={isOpaque ? "sm" : "xxs"}
      bdrs="lg"
      bg="background_surface-primary"
      data-testid="filter-pill"
      data-selected={isSelected || undefined}
      data-error={hasError || undefined}
    >
      <Flex
        className={S.parts}
        component="span"
        align="center"
        gap={isOpaque ? "xxxs" : 0}
        pr="xxs"
      >
        {match(content)
          .with(P.when(isOpaquePillContent), ({ displayName, icon }) => (
            <>
              <FixedSizeIcon name={icon} size={10} c="core-filter-strong" />
              <PillPart variant="value">{displayName}</PillPart>
            </>
          ))
          .with(P.when(isExpressionPillContent), ({ expression }) => (
            <PillPart variant="expression">{expression}</PillPart>
          ))
          .with(P.when(isPartsPillContent), ({ parts }) => (
            <PillParts parts={parts} formatValues={formatValues} />
          ))
          .exhaustive()}
      </Flex>
      <ActionIcon
        size="xs"
        variant="subtle"
        aria-label={t`Remove filter`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
      >
        <Icon name="close" />
      </ActionIcon>
    </Flex>
  );
};

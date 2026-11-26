import { P, match } from "ts-pattern";

import { FixedSizeIcon, Flex } from "metabase/ui";

import {
  type FilterParts,
  type PillContent,
  isExpressionPillContent,
  isOpaquePillContent,
  isPartsPillContent,
} from "../../types";
import { PillFrame } from "../PillFrame/PillFrame";
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
    <PillFrame
      isSelected={isSelected}
      hasError={hasError}
      pl={isOpaque ? "sm" : "xxs"}
      onRemove={onRemove}
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
    </PillFrame>
  );
};

import { c, t } from "ttag";

import { Icon, Menu, Title, UnstyledButton } from "metabase/ui";

import { ANALYSIS_KINDS, getAnalysisConfig } from "../analyses/config";
import type { AnalysisKind } from "../spec/types";

import S from "./AnalysisTitle.module.css";

type AnalysisTitleProps = {
  kind: AnalysisKind;
  tableName: string;
  /** A saved analysis shows its name, as a plain heading. */
  savedName?: string;
  /** For a new analysis: the kind in the title opens a menu of the kinds. */
  onKindChange?: (kind: AnalysisKind) => void;
};

/** The title of a new analysis, e.g. "Funnel analysis on Events". */
export const getNewAnalysisTitle = (
  kind: AnalysisKind,
  tableName: string,
): string => {
  const name = getAnalysisConfig(kind).name;
  return c("{0} is a type of analysis, e.g. Funnel; {1} is a table name")
    .t`${name} analysis on ${tableName}`;
};

export const AnalysisTitle = ({
  kind,
  tableName,
  savedName,
  onKindChange,
}: AnalysisTitleProps) => {
  if (onKindChange === undefined) {
    return (
      <Title order={3} fw="normal">
        {savedName ?? getNewAnalysisTitle(kind, tableName)}
      </Title>
    );
  }
  const kindMenu = (
    <Menu key="kind" position="bottom-start" shadow="md">
      <Menu.Target>
        <UnstyledButton
          className={S.kindButton}
          aria-label={t`Type of analysis`}
        >
          {getAnalysisConfig(kind).name}
          <Icon name="chevrondown" size={12} c="text-secondary" />
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        {ANALYSIS_KINDS.map((item) => (
          <Menu.Item
            key={item}
            fw={item === kind ? "bold" : undefined}
            onClick={() => onKindChange(item)}
          >
            {getAnalysisConfig(item).name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
  return (
    <Title order={3} fw="normal">
      {c("{0} is a type of analysis, e.g. Funnel; {1} is a table name")
        .jt`${kindMenu} analysis on ${tableName}`}
    </Title>
  );
};

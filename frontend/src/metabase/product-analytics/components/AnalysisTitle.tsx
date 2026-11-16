import { c, t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { QUESTION_NAME_MAX_LENGTH } from "metabase/common/utils/card";
import { Title } from "metabase/ui";

import { getAnalysisConfig } from "../analyses/config";
import type { AnalysisKind } from "../spec/types";

// EditableText's padding and border, so its text lines up with a plain title.
const EDITABLE_TEXT_INSET = "calc(-0.25rem - 1px)";

type AnalysisTitleProps = {
  kind: AnalysisKind;
  tableName: string;
  /** A saved analysis shows its name. */
  savedName?: string;
  /** Makes a saved analysis's name editable, as in the query builder. */
  onRename?: (name: string) => void;
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
  onRename,
}: AnalysisTitleProps) => {
  if (savedName !== undefined && onRename !== undefined) {
    return (
      <EditableText
        initialValue={savedName}
        placeholder={t`Add title`}
        maxLength={QUESTION_NAME_MAX_LENGTH}
        fz="h3"
        lh="h3"
        m={EDITABLE_TEXT_INSET}
        // Only as wide as the name, so the hover border hugs the text rather
        // than stretching across the header.
        style={{ alignSelf: "flex-start" }}
        onChange={onRename}
        data-testid="analysis-title"
      />
    );
  }
  return (
    <Title order={3} fw="normal">
      {savedName ?? getNewAnalysisTitle(kind, tableName)}
    </Title>
  );
};

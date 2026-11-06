import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { DetailsRow } from "metabase/common/components/DetailSidebar";
import {
  type ResolvedSubject,
  type RowNouns,
  getTableSubjectLabel,
  useTableSemantics,
} from "metabase/metadata/semantic-types";
import { Divider, Flex } from "metabase/ui";
import type { Table } from "metabase-types/api";

import {
  DETAILS_CELL_INPUT_CLASS_NAMES,
  DetailsEditableText,
} from "../../DetailPanel";
import { SubjectSelect } from "../../SemanticInputs";
import { InferredValue } from "../InferenceReview";

interface TableSubjectRowsProps {
  table: Table;
  disabled: boolean;
}

export function TableSubjectRow({ table, disabled }: TableSubjectRowsProps) {
  const { subject, setTableSubject } = useTableSemantics(table);
  const [isSelectOpenOnMount, { open: openSelectOnMount }] =
    useDisclosure(false);
  const inferredSubject = subject.inference.subject;
  const unconfirmedSubject = subject.hasSuggestion ? subject.subject : null;

  return (
    <DetailsRow
      label={t`Subject`}
      fillValue
      value={
        unconfirmedSubject != null ? (
          <InferredValue
            value={getTableSubjectLabel(unconfirmedSubject)}
            inference={getSubjectInference(subject)}
            readOnly={disabled}
            onConfirm={() => setTableSubject(table, unconfirmedSubject)}
            onChange={() => {
              openSelectOnMount();
              setTableSubject(table, unconfirmedSubject);
            }}
            data-testid="table-subject-review"
          />
        ) : (
          <SubjectSelect
            value={subject.subject}
            markedValue={
              subject.subject !== inferredSubject ? inferredSubject : null
            }
            classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
            disabled={disabled}
            isOpenOnMount={isSelectOpenOnMount}
            onChange={(value) => setTableSubject(table, value)}
          />
        )
      }
    />
  );
}

export function TableRowNounsRow({ table, disabled }: TableSubjectRowsProps) {
  const { subject, setRowNouns } = useTableSemantics(table);

  return (
    <DetailsRow
      label={t`Rows are called`}
      fillValue
      value={
        <RowNounsInput
          key={`${subject.rowNouns.singular}/${subject.rowNouns.plural}`}
          rowNouns={subject.rowNouns}
          disabled={disabled}
          onChange={(rowNouns) => setRowNouns(table, rowNouns)}
        />
      }
    />
  );
}

function getSubjectInference({
  inference,
  isOverridden,
}: ResolvedSubject): string | null {
  return isOverridden ? null : t`Inferred: ${inference.signal}`;
}

function RowNounsInput({
  rowNouns,
  disabled,
  onChange,
}: {
  rowNouns: RowNouns;
  disabled: boolean;
  onChange: (rowNouns: Partial<RowNouns>) => void;
}) {
  return (
    <Flex flex={1} miw={0}>
      <DetailsEditableText
        initialValue={rowNouns.singular}
        placeholder={t`One row`}
        isDisabled={disabled}
        onChange={(value) => onChange({ singular: value.trim() })}
        data-testid="table-row-noun-singular-input"
      />
      <Divider orientation="vertical" />
      <DetailsEditableText
        initialValue={rowNouns.plural}
        placeholder={t`Many rows`}
        isDisabled={disabled}
        onChange={(value) => onChange({ plural: value.trim() })}
        data-testid="table-row-noun-plural-input"
      />
    </Flex>
  );
}

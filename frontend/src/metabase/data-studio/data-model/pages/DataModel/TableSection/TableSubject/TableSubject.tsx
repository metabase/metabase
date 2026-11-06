import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { DetailsRow } from "metabase/common/components/DetailSidebar";
import {
  type ResolvedSubject,
  getTableSubjectLabel,
  useTableSemantics,
} from "metabase/metadata/semantic-types";
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
    <>
      <DetailsRow
        label={t`One row is called`}
        fillValue
        value={
          <DetailsEditableText
            key={subject.rowNouns.singular}
            initialValue={subject.rowNouns.singular}
            placeholder={subject.defaultRowNouns.singular}
            isDisabled={disabled}
            onChange={(value) => setRowNouns(table, { singular: value.trim() })}
            data-testid="table-row-noun-singular-input"
          />
        }
      />
      <DetailsRow
        label={t`Many rows are called`}
        fillValue
        value={
          <DetailsEditableText
            key={subject.rowNouns.plural}
            initialValue={subject.rowNouns.plural}
            placeholder={subject.defaultRowNouns.plural}
            isDisabled={disabled}
            onChange={(value) => setRowNouns(table, { plural: value.trim() })}
            data-testid="table-row-noun-plural-input"
          />
        }
      />
    </>
  );
}

function getSubjectInference({
  inference,
  isOverridden,
}: ResolvedSubject): string | null {
  return isOverridden ? null : t`Inferred: ${inference.signal}`;
}

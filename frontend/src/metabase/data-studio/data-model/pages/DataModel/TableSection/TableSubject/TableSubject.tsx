import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { DetailsRow } from "metabase/common/components/DetailSidebar";
import {
  type ResolvedSubject,
  type RowNouns,
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

type RowNounForm = keyof RowNouns;

function getRowNounLabels(): Record<RowNounForm, string> {
  return {
    singular: t`One row is called`,
    plural: t`Many rows are called`,
  };
}

export function TableRowNounRow({
  table,
  disabled,
  form,
}: TableSubjectRowsProps & { form: RowNounForm }) {
  const { subject, setRowNouns } = useTableSemantics(table);
  const rowNoun = subject.rowNouns[form];

  return (
    <DetailsRow
      label={getRowNounLabels()[form]}
      fillValue
      value={
        <DetailsEditableText
          key={rowNoun}
          initialValue={rowNoun}
          placeholder={subject.defaultRowNouns[form]}
          isDisabled={disabled}
          onChange={(value) => setRowNouns(table, { [form]: value.trim() })}
          data-testid={`table-row-noun-${form}-input`}
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

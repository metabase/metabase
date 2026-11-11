import { useState } from "react";
import { t } from "ttag";

import { SubjectSelect } from "metabase/data-studio/data-model/pages/DataModel/SemanticInputs";
import { useTableSemantics } from "metabase/metadata/semantic-types";
import { Input, Stack, TextInput } from "metabase/ui";
import type { Table } from "metabase-types/api";

type TableSubjectFieldsProps = {
  table: Table;
  readOnly: boolean;
};

/**
 * PROTOTYPE: mocked. What the table's rows are about, and what one and many
 * rows are called. Inferred until an admin picks; picks live in the
 * prototype's browser storage.
 */
export function TableSubjectFields({
  table,
  readOnly,
}: TableSubjectFieldsProps) {
  const { subject, setTableSubject, setRowNouns } = useTableSemantics(table);
  const inferredSubject = subject.inference.subject;

  return (
    <Stack gap="xxl">
      <Input.Wrapper label={t`Subject`}>
        <SubjectSelect
          w="fit-content"
          value={subject.subject}
          markedValue={
            subject.subject !== inferredSubject ? inferredSubject : null
          }
          disabled={readOnly}
          onChange={(value) => setTableSubject(table, value)}
        />
      </Input.Wrapper>
      <RowNounInput
        // Fresh input whenever the saved name changes elsewhere
        key={`singular:${subject.rowNouns.singular}`}
        label={t`One row is called`}
        value={subject.rowNouns.singular}
        placeholder={subject.defaultRowNouns.singular}
        disabled={readOnly}
        onCommit={(singular) => setRowNouns(table, { singular })}
      />
      <RowNounInput
        key={`plural:${subject.rowNouns.plural}`}
        label={t`Many rows are called`}
        value={subject.rowNouns.plural}
        placeholder={subject.defaultRowNouns.plural}
        disabled={readOnly}
        onCommit={(plural) => setRowNouns(table, { plural })}
      />
    </Stack>
  );
}

type RowNounInputProps = {
  label: string;
  value: string;
  placeholder: string;
  disabled: boolean;
  onCommit: (value: string) => void;
};

/** Saves on blur or Enter; clearing it goes back to the default name */
function RowNounInput({
  label,
  value,
  placeholder,
  disabled,
  onCommit,
}: RowNounInputProps) {
  const [draft, setDraft] = useState(value);
  const commit = () => {
    const next = draft.trim();
    if (next !== value) {
      onCommit(next);
    }
  };

  return (
    <TextInput
      label={label}
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
    />
  );
}

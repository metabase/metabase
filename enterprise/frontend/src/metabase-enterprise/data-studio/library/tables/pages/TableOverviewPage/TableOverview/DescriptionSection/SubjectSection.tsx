import { t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { SubjectSelect } from "metabase/data-studio/data-model/pages/DataModel/SemanticInputs";
import { useTableSemantics } from "metabase/metadata/semantic-types";
import { Flex, Stack, Text } from "metabase/ui";
import type { Table } from "metabase-types/api";

import S from "./DescriptionSection.module.css";

type SubjectSectionProps = {
  table: Table;
};

/**
 * PROTOTYPE: mocked. What the table's rows are about, and what one and many
 * rows are called. Inferred until an admin picks; picks live in the
 * prototype's browser storage.
 */
export function SubjectSection({ table }: SubjectSectionProps) {
  const { subject, setTableSubject, setRowNouns } = useTableSemantics(table);
  const inferredSubject = subject.inference.subject;

  return (
    <Stack gap="md" px="xl" py="lg" data-testid="table-subject-section">
      <Flex justify="space-between" align="center">
        <Text size="md" c="text-secondary">
          {t`Subject`}
        </Text>
        <SubjectSelect
          value={subject.subject}
          markedValue={
            subject.subject !== inferredSubject ? inferredSubject : null
          }
          classNames={{
            root: S.gridLabelInput,
            input: S.input,
            section: subject.subject != null ? S.sectionLabel : undefined,
          }}
          onChange={(value) => setTableSubject(table, value)}
        />
      </Flex>
      <RowNounRow
        label={t`One row is called`}
        value={subject.rowNouns.singular}
        placeholder={subject.defaultRowNouns.singular}
        onChange={(singular) => setRowNouns(table, { singular })}
      />
      <RowNounRow
        label={t`Many rows are called`}
        value={subject.rowNouns.plural}
        placeholder={subject.defaultRowNouns.plural}
        onChange={(plural) => setRowNouns(table, { plural })}
      />
    </Stack>
  );
}

type RowNounRowProps = {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
};

function RowNounRow({ label, value, placeholder, onChange }: RowNounRowProps) {
  return (
    <Flex justify="space-between" align="center" gap="md">
      <Text size="md" c="text-secondary">
        {label}
      </Text>
      <EditableText
        key={value}
        initialValue={value}
        placeholder={placeholder}
        onChange={(nextValue) => onChange(nextValue.trim())}
      />
    </Flex>
  );
}

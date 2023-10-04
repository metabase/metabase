import { useCallback, useMemo } from "react";
import { t, ngettext, msgid } from "ttag";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";

import * as Urls from "metabase/lib/urls";
import { getSemanticTypeIcon } from "metabase/lib/schema_metadata";

import type Field from "metabase-lib/metadata/Field";
import type Question from "metabase-lib/Question";

import {
  SchemaHeader,
  FieldList,
  FieldListItem,
  FieldTitle,
  FieldIcon,
} from "./ModelSchemaDetails.styled";

interface Props {
  model: Question;
  hasEditMetadataLink: boolean;
}

function ModelSchemaDetails({ model, hasEditMetadataLink }: Props) {
  const canWrite = model.canWrite();

  const metadataEditorUrl = Urls.modelEditor(model.card(), {
    type: "metadata",
  });

  const fields = useMemo(() => model.table()?.fields || [], [model]);

  const fieldsCount = useMemo(() => {
    return ((count: number) =>
      ngettext(msgid`${count} field`, `${count} fields`, count))(fields.length);
  }, [fields]);

  const renderField = useCallback((field: Field) => {
    const icon = getSemanticTypeIcon(field.semantic_type, "warning");
    const tooltip = field.semantic_type ? null : t`Unknown type`;
    return (
      <FieldListItem key={field.getUniqueId()}>
        <FieldIcon name={icon} tooltip={tooltip} />
        <FieldTitle>{field.displayName()}</FieldTitle>
      </FieldListItem>
    );
  }, []);

  return (
    <>
      <SchemaHeader>
        <span>{fieldsCount}</span>
        {hasEditMetadataLink && canWrite && (
          <Button as={Link} to={metadataEditorUrl}>{t`Edit metadata`}</Button>
        )}
      </SchemaHeader>
      <FieldList>{fields.map(renderField)}</FieldList>
    </>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModelSchemaDetails;

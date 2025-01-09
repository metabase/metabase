import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import * as Urls from "metabase/lib/urls";
import type Question from "metabase-lib/v1/Question";

import { SchemaHeader } from "./ModelSchemaDetails.styled";

interface Props {
  model: Question;
  hasEditMetadataLink: boolean;
}

function ModelSchemaDetails({ model, hasEditMetadataLink }: Props) {
  const canWrite = model.canWrite();

  const metadataEditorUrl = Urls.modelEditor(model.card(), {
    type: "metadata",
  });

  return (
    <>
      <SchemaHeader>
        <span>{fieldsCount}</span>
        {hasEditMetadataLink && canWrite && (
          <Button as={Link} to={metadataEditorUrl}>{t`Edit metadata`}</Button>
        )}
      </SchemaHeader>
    </>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModelSchemaDetails;

import { useFormikContext } from "formik";
import { c, t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { FormFooter } from "metabase/common/components/FormFooter";
import { useDocsUrl, useSetting } from "metabase/common/hooks";
import type {
  ContinueWithoutDataComponent,
  FormLocation,
} from "metabase/databases/types";
import { FormSubmitButton } from "metabase/forms/components/FormSubmitButton";
import { Button, Flex, Text } from "metabase/ui";
import type { DatabaseData } from "metabase-types/api";

import { DatabaseFormError } from "../DatabaseFormError";

import { useHasConnectionError, useIsFormDirty } from "./utils";

interface DatabaseFormFooterProps {
  isAdvanced: boolean;
  onCancel?: () => void;
  showSampleDatabase?: boolean;
  ContinueWithoutDataSlot?: ContinueWithoutDataComponent;
  location: FormLocation;
}

export const DatabaseFormFooter = ({
  isAdvanced,
  onCancel,
  showSampleDatabase,
  ContinueWithoutDataSlot,
  location,
}: DatabaseFormFooterProps) => {
  const { values } = useFormikContext<DatabaseData>();
  const isNew = values.id == null;
  const hasConnectionError = useHasConnectionError();
  const isDirty = useIsFormDirty();

  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- Metabase setup + admin pages only
  const { url: docsUrl } = useDocsUrl("databases/connecting");

  const hasSampleDatabase = useSetting("has-sample-database?");

  if (isAdvanced) {
    return (
      <FormFooter
        data-testid="form-footer"
        px={location === "full-page" ? undefined : "xl"}
      >
        <Flex justify="space-between" align="center" w="100%">
          {isNew ? (
            <ExternalLink
              key="link"
              href={docsUrl}
              style={{ fontWeight: 500, fontSize: ".875rem" }}
            >
              {t`Need help connecting?`}
            </ExternalLink>
          ) : (
            <div />
          )}

          <Flex gap="sm">
            <Button onClick={onCancel}>{t`Cancel`}</Button>
            <FormSubmitButton
              disabled={!isDirty}
              label={isNew ? t`Save` : t`Save changes`}
              variant="filled"
            />
          </Flex>
        </Flex>
      </FormFooter>
    );
  }

  if (values.engine) {
    return (
      <FormFooter data-testid="form-footer">
        {hasConnectionError && <DatabaseFormError />}
        <Button onClick={onCancel}>{t`Skip`}</Button>
        <FormSubmitButton variant="filled" label={t`Connect database`} />
      </FormFooter>
    );
  }

  if (ContinueWithoutDataSlot) {
    return <ContinueWithoutDataSlot onCancel={onCancel} />;
  }

  // This check happens only during setup where we cannot fetch databases.
  // Unless someone explicitly set the environment variable MB_LOAD_SAMPLE_CONTENT
  // to false, we can assume that the instance loads with the Sample Database.
  // https://www.metabase.com/docs/latest/configuring-metabase/environment-variables#mb_load_sample_content
  if (hasSampleDatabase !== false && showSampleDatabase) {
    const sampleDatabaseLabel = (
      <strong key="sample">{t`Sample Database`}</strong>
    );
    return (
      <>
        <Button variant="filled" mb="md" mt="lg" onClick={onCancel}>
          {t`Continue with sample data`}
        </Button>
        <Text fz="sm">
          {c("{0} is 'Sample Database'").jt`Use our ${
            sampleDatabaseLabel
          } to explore and test the app.`}
        </Text>
        <Text fz="sm">{t`Add your own data at any time.`}</Text>
      </>
    );
  }

  return (
    <Button variant="filled" mt="lg" onClick={onCancel}>
      {t`I'll add my data later`}
    </Button>
  );
};

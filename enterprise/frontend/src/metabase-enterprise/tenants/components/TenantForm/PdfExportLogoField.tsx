import { useField } from "formik";
import { type ChangeEvent, useRef, useState } from "react";
import { t } from "ttag";

import {
  Box,
  Button,
  Flex,
  Icon,
  Image,
  Input,
  Paper,
  Text,
} from "metabase/ui";
import {
  ACCEPTED_IMAGE_TYPES,
  readImageFile,
} from "metabase-enterprise/whitelabel/lib/image-file";
import type { Tenant } from "metabase-types/api";

const FIELD_NAME = "pdf_export_logo";
const INPUT_ID = "tenant-pdf-export-logo";
const PREVIEW_WIDTH = 100;
const PREVIEW_HEIGHT = 48;

export const PdfExportLogoField = () => {
  const [{ value }, , { setValue }] =
    useField<Tenant["pdf_export_logo"]>(FIELD_NAME);
  const [errorMessage, setErrorMessage] = useState<string>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Lets the same file be chosen again after it was removed.
    event.target.value = "";
    if (!file) {
      return;
    }

    const result = await readImageFile(file);
    if (result.status === "error") {
      setErrorMessage(result.message);
      return;
    }
    setErrorMessage(undefined);
    setValue(result.dataUri);
  };

  const handleRemove = () => {
    setErrorMessage(undefined);
    setValue(null);
  };

  return (
    <Box mb="xxl">
      <Input.Wrapper
        label={t`Logo in PDF exports`}
        description={t`Shown at the top of dashboards this tenant's users export to PDF. Leave it empty to use the instance's PDF export logo.`}
        error={errorMessage}
        id={INPUT_ID}
      >
        <Paper withBorder shadow="none" p="md" mt="xs">
          <Flex align="center" gap="lg">
            <Flex
              w={PREVIEW_WIDTH}
              h={PREVIEW_HEIGHT}
              align="center"
              justify="center"
            >
              {value && (
                <Image
                  src={value}
                  alt={t`Logo preview`}
                  w={PREVIEW_WIDTH}
                  h={PREVIEW_HEIGHT}
                  fit="contain"
                />
              )}
            </Flex>
            <Button onClick={() => fileInputRef.current?.click()}>
              {t`Choose File`}
            </Button>
            <input
              id={INPUT_ID}
              data-testid="pdf-export-logo-file-input"
              ref={fileInputRef}
              hidden
              type="file"
              accept={ACCEPTED_IMAGE_TYPES}
              multiple={false}
              onChange={handleFileChange}
            />
            {value ? (
              <Button
                variant="subtle"
                color="neutral"
                size="sm"
                leftSection={<Icon name="close" />}
                onClick={handleRemove}
                aria-label={t`Remove logo`}
              />
            ) : (
              <Text c="text-secondary">{t`No file chosen`}</Text>
            )}
          </Flex>
        </Paper>
      </Input.Wrapper>
    </Box>
  );
};

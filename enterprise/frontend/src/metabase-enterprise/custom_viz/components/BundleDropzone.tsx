import cx from "classnames";
import { useField } from "formik";
import { useCallback } from "react";
import { type FileRejection, useDropzone } from "react-dropzone";
import { match } from "ts-pattern";
import { t } from "ttag";

import { Box, Icon, Stack, Text } from "metabase/ui";

import S from "./BundleDropzone.module.css";

export const MAX_BUNDLE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_EXTENSIONS = [".tgz", ".tar.gz"];

export const hasAllowedExtension = (name: string): boolean => {
  const lower = name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
};

const ACCEPT_TYPES = {
  "application/gzip": ALLOWED_EXTENSIONS,
  "application/x-gzip": ALLOWED_EXTENSIONS,
  "application/x-tar": ALLOWED_EXTENSIONS,
};

export function BundleDropzone({ name = "file" }: { name?: string }) {
  const [{ value: file }, { error, touched }, { setValue, setTouched }] =
    useField<File | null>(name);

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      setTouched(true);
      if (accepted[0]) {
        setValue(accepted[0]);
        return;
      }
      if (rejected[0]) {
        setValue(null);
      }
    },
    [setValue, setTouched],
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } =
    useDropzone({
      onDrop,
      multiple: false,
      maxSize: MAX_BUNDLE_BYTES,
      accept: ACCEPT_TYPES,
    });

  const showError = touched && !!error;
  const rejectionMessage = fileRejections[0]?.errors[0]?.code
    ? match(fileRejections[0].errors[0].code)
        .with(
          "file-invalid-type",
          () => t`Bundle must be a .tgz file produced by "npm run build".`,
        )
        .with("file-too-large", () => t`Bundle must be smaller than 5 MB.`)
        .otherwise(() => t`This file isn't a valid plugin bundle.`)
    : null;

  return (
    <Stack>
      <Box
        {...getRootProps()}
        className={cx(S.dropzone, {
          [S.dropzoneActive]: isDragActive,
          [S.dropzoneError]: showError || !!rejectionMessage,
        })}
        role="button"
        tabIndex={0}
      >
        <input {...getInputProps()} />
        {file ? (
          <SelectedFile file={file} />
        ) : (
          <DropHint isDragActive={isDragActive} />
        )}
      </Box>
      {(rejectionMessage || showError) && (
        <Text c="error" size="sm">
          {rejectionMessage ?? error}
        </Text>
      )}
    </Stack>
  );
}

function DropHint({ isDragActive }: { isDragActive: boolean }) {
  return (
    <>
      <Icon name="upload" size={24} c="text-secondary" />
      <Text fw={500}>
        {isDragActive
          ? t`Drop the .tgz here`
          : t`Drag a .tgz here, or click to browse`}
      </Text>
      <Text c="text-secondary" size="sm">
        {t`Up to 5 MB`}
      </Text>
    </>
  );
}

function SelectedFile({ file }: { file: File }) {
  return (
    <>
      <Icon name="document" size={24} c="brand" />
      <Text fw={500}>{file.name}</Text>
      <Text c="text-secondary" size="sm">
        {(file.size / 1024).toFixed(1)} KB
      </Text>
    </>
  );
}

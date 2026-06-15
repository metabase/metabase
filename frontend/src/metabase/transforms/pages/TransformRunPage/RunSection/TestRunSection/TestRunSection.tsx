import { parse } from "csv-parse/browser/esm/sync";
import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import { t } from "ttag";

import {
  useGetTransformTestRunInputsQuery,
  useTestRunTransformMutation,
} from "metabase/api";
import {
  Alert,
  Box,
  Button,
  Group,
  Icon,
  Loader,
  Stack,
  Text,
  TextInput,
  Title,
} from "metabase/ui";
import type {
  TestRunInput,
  TestRunResponse,
  TransformId,
  TransformTestRunDiff,
} from "metabase-types/api";

import S from "./TestRunSection.module.css";

type TestRunSectionProps = {
  transformId: TransformId;
};

const EXPECTED_KEY = "expected";

const PREVIEW_MAX_ROWS = 8;

type CsvPreview = {
  headers: string[];
  rows: string[][];
  totalRows: number;
  error: boolean;
};

export function TestRunSection({ transformId }: TestRunSectionProps) {
  const {
    data: inputs,
    isLoading: isLoadingInputs,
    error: inputsError,
  } = useGetTransformTestRunInputsQuery(transformId);

  if (isLoadingInputs) {
    return (
      <Box p="lg">
        <Loader size="sm" />
      </Box>
    );
  }

  if (inputsError) {
    return (
      <Box p="lg">
        <TestRunHeader />
        <Alert color="error" icon={<Icon name="warning" />} mt="md">
          {getErrorMessage(inputsError)}
        </Alert>
      </Box>
    );
  }

  return (
    <Box p="lg">
      <TestRunHeader />
      <TestRunForm transformId={transformId} inputs={inputs ?? []} />
    </Box>
  );
}

function TestRunHeader() {
  return (
    <Stack gap={4} mb="md">
      <Title order={4}>{t`Test run`}</Title>
      <Text c="text-secondary">
        {t`Upload fixture CSVs for each input table and an expected-output CSV to check this transform without touching real data.`}
      </Text>
    </Stack>
  );
}

type TestRunFormProps = {
  transformId: TransformId;
  inputs: TestRunInput[];
};

function TestRunForm({ transformId, inputs }: TestRunFormProps) {
  const [files, setFiles] = useState<Record<string, File>>({});
  const [ignoreColumns, setIgnoreColumns] = useState("");
  const [result, setResult] = useState<TestRunResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const [testRunTransform, { isLoading: isRunning }] =
    useTestRunTransformMutation();

  const setFile = useCallback((key: string, file: File | null) => {
    setFiles((prev) => {
      const next = { ...prev };
      if (file) {
        next[key] = file;
      } else {
        delete next[key];
      }
      return next;
    });
  }, []);

  const allInputsFilled = inputs.every(
    (input) => files[`input-${input.table_id}`] != null,
  );
  const expectedFilled = files[EXPECTED_KEY] != null;
  const canRun = allInputsFilled && expectedFilled && !isRunning;

  const handleRun = async () => {
    setResult(null);
    setRunError(null);

    const formData = new FormData();
    inputs.forEach((input) => {
      const file = files[`input-${input.table_id}`];
      if (file) {
        formData.append(`input-${input.table_id}`, file);
      }
    });
    const expectedFile = files[EXPECTED_KEY];
    if (expectedFile) {
      formData.append(EXPECTED_KEY, expectedFile);
    }

    const ignoreList = ignoreColumns
      .split(",")
      .map((column) => column.trim())
      .filter((column) => column.length > 0);
    if (ignoreList.length > 0) {
      formData.append(
        "options",
        JSON.stringify({ ignore_columns: ignoreList }),
      );
    }

    const { data, error } = await testRunTransform({ transformId, formData });
    if (error) {
      setRunError(getErrorMessage(error));
    } else if (data) {
      setResult(data);
    }
  };

  return (
    <Stack gap="md">
      {inputs.map((input) => (
        <FileDropzone
          key={input.table_id}
          label={t`Input table: ${input.name}`}
          hint={t`Columns: ${input.columns.join(", ")}`}
          file={files[`input-${input.table_id}`] ?? null}
          inputTestId={`input-file-${input.table_id}`}
          onChange={(file) => setFile(`input-${input.table_id}`, file)}
        />
      ))}

      <FileDropzone
        label={t`Expected output`}
        hint={t`The CSV your transform should produce.`}
        file={files[EXPECTED_KEY] ?? null}
        inputTestId="expected-file"
        onChange={(file) => setFile(EXPECTED_KEY, file)}
      />

      <TextInput
        label={t`Ignore columns`}
        description={t`Comma-separated column names to exclude from the comparison (e.g. timestamps).`}
        placeholder={t`snapshot_ts, created_at`}
        value={ignoreColumns}
        onChange={(event) => setIgnoreColumns(event.currentTarget.value)}
      />

      <Group>
        <Button
          variant="filled"
          disabled={!canRun}
          loading={isRunning}
          onClick={handleRun}
        >
          {isRunning ? t`Running…` : t`Run test`}
        </Button>
      </Group>

      {runError && (
        <Alert color="error" icon={<Icon name="warning" />}>
          {runError}
        </Alert>
      )}

      {result && <TestRunResult result={result} />}
    </Stack>
  );
}

type FileDropzoneProps = {
  label: string;
  hint?: string;
  file: File | null;
  inputTestId: string;
  onChange: (file: File | null) => void;
};

function FileDropzone({
  label,
  hint,
  file,
  inputTestId,
  onChange,
}: FileDropzoneProps) {
  const [preview, setPreview] = useState<CsvPreview | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onChange(acceptedFiles[0]);
      }
    },
    [onChange],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    accept: { "text/csv": [".csv"] },
  });

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const fail = () => {
      if (!cancelled) {
        setPreview({ headers: [], rows: [], totalRows: 0, error: true });
      }
    };
    const reader = new FileReader();
    reader.onload = () => {
      if (cancelled) {
        return;
      }
      try {
        const records = parse(String(reader.result ?? ""), {
          skip_empty_lines: true,
          relax_column_count: true,
        }) as string[][];
        const [headers = [], ...rows] = records;
        setPreview({
          headers,
          rows: rows.slice(0, PREVIEW_MAX_ROWS),
          totalRows: rows.length,
          error: false,
        });
      } catch {
        fail();
      }
    };
    reader.onerror = fail;
    reader.readAsText(file);
    return () => {
      cancelled = true;
    };
  }, [file]);

  const rootClassName = [
    S.dropzone,
    isDragActive ? S.dropzoneActive : "",
    file ? S.dropzoneFilled : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Box>
      <Text fw="bold" mb={4}>
        {label}
      </Text>
      {hint && (
        <Text c="text-secondary" fz="sm" mb={4}>
          {hint}
        </Text>
      )}
      <Box {...getRootProps()} className={rootClassName}>
        <input {...getInputProps()} data-testid={inputTestId} />
        {file ? (
          <Group gap="xs">
            <Icon name="check" c="success" />
            <Text>{file.name}</Text>
          </Group>
        ) : (
          <Text c="text-secondary">{t`Drag a CSV here, or click to choose a file.`}</Text>
        )}
      </Box>
      {file && preview && <CsvPreviewTable preview={preview} />}
    </Box>
  );
}

function CsvPreviewTable({ preview }: { preview: CsvPreview }) {
  if (preview.error) {
    return (
      <Text c="text-secondary" fz="sm" mt={4}>
        {t`Couldn't preview this file.`}
      </Text>
    );
  }

  const hiddenRows = preview.totalRows - preview.rows.length;

  return (
    <Box>
      <Box className={S.previewWrapper}>
        <table className={S.resultTable}>
          <thead>
            <tr>
              {preview.headers.map((header, index) => (
                <th key={index}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Box>
      {hiddenRows > 0 && (
        <Text c="text-secondary" fz="sm" mt={4}>
          {t`+${hiddenRows} more rows`}
        </Text>
      )}
    </Box>
  );
}

type TestRunResultProps = {
  result: TestRunResponse;
};

function TestRunResult({ result }: TestRunResultProps) {
  if (result.status === "error") {
    return (
      <Alert color="error" icon={<Icon name="warning" />}>
        {result.error?.message ?? t`The test run failed.`}
      </Alert>
    );
  }

  if (result.status === "passed") {
    return <PassedResult diff={result.diff} />;
  }

  return <FailedResult diff={result.diff} />;
}

function PassedResult({ diff }: { diff?: TransformTestRunDiff }) {
  const rowCounts = diff?.["row-counts"];
  return (
    <Alert color="success" icon={<Icon name="check" />} title={t`Test passed`}>
      {rowCounts
        ? t`The output matched. Rows — actual: ${rowCounts.actual}, expected: ${rowCounts.expected}.`
        : t`The output matched the expected CSV.`}
    </Alert>
  );
}

function FailedResult({ diff }: { diff?: TransformTestRunDiff }) {
  if (!diff) {
    return (
      <Alert
        color="error"
        icon={<Icon name="warning" />}
        title={t`Test failed`}
      >
        {t`The output did not match the expected CSV.`}
      </Alert>
    );
  }

  const columnIssues = diff["column-issues"];
  const missingRows = diff["missing-rows"];
  const extraRows = diff["extra-rows"];
  const cellMismatches = diff["cell-mismatches"];
  const rowCounts = diff["row-counts"];

  return (
    <Stack gap="md">
      <Alert
        color="error"
        icon={<Icon name="warning" />}
        title={t`Test failed`}
      >
        {t`The output did not match. Rows — actual: ${rowCounts.actual}, expected: ${rowCounts.expected}.`}
      </Alert>

      {columnIssues.length > 0 && (
        <Box>
          <Text fw="bold" mb={4}>{t`Column issues`}</Text>
          <Stack gap={2}>
            {columnIssues.map((issue, index) => (
              <Text key={index} c="error">
                {issue.type === "missing"
                  ? t`Missing column: ${issue["column-name"]}`
                  : t`Unexpected column: ${issue["column-name"]}`}
              </Text>
            ))}
          </Stack>
        </Box>
      )}

      {cellMismatches.length > 0 && (
        <Box>
          <Text fw="bold" mb={4}>{t`Cell mismatches`}</Text>
          <table className={S.resultTable}>
            <thead>
              <tr>
                <th>{t`Column`}</th>
                <th>{t`Expected`}</th>
                <th>{t`Actual`}</th>
              </tr>
            </thead>
            <tbody>
              {cellMismatches.map((mismatch, index) => (
                <tr key={index}>
                  <td>{mismatch.column}</td>
                  <td>{mismatch["expected-canonical"]}</td>
                  <td>{mismatch["actual-canonical"]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
      )}

      <RowListTable
        title={t`Missing rows (expected but not produced)`}
        rows={missingRows}
      />
      <RowListTable
        title={t`Extra rows (produced but not expected)`}
        rows={extraRows}
      />

      {diff.truncated > 0 && (
        <Text c="text-secondary" fz="sm">
          {t`+${diff.truncated} more not shown`}
        </Text>
      )}
    </Stack>
  );
}

type RowListTableProps = {
  title: string;
  rows: string[][];
};

function RowListTable({ title, rows }: RowListTableProps) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <Box>
      <Text fw="bold" mb={4}>
        {title}
      </Text>
      <table className={S.resultTable}>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  );
}

function getErrorMessage(error: unknown): string {
  const fallback = t`Something went wrong.`;
  if (typeof error !== "object" || error === null) {
    return fallback;
  }
  const data = "data" in error ? error.data : undefined;
  if (typeof data === "object" && data !== null) {
    if (
      "error" in data &&
      typeof data.error === "object" &&
      data.error !== null &&
      "message" in data.error &&
      typeof data.error.message === "string"
    ) {
      return data.error.message;
    }
    if ("message" in data && typeof data.message === "string") {
      return data.message;
    }
  }
  return fallback;
}

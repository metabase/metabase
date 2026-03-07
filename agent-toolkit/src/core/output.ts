export interface OutputOptions {
  fields?: string[];
  maxRows?: number;
}

export interface OutputMeta {
  truncated: boolean;
  total_count?: number;
  returned_count?: number;
}

export function applyFieldMask(
  data: Record<string, unknown>,
  fields: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    if (field in data) {
      result[field] = data[field];
    }
  }
  return result;
}

export function applyFieldMaskToArray(
  data: Record<string, unknown>[],
  fields: string[],
): Record<string, unknown>[] {
  return data.map((item) => applyFieldMask(item, fields));
}

export function truncateRows(
  rows: unknown[][],
  maxRows: number,
): { rows: unknown[][]; meta: OutputMeta } {
  const total = rows.length;
  const truncated = total > maxRows;
  return {
    rows: truncated ? rows.slice(0, maxRows) : rows,
    meta: {
      truncated,
      total_count: total,
      returned_count: truncated ? maxRows : total,
    },
  };
}

export function formatOutput(data: unknown, opts?: OutputOptions): string {
  if (opts?.fields && typeof data === "object" && data !== null) {
    if (Array.isArray(data)) {
      data = applyFieldMaskToArray(
        data as Record<string, unknown>[],
        opts.fields,
      );
    } else {
      data = applyFieldMask(data as Record<string, unknown>, opts.fields);
    }
  }
  return JSON.stringify(data, null, 2);
}

export function printResult(data: unknown, opts?: OutputOptions): void {
  process.stdout.write(formatOutput(data, opts) + "\n");
}

export function printError(error: unknown): void {
  if (error && typeof error === "object" && "toJSON" in error) {
    process.stderr.write(
      JSON.stringify((error as { toJSON: () => unknown }).toJSON(), null, 2) +
        "\n",
    );
  } else if (error instanceof Error) {
    process.stderr.write(
      JSON.stringify({ error: "error", message: error.message }, null, 2) +
        "\n",
    );
  } else {
    process.stderr.write(JSON.stringify({ error: "error", message: String(error) }, null, 2) + "\n");
  }
  process.exitCode = 1;
}

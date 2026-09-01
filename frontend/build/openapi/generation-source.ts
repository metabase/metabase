import { createHash } from "node:crypto";

export type OpenApiEdition = "oss" | "ee";

export interface GenerationSource {
  edition: OpenApiEdition;
  specHash: string;
  generatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getOpenApiEdition(
  specContents: string,
): OpenApiEdition | undefined {
  try {
    const document: unknown = JSON.parse(specContents);
    if (
      !isRecord(document) ||
      typeof document.openapi !== "string" ||
      !isRecord(document.paths)
    ) {
      return undefined;
    }

    return Object.keys(document.paths).some((path) =>
      path.startsWith("/api/ee/"),
    )
      ? "ee"
      : "oss";
  } catch {
    return undefined;
  }
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalizeJson(value[key])]),
    );
  }
  return value;
}

export function createSpecHash(specContents: string): string {
  const document: unknown = JSON.parse(specContents);
  const canonicalDocument = JSON.stringify(canonicalizeJson(document));
  const hash = createHash("sha256").update(canonicalDocument).digest("hex");
  return `sha256:${hash}`;
}

export function parseGenerationSource(
  contents: string,
): GenerationSource | undefined {
  try {
    const source: unknown = JSON.parse(contents);
    if (
      !isRecord(source) ||
      (source.edition !== "oss" && source.edition !== "ee") ||
      typeof source.specHash !== "string" ||
      typeof source.generatedAt !== "string"
    ) {
      return undefined;
    }

    return {
      edition: source.edition,
      specHash: source.specHash,
      generatedAt: source.generatedAt,
    };
  } catch {
    return undefined;
  }
}

export function createGenerationSource(
  edition: OpenApiEdition,
  specContents: string,
  generatedAt = new Date(),
): GenerationSource {
  return {
    edition,
    specHash: createSpecHash(specContents),
    generatedAt: generatedAt.toISOString(),
  };
}

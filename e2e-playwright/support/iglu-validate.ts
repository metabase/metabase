/**
 * Iglu schema validation for captured Snowplow payloads.
 *
 * This closes the one gap the ports have carried since `search-snowplow`:
 * `H.expectNoBadSnowplowEvents` is really "ask snowplow-micro which events
 * FAILED Iglu validation". Without micro, both capture mechanisms could only
 * degrade it to a structural check (did the payload decode into a well-formed
 * self-describing envelope), which cannot catch the thing it exists to catch —
 * a payload whose shape drifted from its declared schema.
 *
 * The schemas micro validates against are the same ones vendored in this repo
 * at `snowplow/iglu-client-embedded/schemas/<vendor>/<name>/jsonschema/<version>`,
 * so we can do the validation locally with `ajv`.
 *
 * Two deliberate limits, stated rather than papered over:
 *
 *  1. **Unstruct event bodies only.** Micro also validates each attached
 *     *context* (Metabase always attaches `iglu:com.metabase/instance/...`).
 *     Contexts arrive base64-encoded under a separate `cx`/`co` field and are
 *     not decoded here.
 *  2. **`ajv` is not a declared dependency of this package.** It resolves by
 *     walking up to the repo root's `node_modules` (CI installs those — the job
 *     runs `bun run build-pure:cljs` before the Playwright steps). If it ever
 *     stops resolving, `validateIgluPayloads` reports that explicitly via
 *     `available: false` and the caller falls back to the old structural check
 *     rather than silently passing — the FINDINGS #49 shape is the thing to
 *     avoid here, not the missing dependency.
 */
import fs from "fs";
import path from "path";

const SCHEMA_ROOT = path.resolve(
  __dirname,
  "../../snowplow/iglu-client-embedded/schemas",
);

export type IgluFailure = {
  schema: string;
  reason: string;
};

export type IgluValidationResult = {
  /** False when ajv or the schema tree could not be loaded at all. */
  available: boolean;
  /** Why validation is unavailable, when it is. */
  unavailableReason?: string;
  failures: IgluFailure[];
};

/** `iglu:com.metabase/instance_stats/jsonschema/2-0-0` -> its file path. */
function schemaPathFor(schemaUri: string): string | null {
  const match = /^iglu:([^/]+)\/([^/]+)\/jsonschema\/(.+)$/.exec(schemaUri);
  if (!match) {
    return null;
  }
  const [, vendor, name, version] = match;
  return path.join(SCHEMA_ROOT, vendor, name, "jsonschema", version);
}

type AjvValidator = (data: unknown) => boolean;

let ajvInstance: unknown;
let ajvLoadError: string | undefined;

function loadAjv(): { Ajv?: new (options: unknown) => unknown; error?: string } {
  try {
    // Runtime require, not a static import: `ajv` is resolved from the repo
    // root rather than this package, and a hard import would make the whole
    // support module unloadable if that ever stops working.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("ajv");
    return { Ajv: mod.default ?? mod };
  } catch (error) {
    return { error: `ajv could not be loaded: ${String(error)}` };
  }
}

const validatorCache = new Map<string, AjvValidator | null>();

function validatorFor(schemaUri: string): AjvValidator | null {
  if (validatorCache.has(schemaUri)) {
    return validatorCache.get(schemaUri) ?? null;
  }
  const file = schemaPathFor(schemaUri);
  if (!file || !fs.existsSync(file)) {
    validatorCache.set(schemaUri, null);
    return null;
  }
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<
    string,
    unknown
  >;
  // Iglu schemas declare `$schema` as the self-describing METASCHEMA and carry
  // a `self` block of Iglu coordinates. Neither is JSON Schema ajv can resolve,
  // and both are metadata rather than constraints — drop them and validate the
  // rest, which is plain JSON Schema.
  delete raw.$schema;
  delete raw.self;

  const ajv = ajvInstance as {
    compile: (schema: unknown) => AjvValidator & { errors?: unknown };
  };
  const validate = ajv.compile(raw);
  validatorCache.set(schemaUri, validate);
  return validate;
}

/**
 * Validate decoded self-describing payloads against their declared Iglu
 * schemas. An event whose schema is not vendored in this repo is reported as a
 * failure, not skipped: micro would reject it too, and silently passing unknown
 * schemas would reintroduce exactly the blind spot this function exists to
 * remove.
 */
export function validateIgluPayloads(
  events: { schema: string; data: unknown }[],
): IgluValidationResult {
  if (!ajvInstance && !ajvLoadError) {
    const { Ajv, error } = loadAjv();
    if (!Ajv) {
      ajvLoadError = error ?? "ajv unavailable";
    } else {
      // strict:false — the vendored schemas use draft-04-era keywords ajv's
      // strict mode rejects as unknown; they are still meaningful constraints
      // under the default draft-07 dialect.
      ajvInstance = new Ajv({ strict: false, allErrors: true, validateFormats: false });
    }
  }
  if (ajvLoadError) {
    return { available: false, unavailableReason: ajvLoadError, failures: [] };
  }
  if (!fs.existsSync(SCHEMA_ROOT)) {
    return {
      available: false,
      unavailableReason: `Iglu schema tree not found at ${SCHEMA_ROOT}`,
      failures: [],
    };
  }

  const failures: IgluFailure[] = [];
  for (const event of events) {
    let validate: AjvValidator | null;
    try {
      validate = validatorFor(event.schema);
    } catch (error) {
      failures.push({
        schema: event.schema,
        reason: `schema failed to compile: ${String(error)}`,
      });
      continue;
    }
    if (!validate) {
      failures.push({
        schema: event.schema,
        reason: "no such schema in snowplow/iglu-client-embedded",
      });
      continue;
    }
    if (!validate(event.data)) {
      const errors = (validate as unknown as { errors?: unknown[] }).errors;
      failures.push({
        schema: event.schema,
        reason: JSON.stringify(errors).slice(0, 1024),
      });
    }
  }
  return { available: true, failures };
}

import { trackSchemaEvent } from "metabase/lib/analytics";
import type { ExportFormatType } from "metabase/sharing/components/PublicLinkPopover/types";

import type {
  DisplayTheme,
  EmbedResource,
  EmbedResourceType,
  EmbeddingDisplayOptions,
  EmbeddingParameterVisibility,
} from "./types";

const SCHEMA_NAME = "embed_flow";

// We changed the UI to `Look and Feel` now
type Appearance = {
  background: boolean;
  titled: boolean;
  bordered: boolean;
  theme: DisplayTheme;
  font: "instance" | "custom";
  downloads: boolean | null;
};

export const trackStaticEmbedDiscarded = ({
  artifact,
}: {
  artifact: EmbedResourceType;
}): void => {
  trackSchemaEvent(SCHEMA_NAME, {
    event: "static_embed_discarded",
    artifact,
  });
};

export const trackStaticEmbedPublished = ({
  artifact,
  resource,
  params,
  isExampleDashboard,
}: {
  artifact: EmbedResourceType;
  resource: EmbedResource;
  params: Record<EmbeddingParameterVisibility, number>;
  isExampleDashboard: boolean;
}): void => {
  const now = Date.now();
  trackSchemaEvent(SCHEMA_NAME, {
    event: "static_embed_published",
    artifact,
    new_embed: !resource.initially_published_at,
    time_since_creation: toSecond(
      now - new Date(resource.created_at).getTime(),
    ),
    time_since_initial_publication: resource.initially_published_at
      ? toSecond(now - new Date(resource.initially_published_at).getTime())
      : null,
    params,
    is_example_dashboard: isExampleDashboard,
  });
};

function toSecond(milliseconds: number) {
  return Math.round(milliseconds / 1000);
}

export const trackStaticEmbedUnpublished = ({
  artifact,
  resource,
}: {
  artifact: EmbedResourceType;
  resource: EmbedResource;
}): void => {
  const now = Date.now();
  trackSchemaEvent(SCHEMA_NAME, {
    event: "static_embed_unpublished",
    artifact,
    time_since_creation: toSecond(
      now - new Date(resource.created_at).getTime(),
    ),
    time_since_initial_publication: resource.initially_published_at
      ? toSecond(now - new Date(resource.initially_published_at).getTime())
      : null,
  });
};

export const trackStaticEmbedCodeCopied = ({
  artifact,
  language,
  location,
  code,
  displayOptions,
}: {
  artifact: EmbedResourceType;
  language: string;
  location: "code_overview" | "code_params" | "code_appearance";
  code: "backend" | "view";
  displayOptions: EmbeddingDisplayOptions;
}): void => {
  trackSchemaEvent(SCHEMA_NAME, {
    event: "static_embed_code_copied",
    artifact,
    language,
    location,
    code,
    appearance: normalizeAppearance(displayOptions),
  });
};

function normalizeAppearance(
  displayOptions: EmbeddingDisplayOptions,
): Appearance {
  return {
    background: displayOptions.background,
    titled: displayOptions.titled,
    bordered: displayOptions.bordered,
    theme: displayOptions.theme ?? "light",
    font: displayOptions.font ? "custom" : "instance",
    downloads: displayOptions.downloads,
  };
}

export const trackPublicLinkCopied = ({
  artifact,
  format = null,
}: {
  artifact: EmbedResourceType;
  format?: ExportFormatType | null;
}): void => {
  trackSchemaEvent(SCHEMA_NAME, {
    event: "public_link_copied",
    artifact,
    format: format as any, // ExportFormatType is untyped
  });
};

export const trackPublicEmbedCodeCopied = ({
  artifact,
  source,
}: {
  artifact: EmbedResourceType;
  source: "public-embed" | "public-share";
}): void => {
  trackSchemaEvent(SCHEMA_NAME, {
    event: "public_embed_code_copied",
    artifact,
    source,
  });
};

export const trackPublicLinkRemoved = ({
  artifact,
  source,
}: {
  artifact: EmbedResourceType;
  source: "public-embed" | "public-share";
}): void => {
  trackSchemaEvent(SCHEMA_NAME, {
    event: "public_link_removed",
    artifact,
    source,
  });
};

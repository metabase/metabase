import type { ExportFormatType } from "metabase/dashboard/components/PublicLinkPopover/types";
import { trackSchemaEvent } from "metabase/lib/analytics";
import type { EmbedResource, EmbedResourceType } from "./types";

const SCHEMA_NAME = "embed_flow";
const SCHEMA_VERSION = "1-0-0";

type Appearance = {
  title: boolean;
  border: boolean;
  theme: "light" | "dark" | "transparent";
  font: "instance" | "custom";
  hide_download_button: boolean;
};

export const trackStaticEmbedDiscarded = ({
  artifact,
}: {
  artifact: EmbedResourceType;
}): void => {
  trackSchemaEvent(SCHEMA_NAME, SCHEMA_VERSION, {
    event: "static_embed_discarded",
    artifact,
  });
};

export const trackStaticEmbedPublished = ({
  artifact,
  resource,
  params,
}: {
  artifact: EmbedResourceType;
  resource: EmbedResource;
  params: Record<string, number>;
}): void => {
  const now = Date.now();
  trackSchemaEvent(SCHEMA_NAME, SCHEMA_VERSION, {
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
  trackSchemaEvent(SCHEMA_NAME, SCHEMA_VERSION, {
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
  appearance,
}: {
  artifact: EmbedResourceType;
  language: string;
  location: "code_overview" | "code_params" | "code_appearance";
  appearance: Appearance;
}): void => {
  trackSchemaEvent(SCHEMA_NAME, SCHEMA_VERSION, {
    event: "static_embed_code_copied",
    artifact,
    language,
    location,
    appearance,
  });
};

export const trackPublicLinkCopied = ({
  artifact,
  format = null,
}: {
  artifact: EmbedResourceType;
  format?: ExportFormatType | null;
}): void => {
  trackSchemaEvent(SCHEMA_NAME, SCHEMA_VERSION, {
    event: "public_link_copied",
    artifact,
    format,
  });
};

export const trackPublicEmbedCodeCopied = ({
  artifact,
  source,
}: {
  artifact: EmbedResourceType;
  source: "public-embed" | "public-share";
}): void => {
  trackSchemaEvent(SCHEMA_NAME, SCHEMA_VERSION, {
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
  trackSchemaEvent(SCHEMA_NAME, SCHEMA_VERSION, {
    event: "public_link_removed",
    artifact,
    source,
  });
};

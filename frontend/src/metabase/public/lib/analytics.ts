import type { ExportFormatType } from "metabase/dashboard/components/PublicLinkPopover/types";
import { trackSchemaEvent } from "metabase/lib/analytics";
import type { EmbedResourceType } from "metabase/public/components/EmbedModal";

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
  new_embed,
  params,
}: {
  artifact: EmbedResourceType;
  new_embed: boolean;
  params: Record<string, number>;
}): void => {
  trackSchemaEvent(SCHEMA_NAME, SCHEMA_VERSION, {
    event: "static_embed_published",
    artifact,
    new_embed,
    params,
  });
};

export const trackStaticEmbedUnpublished = ({
  artifact,
  initially_published_at,
}: {
  artifact: EmbedResourceType;
  initially_published_at: string | null;
}): void => {
  trackSchemaEvent(SCHEMA_NAME, SCHEMA_VERSION, {
    event: "static_embed_unpublished",
    artifact,
    initially_published_at,
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

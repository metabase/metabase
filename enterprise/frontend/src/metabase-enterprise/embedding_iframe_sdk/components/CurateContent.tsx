import type { SdkIframeEmbedSettings } from "../types/embed";

interface CurateContentProps {
  settings: SdkIframeEmbedSettings & { template: "curate-content" };
}

export const CurateContent = (_props: CurateContentProps) => null;

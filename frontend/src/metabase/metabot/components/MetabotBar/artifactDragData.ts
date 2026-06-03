import type { CardId } from "metabase-types/api";

export const ARTIFACT_DND_MIME = "application/x-metabase-artifact";

export type ArtifactDragData = {
  model: "card";
  id: CardId;
};

export function setArtifactDragData(
  dataTransfer: DataTransfer,
  data: ArtifactDragData,
): void {
  dataTransfer.setData(ARTIFACT_DND_MIME, JSON.stringify(data));
  // graceful fallback for foreign drop targets (e.g. a browser tab / address bar)
  dataTransfer.setData("text/plain", `/question/${data.id}`);
  dataTransfer.effectAllowed = "copy";
}

export function isArtifactDrag(dataTransfer: DataTransfer | null): boolean {
  return Boolean(dataTransfer?.types?.includes(ARTIFACT_DND_MIME));
}

export function readArtifactDragData(
  dataTransfer: DataTransfer | null,
): ArtifactDragData | null {
  const raw = dataTransfer?.getData(ARTIFACT_DND_MIME);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.model === "card" && typeof parsed.id === "number") {
      return { model: "card", id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

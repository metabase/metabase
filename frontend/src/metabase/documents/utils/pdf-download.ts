import { openSaveDialog } from "metabase/lib/dom";

export async function downloadDocumentAsPdf(
  documentId: number,
  documentName: string,
): Promise<void> {
  const response = await fetch(`/api/document/${documentId}/pdf`, {
    method: "GET",
    credentials: "same-origin",
  });

  if (!response.ok) {
    throw new Error(`PDF export failed: ${response.statusText}`);
  }

  const blob = await response.blob();
  const safeName = documentName.replace(/[^\w\s-]/g, "").trim() || "document";
  openSaveDialog(`${safeName}.pdf`, blob);
}

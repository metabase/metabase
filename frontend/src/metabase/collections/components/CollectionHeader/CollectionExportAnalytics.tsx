import { useState } from "react";
import { t } from "ttag";

import { Box, Text, Tooltip } from "metabase/ui";

import { CollectionHeaderButton } from "./CollectionHeader.styled";

export function CollectionExportAnalytics() {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);

      // Call the export API endpoint
      const response = await fetch("/api/ee/audit-app/analytics-dev/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Export failed");
      }

      // Get the filename from Content-Disposition header
      const contentDisposition = response.headers.get("Content-Disposition");
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || "analytics-export.tar.gz";

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Failed to export analytics:", error);
      // TODO: Show error toast
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Tooltip
      label={
        <Box ta="center">
          <Text size="sm" c="var(--mb-color-tooltip-text)">
            {t`Export analytics content`}
          </Text>
          <Text size="sm" c="var(--mb-color-tooltip-text-secondary)">
            {t`Download as .tar.gz for local development`}
          </Text>
        </Box>
      }
      position="bottom"
    >
      <span>
        <CollectionHeaderButton
          aria-label={t`Export analytics`}
          icon="download"
          iconSize={20}
          onClick={handleExport}
          disabled={isExporting}
        />
      </span>
    </Tooltip>
  );
}

import { t } from "ttag";

import type { EmbeddingDisplayOptions } from "metabase/public/lib/types";
import { Stack, Switch } from "metabase/ui";

import { DisplayOptionSection } from "./StaticEmbedSetupPane.styled";

interface DownloadSettingsProps {
  displayOptions: EmbeddingDisplayOptions;
  onChangeDisplayOptions: (displayOptions: EmbeddingDisplayOptions) => void;
}

export const DashboardDownloadSettings = ({
  displayOptions,
  onChangeDisplayOptions,
}: DownloadSettingsProps) => {
  if (!displayOptions.downloads) {
    return null;
  }

  const { pdf, results } = displayOptions.downloads;

  return (
    <DisplayOptionSection title={t`Downloads`}>
      <Stack gap="md" mt="md">
        <Switch
          label={t`Export to PDF`}
          labelPosition="left"
          size="sm"
          variant="stretch"
          checked={pdf}
          onChange={(e) => {
            onChangeDisplayOptions({
              ...displayOptions,
              downloads: { pdf: e.target.checked, results },
            });
          }}
        />

        <Switch
          label={t`Results (csv, xlsx, json, png)`}
          labelPosition="left"
          size="sm"
          variant="stretch"
          checked={results}
          onChange={(e) => {
            onChangeDisplayOptions({
              ...displayOptions,
              downloads: { pdf, results: e.target.checked },
            });
          }}
        />
      </Stack>
    </DisplayOptionSection>
  );
};

export const QuestionDownloadSettings = ({
  displayOptions,
  onChangeDisplayOptions,
}: DownloadSettingsProps) => {
  if (!displayOptions.downloads) {
    return null;
  }

  return (
    <Switch
      label={t`Download (csv, xlsx, json, png)`}
      labelPosition="left"
      size="sm"
      variant="stretch"
      checked={displayOptions.downloads.results}
      onChange={(e) => {
        const newValue = e.target.checked;
        onChangeDisplayOptions({
          ...displayOptions,
          downloads: {
            results: newValue,
            pdf: newValue, // PDF exports are not supported for questions, so we use the same value for both.
          },
        });
      }}
    />
  );
};

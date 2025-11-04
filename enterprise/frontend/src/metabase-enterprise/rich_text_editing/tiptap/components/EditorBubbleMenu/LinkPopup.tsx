import { useState } from "react";
import { t } from "ttag";

import { ActionIcon, Box, FixedSizeIcon, Flex, TextInput } from "metabase/ui";

interface LinkPopupProps {
  initialUrl: string;
  onSubmit: (url: string) => void;
  onCancel: () => void;
}

export const LinkPopup = ({
  initialUrl,
  onSubmit,
  onCancel,
}: LinkPopupProps) => {
  const [url, setUrl] = useState(initialUrl);

  const handleSubmit = () => {
    let processedUrl = url.trim();

    // FIXME: This keeps prepending more and more https://'s
    if (processedUrl) {
      // Check if it looks like a valid URL (contains a dot and doesn't start with special characters)
      if (/^[a-zA-Z0-9].*\.[a-zA-Z]{2,}/.test(processedUrl)) {
        processedUrl = `https://${processedUrl}`;
      }
    }

    onSubmit(processedUrl);
    setUrl("");
  };

  const handleCancel = () => {
    onCancel();
    setUrl("");
  };

  return (
    <Flex align="center" gap={4}>
      <Box style={{ flexGrow: 1 }}>
        <TextInput
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t`Enter URL...`}
          size="sm"
          onKeyDown={(e) => {
            // TODO: We should be able to use a form element here
            if (e.key === "Enter") {
              handleSubmit();
            } else if (e.key === "Escape") {
              handleCancel();
            }
          }}
          autoFocus
        />
      </Box>
      {/* TODO: Add aria labels and/or tooltips */}
      <Box c="var(--mb-color-text-primary)">
        <ActionIcon c="inherit" onClick={handleSubmit}>
          <FixedSizeIcon name="check" />
        </ActionIcon>
        <ActionIcon c="inherit" onClick={() => onSubmit("")}>
          <FixedSizeIcon name="trash" />
        </ActionIcon>
        <ActionIcon c="inherit" onClick={handleCancel}>
          <FixedSizeIcon name="ellipsis" />
        </ActionIcon>
      </Box>
    </Flex>
  );
};

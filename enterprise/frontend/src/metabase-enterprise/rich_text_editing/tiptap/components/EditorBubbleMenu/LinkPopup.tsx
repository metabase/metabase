import { useState } from "react";
import { t } from "ttag";

import { Box, Button, Flex, TextInput } from "metabase/ui";

interface LinkPopupProps {
  isOpen: boolean;
  initialUrl: string;
  onSubmit: (url: string) => void;
  onCancel: () => void;
}

export const LinkPopup = ({
  isOpen,
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

  if (!isOpen) {
    return null;
  }

  return (
    <Box
      bg="var(--mb-color-bg-white)"
      bd="1px solid var(--mb-color-border)"
      bdrs="sm"
      p="xs"
      style={{
        boxShadow: "0 2px 12px var(--mb-color-shadow)",
      }}
    >
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
        <Button size="sm" onClick={handleSubmit}>
          {t`OK`}
        </Button>
        <Button size="sm" variant="subtle" onClick={handleCancel}>
          {t`Cancel`}
        </Button>
      </Flex>
    </Box>
  );
};

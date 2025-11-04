import { useEffect, useRef, useState } from "react";
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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUrl(initialUrl);
    const input = inputRef.current;
    if (!input) {
      return;
    }
    // TODO: There's gotta be a better way to do this
    const observer = new IntersectionObserver(() => input.select());
    observer.observe(input);
    return () => observer.disconnect();
  }, [initialUrl]);

  const handleSubmit = () => {
    let processedUrl = url.trim();

    if (!processedUrl.startsWith("/") && processedUrl.includes(".")) {
      const hasProtocol = /^\S+:\/\//.test(processedUrl);
      if (!hasProtocol) {
        const isEmailLike = /^\S+@\S+$/.test(processedUrl);
        if (!isEmailLike) {
          processedUrl = `https://${processedUrl}`;
        } else if (!processedUrl.startsWith("mailto:")) {
          processedUrl = `mailto:${processedUrl}`;
        }
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
          ref={inputRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t`Enter URL...`}
          size="sm"
          miw="18rem"
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
      <Box c="var(--mb-color-text-secondary)">
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

import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { processUrl } from "metabase/documents/utils/processUrl";
import {
  ActionIcon,
  Box,
  FixedSizeIcon,
  Flex,
  TextInput,
  Tooltip,
} from "metabase/ui";

interface LinkPopupProps {
  initialUrl: string;
  onSubmit: (url: string) => void;
  onCancel: () => void;
}

export const LinkEditor = ({
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
    // Something strange happens in BubbleMenu. select() doesn't take unless you put it in an IntersectionObserver.
    const observer = new IntersectionObserver(() => input.select());
    observer.observe(input);
    return () => observer.disconnect();
  }, [initialUrl]);

  const handleSubmit = () => {
    onSubmit(processUrl(url) ?? "");
    setUrl("");
  };

  const handleCancel = () => {
    onCancel();
    setUrl("");
  };

  return (
    <Flex align="center" gap="xs">
      <Box style={{ flexGrow: 1 }}>
        <TextInput
          ref={inputRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t`Enter URL...`}
          size="xs"
          styles={{ input: { fontSize: "0.875rem" } }}
          miw="18rem"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSubmit();
            } else if (e.key === "Escape") {
              handleCancel();
            }
          }}
          autoFocus
        />
      </Box>
      <Box c="text-secondary">
        <Tooltip label={t`Save`}>
          <ActionIcon c="inherit" onClick={handleSubmit}>
            <FixedSizeIcon name="check" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t`Remove link`}>
          <ActionIcon c="inherit" onClick={() => onSubmit("")}>
            <FixedSizeIcon name="trash" />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t`Formatting`}>
          <ActionIcon c="inherit" onClick={handleCancel}>
            <FixedSizeIcon name="ellipsis" />
          </ActionIcon>
        </Tooltip>
      </Box>
    </Flex>
  );
};

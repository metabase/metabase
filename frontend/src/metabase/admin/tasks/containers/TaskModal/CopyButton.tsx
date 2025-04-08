import { useRef, useState } from "react";
import CopyToClipboard from "react-copy-to-clipboard";
import { t } from "ttag";

import { Button, Icon, Text, Tooltip } from "metabase/ui";

interface Props {
  text: CopyToClipboard.Props["text"];
}

export const CopyButton = ({ text }: Props) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const timeoutIdRef = useRef<number>();

  const handleCopy = () => {
    setShowTooltip(true);

    window.clearTimeout(timeoutIdRef.current);
    timeoutIdRef.current = window.setTimeout(() => setShowTooltip(false), 2000);
  };

  return (
    <CopyToClipboard text={text} onCopy={handleCopy}>
      <Tooltip
        label={<Text c="white" fw={700}>{t`Copied!`}</Text>}
        opened={showTooltip}
      >
        <Button leftSection={<Icon name="copy" />}>{t`Copy`}</Button>
      </Tooltip>
    </CopyToClipboard>
  );
};

import { t } from "ttag";

import { Button, CopyButton, Icon } from "metabase/ui";

type Props = {
  snippet: string;
  onCopy?: () => void;
};

export const CopyCodeSnippetButton = ({ snippet, onCopy }: Props) => (
  <CopyButton value={snippet}>
    {({ copied, copy }: { copied: boolean; copy: () => void }) => (
      <Button
        leftSection={<Icon name="copy" size={16} />}
        onClick={() => {
          copy();
          onCopy?.();
        }}
      >
        {copied ? t`Copied!` : t`Copy code`}
      </Button>
    )}
  </CopyButton>
);

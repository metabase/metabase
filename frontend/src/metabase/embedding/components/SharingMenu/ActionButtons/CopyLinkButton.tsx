import { t } from "ttag";

import { Button, CopyButton, Icon } from "metabase/ui";

import { COPY_TIMEOUT_MS } from "../LinkCopiedTooltipLabel";

import S from "./CopyLinkButton.module.css";

export function CopyLinkButton({ url }: { url: string }) {
  return (
    <CopyButton value={url} timeout={COPY_TIMEOUT_MS}>
      {({ copied, copy }) => (
        <Button
          variant="filled"
          h="2rem"
          px="md"
          py="sm"
          leftSection={
            <Icon name={copied ? "verified_round" : "link"} aria-hidden />
          }
          onClick={copy}
        >
          <span
            className={S.labelStack}
            data-copy-label={t`Copy link`}
            data-copied-label={t`Copied`}
          >
            <span>{copied ? t`Copied` : t`Copy link`}</span>
          </span>
        </Button>
      )}
    </CopyButton>
  );
}

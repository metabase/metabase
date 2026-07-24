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
          <span className={S.labelStack}>
            <span style={{ visibility: copied ? "hidden" : undefined }}>
              {t`Copy link`}
            </span>
            <span style={{ visibility: copied ? undefined : "hidden" }}>
              {t`Copied`}
            </span>
          </span>
        </Button>
      )}
    </CopyButton>
  );
}

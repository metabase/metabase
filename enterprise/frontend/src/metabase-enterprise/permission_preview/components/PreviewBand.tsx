import { jt, t } from "ttag";

import { Badge, Button, Flex, Icon, Text, Tooltip } from "metabase/ui";

import { AddressBox } from "./AddressBox";
import { GroupPreviewInfo } from "./GroupPreviewInfo";
import S from "./PreviewBand.module.css";
import { PreviewedUserName } from "./PreviewedUserName";
import type { PreviewTarget } from "./types";

interface PreviewBandProps {
  target: PreviewTarget;
  isStarted: boolean;
  linkText: string;
  onOpenLink: (item: string, linkText: string) => void;
  onGoHome: () => void;
  isExplainOpen: boolean;
  onToggleExplain: () => void;
}

export function PreviewBand({
  target,
  isStarted,
  linkText,
  onOpenLink,
  onGoHome,
  isExplainOpen,
  onToggleExplain,
}: PreviewBandProps) {
  return (
    <div className={S.band} role="status" aria-label={t`Previewing as`}>
      <div className={S.who}>
        <Flex align="center" gap="sm">
          <Icon name="eye" c="text-primary" />
          <Text fw="bold" c="text-primary">
            {isStarted ? getSentence(target) : t`Starting the preview…`}
          </Text>
        </Flex>
        <Tooltip
          label={t`Nothing you change here is saved. Previews are recorded in the audit log.`}
        >
          <Badge variant="outline" color="neutral">{t`Read-only`}</Badge>
        </Tooltip>
        {target.kind === "group" && <GroupPreviewInfo group={target.group} />}
      </div>
      <div className={S.controls}>
        <Tooltip label={t`Back to all collections`}>
          <Button
            className={S.bandButton}
            aria-label={t`Back to all collections`}
            leftSection={<Icon name="home" />}
            onClick={onGoHome}
          />
        </Tooltip>
        <AddressBox linkText={linkText} onOpen={onOpenLink} />
        <Button
          className={S.bandButton}
          variant={isExplainOpen ? "light" : "default"}
          aria-pressed={isExplainOpen}
          disabled={!isStarted}
          onClick={onToggleExplain}
        >
          {t`Explain access`}
        </Button>
      </div>
    </div>
  );
}

function getSentence(target: PreviewTarget) {
  return target.kind === "user"
    ? jt`Previewing as ${<PreviewedUserName key="name" user={target.user} />}`
    : t`Previewing as a member of ${target.group.name}`;
}

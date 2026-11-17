import { useMediaQuery } from "@mantine/hooks";
import type { ReactNode } from "react";
import { jt, t } from "ttag";

import { Banner } from "metabase/common/components/Banner";
import { Badge, Box, Button, Flex, Icon, Text, Tooltip } from "metabase/ui";

import S from "./PreviewBand.module.css";
import { PreviewedUserName } from "./PreviewedUserName";
import type { PrincipalType } from "./api";

/** Below the theme's `lg` breakpoint (1280px): tablets, and narrow windows. */
const NARROW_MEDIA_QUERY = "(max-width: 79.99em)";

type PreviewBandProps = {
  /** Troubleshoot's band sits inside the admin page; the full-screen one spans the top of the tab. */
  variant: "troubleshoot" | "full-screen";
  /** "Sandy Sales", "a member of Sales", "a user of Acme"; null while the preview starts. */
  whoName: string | null;
  /** A user preview's user, whose name opens a card with their email, groups and user attributes. */
  previewedUserId?: number;
  /** Before the eye icon: the full-screen band's "Preview settings". */
  leftSection?: ReactNode;
  /** Right after the sentence, outside its truncation: a group preview's "How group preview works". */
  sentenceSection?: ReactNode;
  /** After the sentence, in order. */
  children: ReactNode;
};

/**
 * Who the app is previewed as, the same on Troubleshoot and in full screen. In full screen, one line that never wraps,
 * where the sentence truncates first and the controls keep their size; on Troubleshoot, one line while it fits, else
 * two, with nothing cut.
 */
export function PreviewBand({
  variant,
  whoName,
  previewedUserId,
  leftSection,
  sentenceSection,
  children,
}: PreviewBandProps) {
  const whoSentence =
    whoName != null
      ? getWhoSentence(
          previewedUserId != null ? (
            <PreviewedUserName
              key="name"
              userId={previewedUserId}
              name={whoName}
            />
          ) : (
            whoName
          ),
        )
      : t`Starting the preview…`;

  if (variant === "troubleshoot") {
    return (
      <Banner
        role="status"
        aria-label={t`Previewing as`}
        bg="feedback-warning"
        px="md"
        py="xs"
        style={{ borderRadius: "var(--mantine-radius-md)" }}
        contentGroupProps={{
          className: S.wrapping,
          gap: "sm",
          flex: 1,
          miw: 0,
        }}
        body={
          <>
            <div className={S.who}>
              <Flex align="center" gap="sm">
                <Icon name="eye" c="text-primary" style={{ flexShrink: 0 }} />
                <Text fw="bold" c="text-primary">
                  {whoSentence}
                </Text>
              </Flex>
              {whoName != null && <ReadOnlyBadge />}
              {sentenceSection && (
                <div className={S.sentenceSection}>{sentenceSection}</div>
              )}
            </div>
            <div className={S.controls}>{children}</div>
          </>
        }
      />
    );
  }
  return (
    <Banner
      role="status"
      aria-label={t`Previewing as`}
      bg="feedback-warning"
      px="md"
      py="xs"
      contentGroupProps={{ gap: "sm", wrap: "nowrap", flex: 1, miw: 0 }}
      body={
        <>
          {leftSection}
          <Icon name="eye" c="text-primary" style={{ flexShrink: 0 }} />
          <Text
            fw="bold"
            c="text-primary"
            truncate
            miw={0}
            style={{ flexShrink: 1 }}
            title={whoName != null ? t`Previewing as ${whoName}` : undefined}
          >
            {whoSentence}
          </Text>
          {whoName != null && <ReadOnlyBadge />}
          {sentenceSection}
          {/* the badge stays beside the name, the buttons at the right end */}
          <Box flex={1} />
          {children}
        </>
      }
    />
  );
}

/** True below 1280px wide, where the bands show their compact controls and full screen starts with the panel closed. */
export function useIsNarrowPreview() {
  return useMediaQuery(NARROW_MEDIA_QUERY, undefined, {
    getInitialValueInEffect: false,
  });
}

/** True below 1280px wide, read once, for state that starts from the width (the panel starts closed on tablets). */
export function isNarrowPreview() {
  return window.matchMedia(NARROW_MEDIA_QUERY).matches;
}

type ExplainAccessButtonProps = {
  isOpen: boolean;
  /** An icon with a tooltip, so the band keeps "Previewing as <name>" on narrow screens. */
  isCompact: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export function ExplainAccessButton({
  isOpen,
  isCompact,
  disabled,
  onClick,
}: ExplainAccessButtonProps) {
  if (!isCompact) {
    return (
      <Button
        size="sm"
        style={{ flexShrink: 0 }}
        disabled={disabled}
        aria-pressed={isOpen}
        onClick={onClick}
      >
        {t`Explain access`}
      </Button>
    );
  }
  return (
    <Tooltip label={t`Explain access`}>
      <Button
        size="sm"
        style={{ flexShrink: 0 }}
        disabled={disabled}
        aria-label={t`Explain access`}
        aria-pressed={isOpen}
        leftSection={<Icon name="info" />}
        onClick={onClick}
      />
    </Tooltip>
  );
}

function getWhoSentence(whoName: ReactNode) {
  return jt`Previewing as ${whoName}`;
}

function ReadOnlyBadge() {
  return (
    <Tooltip
      label={t`Nothing you change here is saved. Previews are recorded in the audit log.`}
    >
      <Badge variant="outline" color="neutral" style={{ flexShrink: 0 }}>
        {t`Read-only`}
      </Badge>
    </Tooltip>
  );
}

/** Who the band names: "Sandy Sales", "a member of Sales", "a user of Acme". */
export function getPrincipalWhoName(
  principalType: PrincipalType,
  userName: string,
  principalName: string,
) {
  switch (principalType) {
    case "user":
      return userName;
    case "group":
      return t`a member of ${principalName}`;
    case "tenant":
      return t`a user of ${principalName}`;
  }
}

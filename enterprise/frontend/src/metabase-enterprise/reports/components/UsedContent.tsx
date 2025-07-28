import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { Box, Stack, Text } from "metabase/ui";

import { getEnrichedCardEmbeds } from "../selectors";

import type { CardEmbedRef } from "./Editor/types";
import styles from "./ReportPage.module.css";

interface UsedContentSidebarProps {
  onQuestionClick: (cardId: number) => void;
}

export const UsedContentSidebar = ({
  onQuestionClick,
}: UsedContentSidebarProps) => {
  const cardEmbeds = useSelector(getEnrichedCardEmbeds);
  return (
    <Box
      style={{
        height: "100%",
        overflow: "auto",
        backgroundColor: "var(--mb-color-bg-white)",
      }}
    >
      <Stack gap="md" p="md">
        <Box>
          <Text fw="bold" mb="md">
            {t`Used Content`}
          </Text>
          {cardEmbeds.length === 0 ? (
            <Text c="text.2">{t`No questions embedded yet`}</Text>
          ) : (
            <Stack gap="sm">
              {cardEmbeds.map((embed: CardEmbedRef) => (
                <Box
                  key={embed.id}
                  className={styles.cardEmbed}
                  onClick={() => onQuestionClick(embed.id)}
                >
                  <Text>{embed.name}</Text>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Stack>
    </Box>
  );
};

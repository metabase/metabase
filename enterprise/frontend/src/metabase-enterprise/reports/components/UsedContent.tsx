import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { Box, Stack, Text } from "metabase/ui";

import type { QuestionEmbed } from "../reports.slice";
import { getEnrichedQuestionEmbeds } from "../selectors";

import styles from "./ReportPage.module.css";

interface UsedContentSidebarProps {
  onQuestionClick: (questionId: number) => void;
}

export const UsedContentSidebar = ({
  onQuestionClick,
}: UsedContentSidebarProps) => {
  const questionEmbeds = useSelector(getEnrichedQuestionEmbeds);
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
          {questionEmbeds.length === 0 ? (
            <Text c="text.2">{t`No questions embedded yet`}</Text>
          ) : (
            <Stack gap="sm">
              {questionEmbeds.map((embed: QuestionEmbed) => (
                <Box
                  key={embed.id}
                  className={styles.questionRef}
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

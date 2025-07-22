import { t } from "ttag";

import { Box, Stack, Text } from "metabase/ui";

import styles from "./ReportPage.module.css";

interface UsedContentSidebarProps {
  questionRefs: Array<{ id: number; name: string }>;
  onQuestionClick: (questionId: number) => void;
}

export const UsedContentSidebar = ({
  questionRefs,
  onQuestionClick,
}: UsedContentSidebarProps) => {
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
          <Text fw="bold" mb="sm">
            {t`Used Content`}
          </Text>
          {questionRefs.length === 0 ? (
            <Text size="sm" c="text.2">
              {t`No questions embedded yet`}
            </Text>
          ) : (
            <Stack gap="xs">
              {questionRefs.map((ref) => (
                <Box
                  key={ref.id}
                  className={styles.questionRef}
                  onClick={() => onQuestionClick(ref.id)}
                >
                  <Text size="sm">{ref.name}</Text>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Stack>
    </Box>
  );
};

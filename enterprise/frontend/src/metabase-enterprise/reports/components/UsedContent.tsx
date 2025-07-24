import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { Box, Stack, Text } from "metabase/ui";

import { getEnrichedQuestionRefs } from "../selectors";

import styles from "./ReportPage.module.css";

interface UsedContentSidebarProps {
  onQuestionClick: (questionId: number) => void;
}

export const UsedContentSidebar = ({
  onQuestionClick,
}: UsedContentSidebarProps) => {
  const questionRefs = useSelector(getEnrichedQuestionRefs);
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
          {questionRefs.length === 0 ? (
            <Text c="text.2">{t`No questions embedded yet`}</Text>
          ) : (
            <Stack gap="sm">
              {questionRefs.map((ref) => (
                <Box
                  key={ref.id}
                  className={styles.questionRef}
                  onClick={() => onQuestionClick(ref.id)}
                >
                  <Text>{ref.name}</Text>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Stack>
    </Box>
  );
};

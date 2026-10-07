import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useListRevisionsQuery } from "metabase/api";
import { Button, Icon } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { QuestionVersionDiffModal } from "./QuestionVersionDiffModal";

interface CompareVersionsButtonProps {
  question: Question;
}

/**
 * Opens the SQL diff between two versions of a saved native question. Renders
 * nothing when there is nothing to compare.
 */
export function CompareVersionsButton({
  question,
}: CompareVersionsButtonProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const { data: revisions = [] } = useListRevisionsQuery({
    id: question.id(),
    entity: "card",
  });

  if (!question.isSaved() || !question.isNative() || revisions.length < 2) {
    return null;
  }

  return (
    <>
      <Button
        variant="default"
        size="compact-sm"
        leftSection={<Icon name="compare" />}
        onClick={open}
        mb="md"
        w="fit-content"
        data-testid="question-compare-versions-button"
      >
        {t`Compare versions`}
      </Button>
      <QuestionVersionDiffModal
        question={question}
        opened={opened}
        onClose={close}
      />
    </>
  );
}

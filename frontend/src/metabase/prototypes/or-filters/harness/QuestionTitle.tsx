import { t } from "ttag";

import { Box, Text, Title } from "metabase/ui";

import type { QuestionHeading } from "./heading";

type QuestionTitleProps = {
  heading: QuestionHeading;
};

/** The header's breadcrumb and title, with "Started from …" once a saved question is changed. */
export function QuestionTitle({ heading }: QuestionTitleProps) {
  return (
    <Box>
      <Text size="sm" fw="bold" c="text-secondary">
        {heading.startedFrom
          ? t`Sample Database / Orders · Started from ${heading.startedFrom}`
          : t`Sample Database / Orders`}
      </Text>
      <Title order={3} fz="1.25rem">
        {heading.title}
      </Title>
    </Box>
  );
}

import { Fragment, type ReactNode } from "react";
import { c } from "ttag";

import { SidesheetCardSection } from "metabase/common/components/Sidesheet";
import Link from "metabase/core/components/Link";
import { Box, Flex, Icon, type TextProps } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { useQuestionSourcesInfo } from "./utils";

export const QuestionSources = ({ question }: { question: Question }) => {
  /** This might be a table or the underlying question that the presently viewed question is based on */
  const sources = useQuestionSourcesInfo(question);
  if (!sources) {
    return null;
  }

  return (
    <SidesheetCardSection
      title={c(
        "This is a heading that appears above the names of the database, table, and/or question that a question is based on -- the 'sources' for the question. Feel free to translate this heading as though it said 'Based on these sources', if you think that would make more sense in your language.",
      ).t`Based on`}
    >
      <Flex gap="sm" align="flex-start">
        {sources.map(({ url, name, iconProps }) => (
          <Fragment key={url}>
            <Link to={url} variant="brand">
              <SourceFlex>
                <Box component={Icon} mt={2} c="text-dark" {...iconProps} />
                {name}
              </SourceFlex>
            </Link>
            <SourceFlex>{"/"}</SourceFlex>
          </Fragment>
        ))}
      </Flex>
    </SidesheetCardSection>
  );
};

const SourceFlex = ({
  children,
  ...props
}: { children: ReactNode } & TextProps) => (
  <Flex gap="sm" lh="1.25rem" maw="20rem" {...props}>
    {children}
  </Flex>
);

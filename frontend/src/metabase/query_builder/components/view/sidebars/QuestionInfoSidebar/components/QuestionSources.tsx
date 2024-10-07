import { Fragment, useMemo } from "react";
import { match } from "ts-pattern";
import { c } from "ttag";

import { SidesheetCardSection } from "metabase/common/components/Sidesheet";
import Link from "metabase/core/components/Link";
import { getIcon } from "metabase/lib/icon";
import { Box, Flex, FixedSizeIcon as Icon, type IconProps } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { getDataSourceParts } from "../../../ViewHeader/components/QuestionDataSource/utils";

interface QuestionSource {
  href: string;
  name: string;
  model?: string;
  iconProps: Omit<IconProps, "display">;
}

export const QuestionSources = ({ question }: { question: Question }) => {
  const sources = getDataSourceParts({
    question,
    subHead: false,
    isObjectDetail: true,
    formatTableAsComponent: false,
  }) as unknown as QuestionSource[];

  const sourcesWithIcons: QuestionSource[] = useMemo(() => {
    return sources.map(source => {
      const modelForIcon = match(source.model)
        .with("question", () => ({ model: "card" as const }))
        .with("model", () => ({ model: "dataset" as const }))
        .otherwise(() => ({ model: "table" as const }));
      const iconProps = getIcon(modelForIcon);
      return { ...source, iconProps };
    });
  }, [sources]);

  if (!sources.length) {
    return null;
  }

  const title = c(
    "This is a heading that appears above the names of the database, table, and/or question that a question is based on -- the 'sources' for the question. Feel free to translate this heading as though it said 'Based on these sources', if you think that would make more sense in your language.",
  ).t`Based on`;

  return (
    <SidesheetCardSection title={title}>
      <Flex gap="sm" align="flex-start">
        {sourcesWithIcons.map(({ href, name, iconProps }, index) => (
          <Fragment key={`${href}-${name}`}>
            <Link to={href} variant="brand">
              <Flex gap="sm" lh="1.25rem" maw="20rem">
                <Box component={Icon} mt={2} c="text-dark" {...iconProps} />
                {name}
              </Flex>
            </Link>
            {index < sources.length - 1 && <Flex lh="1.25rem">{"/"}</Flex>}
          </Fragment>
        ))}
      </Flex>
    </SidesheetCardSection>
  );
};

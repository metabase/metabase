import { Fragment, useMemo } from "react";
import { c } from "ttag";

import Link from "metabase/common/components/Link";
import { SidesheetCardSection } from "metabase/common/components/Sidesheet";
import { getIcon } from "metabase/lib/icon";
import { useSelector } from "metabase/lib/redux";
import { getQuestionWithoutComposing } from "metabase/query_builder/selectors";
import { Flex, FixedSizeIcon as Icon } from "metabase/ui";

import { getDataSourceParts } from "../../../ViewHeader/components/QuestionDataSource/utils";

import type { QuestionSource } from "./types";

export const QuestionSources = () => {
  /** Retrieve current question from the Redux store */
  const underlyingQuestion = useSelector(getQuestionWithoutComposing);

  const sourcesWithIcons: QuestionSource[] = useMemo(() => {
    const sources = underlyingQuestion
      ? (getDataSourceParts({
          question: underlyingQuestion,
          subHead: false,
          isObjectDetail: true,
          formatTableAsComponent: false,
        }) as QuestionSource[]) // note: this type cast is horrendous
      : [];
    return sources.map((source) => ({
      ...source,
      iconProps: getIcon({ model: source.model ?? "card" }),
    }));
  }, [underlyingQuestion]);

  if (!underlyingQuestion || !sourcesWithIcons.length) {
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
                {iconProps ? (
                  <Icon mt={2} c="text-primary" {...iconProps} />
                ) : null}
                {name}
              </Flex>
            </Link>
            {index < sourcesWithIcons.length - 1 && (
              <Flex lh="1.25rem">{"/"}</Flex>
            )}
          </Fragment>
        ))}
      </Flex>
    </SidesheetCardSection>
  );
};

import { t } from "ttag";

import { useDatabaseListQuery } from "metabase/common/hooks";
import Link from "metabase/core/components/Link";
import type { FlexProps } from "metabase/ui";
import { Flex, Text } from "metabase/ui";

import {
  BrowseAppRoot,
  BrowseContainer,
  BrowseDataHeader,
  BrowseMain,
  LearnAboutDataIcon,
} from "./BrowseApp.styled";
import { BrowseDatabases } from "./BrowseDatabases";
import { BrowseHeaderIconContainer } from "./BrowseHeader.styled";

export const BrowseApp = ({ children }: { children?: React.ReactNode }) => {
  const databasesResult = useDatabaseListQuery();
  return (
    <BrowseAppRoot data-testid="browse-app">
      <BrowseContainer>
        <BrowseDataHeader>
          <BrowseSection>
            <h2>{t`Browse data`}</h2>
            <LearnAboutDataLink />
          </BrowseSection>
        </BrowseDataHeader>
        <BrowseMain>
          <BrowseSection direction="column">
            <BrowseContent databasesResult={databasesResult}>
              {children}
            </BrowseContent>
          </BrowseSection>
        </BrowseMain>
      </BrowseContainer>
    </BrowseAppRoot>
  );
};

const BrowseContent = ({
  children,
  databasesResult,
}: {
  children?: React.ReactNode;
  databasesResult: ReturnType<typeof useDatabaseListQuery>;
}) => {
  if (children) {
    return <>{children}</>;
  } else {
    return <BrowseDatabases databasesResult={databasesResult} />;
  }

  return <BrowseDatabases databasesResult={databasesResult} />;
};
const LearnAboutDataLink = () => (
  <Flex ml="auto" justify="right" align="center" style={{ flexBasis: "40.0%" }}>
    <Link to="reference">
      <BrowseHeaderIconContainer>
        <LearnAboutDataIcon size={14} name="reference" />
        <Text size="md" lh="1" fw="bold" ml=".5rem" c="inherit">
          {t`Learn about our data`}
        </Text>
      </BrowseHeaderIconContainer>
    </Link>
  </Flex>
);

const BrowseSection = (props: FlexProps) => (
  <Flex maw="64rem" m="0 auto" w="100%" {...props} />
);

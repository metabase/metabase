import cx from "classnames";
import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { useListDatabasesQuery } from "metabase/api";
import { BrowseAddDataButton } from "metabase/browse/components/BrowseAddDataButton";
import { EmptyState } from "metabase/common/components/EmptyState";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Flex } from "metabase/ui";
import CS from "metabase/css/core/index.css";
import { getEngineLogo } from "metabase/databases/utils/engine";
import { useSelector } from "metabase/redux";
import { Link } from "metabase/router";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Flex, Group, Stack, Text, Title } from "metabase/ui";
import * as Urls from "metabase/urls";

import { BrowseCard } from "../components/BrowseCard";
import S from "../components/BrowseContainer.module.css";
import { BrowseDataHeader } from "../components/BrowseDataHeader";
import { BrowseGrid } from "../components/BrowseGrid";

export const BrowseDatabases = () => {
  const { data, isLoading, error } = useListDatabasesQuery();
  const databases = data?.data;

  if (error) {
    return <LoadingAndErrorWrapper error />;
  }

  if (!databases && isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (!databases?.length) {
    return (
      <Flex
        className={S.browseContainer}
        flex={1}
        direction="column"
        wrap="nowrap"
        pt="md"
      >
        <BrowseDataHeader headerAction={<BrowseAddDataButton />} />
        <EmptyState
          className={S.centeredEmptyState}
          title={<Flex mb="sm">{t`No databases here yet`}</Flex>}
          illustrationElement={
            <Flex mb="sm">
              <img src={NoResults} alt="" />
            </Flex>
          }
        />
      </Flex>
    );
  }

  return (
    <Flex
      className={S.browseContainer}
      flex={1}
      direction="column"
      wrap="nowrap"
      pt="md"
    >
      <BrowseDataHeader headerAction={<BrowseAddDataButton />} />
      <Flex className={S.browseMain} direction="column" wrap="nowrap" flex={1}>
        <Flex maw="64rem" mx="auto" w="100%" direction="column">
          <BrowseGrid data-testid="database-browser">
            {databases.map((database) => (
              <BrowseCard
                to={Urls.browseDatabase(database)}
                key={database.id}
                title={database.name}
                icon="database"
                size="lg"
              />
            ))}
          </BrowseGrid>
        </Flex>
      </Flex>
    </Flex>
  );
};

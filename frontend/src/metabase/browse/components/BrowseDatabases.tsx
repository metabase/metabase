import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import { useListDatabasesQuery } from "metabase/api";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import * as Urls from "metabase/lib/urls";
import { Box, Icon, Title, Button } from "metabase/ui";
import { push } from "react-router-redux";
import { useDispatch } from "metabase/lib/redux";
import {
  BrowseContainer,
  BrowseMain,
  BrowseSection,
  CenteredEmptyState,
} from "./BrowseContainer.styled";
import { BrowseDataHeader } from "./BrowseDataHeader";
import {
  DatabaseCard,
  DatabaseCardLink,
  DatabaseGrid,
} from "./BrowseDatabases.styled";

export const BrowseDatabases = () => {
  const dispatch = useDispatch();
  const { data, isLoading, error } = useListDatabasesQuery();
  const databases = data?.data;

  if (error) {
    return <LoadingAndErrorWrapper error />;
  }

  if (!databases && isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  const filteredDatabases = databases?.filter(
    database => database.is_cube === false,
  );

  if (!filteredDatabases?.length) {
    return (
      <CenteredEmptyState
        title={<Box mb=".5rem">{t`No databases here yet`}</Box>}
        illustrationElement={
          <>
            <Box mb=".5rem">
              <img src={NoResults} />
            </Box>
            <Button
              variant="filled"
              onClick={() => {
                dispatch(push("/browse/databases/connections"));
              }}
            >
              {t`Add connection`}
            </Button>
          </>
        }
      />
    );
  }

  return (
    <BrowseContainer>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem",
          width: "100%",
          maxWidth: "68rem",
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        <BrowseDataHeader />
        <Button
          variant="filled"
          onClick={() => {
            dispatch(push("/browse/databases/connections"));
          }}
        >
          {t`Add connection`}
        </Button>
      </div>
      <BrowseMain>
        <BrowseSection>
          <DatabaseGrid data-testid="database-browser">
            {filteredDatabases.map(database => (
              <div key={database.id}>
                <DatabaseCardLink to={Urls.browseDatabase(database)}>
                  <DatabaseCard>
                    <Icon
                      name="database"
                      color={color("accent2")}
                      className={CS.mb3}
                      size={32}
                    />
                    <Title order={2} size="1rem" lh="1rem" color="inherit">
                      {database.name}
                    </Title>
                  </DatabaseCard>
                </DatabaseCardLink>
              </div>
            ))}
          </DatabaseGrid>
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
};

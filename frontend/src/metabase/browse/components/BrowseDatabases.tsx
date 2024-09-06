import { t } from "ttag";

import NoResults from "assets/img/no_results.svg";
import {
  useListDatabaseSchemasQuery,
  useListDatabasesQuery,
} from "metabase/api";
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
import {
  EngineCardIcon,
  EngineCardImage,
  EngineCardRoot,
  EngineCardTitle,
} from "metabase/databases/components/DatabaseEngineField/DatabaseEngineWidget.styled";
import { getEngineLogo } from "metabase/databases/utils/engine";

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

  // Filter databases
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
          paddingRight: "2rem",
        }}
      >
        <div
          style={{ display: "flex", justifyContent: "start", width: "100%" }}
        >
          <BrowseDataHeader />
        </div>
        <div style={{ display: "flex", justifyContent: "end", width: "100%" }}>
          <Button
            style={{ backgroundColor: "#223800", border: "1px solid #223800" }}
            variant="filled"
            onClick={() => {
              dispatch(push("/browse/databases/connections"));
            }}
          >
            {t`Add connection`}
          </Button>
        </div>
      </div>
      <BrowseMain>
        <BrowseSection>
          <DatabaseGrid data-testid="database-browser">
            {filteredDatabases.map((database: any) => {
              const logo = getEngineLogo(database.engine);
              return (
                <div key={database.id}>
                  <EngineCardRoot
                    role="option"
                    id={`database-option-${database.id}`}
                    isActive={false}
                    onClick={() => {
                      // Navigate to the route to display schemas
                      dispatch(
                        push(`/browse/databases/${database.id}/schemas`),
                      );
                    }}
                  >
                    {logo ? (
                      <EngineCardImage
                        src={logo}
                        alt={`${database.engine} logo`}
                      />
                    ) : (
                      <EngineCardIcon name="database" />
                    )}
                    <EngineCardTitle>{database.name}</EngineCardTitle>
                  </EngineCardRoot>
                </div>
              );
            })}
          </DatabaseGrid>
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
};

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
} from "./CompanyContainer.styled";
import { CompanyHeader } from "./CompanyHeader";
import {
  DatabaseCard,
  DatabaseCardLink,
  DatabaseGrid,
} from "./CompanyCards.styled";
import {
  EngineCardIcon,
  EngineCardImage,
  EngineCardRoot,
  EngineCardTitle,
} from "metabase/databases/components/DatabaseEngineField/DatabaseEngineWidget.styled";
import { getEngineLogo } from "metabase/databases/utils/engine";

export const SettingsDatabases = () => {
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
          flexDirection: "column",
          alignItems: "center",
          marginBottom: "1rem",
          width: "100%",
          paddingRight: "2rem",
          gap: "2rem",
        }}
      >
        <div
          style={{ display: "flex", justifyContent: "start", width: "100%" }}
        >
          <CompanyHeader title={"Databases"} icon={"database"} />
        </div>
      </div>
      <BrowseMain>
        <BrowseSection>
          <DatabaseGrid data-testid="database-browser">
            {filteredDatabases.map((database: any) => {
              // Get the logo for each database engine
              const logo = getEngineLogo(database.engine);

              return (
                <div key={database.id}>
                  <EngineCardRoot
                    role="option"
                    id={`database-option-${database.id}`} // Provide a unique ID or use an appropriate function to generate this ID
                    isActive={false}
                    onClick={() => {
                      // Use push method to navigate to the database URL
                      dispatch(push(`/settings/databases/${database.id}`));
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
            <div>
              <EngineCardRoot
                role="button"
                isActive={false}
                onClick={() => {
                  dispatch(push("/browse/databases/connections"));
                }}
                style={{
                  cursor: "pointer",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Icon name="add" size={24} color="#587330" />
              </EngineCardRoot>
            </div>
          </DatabaseGrid>
        </BrowseSection>
      </BrowseMain>
    </BrowseContainer>
  );
};
